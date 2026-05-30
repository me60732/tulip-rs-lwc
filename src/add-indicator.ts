/**
 * addIndicator — the single public entry point for adding tulip-rs indicators
 * to a Lightweight Charts v5 chart.
 *
 * Routes to either:
 *   - OverlayPrimitive  (ISeriesPrimitive attached to the candlestick series)
 *     for indicators whose `displayType` is "Overlay"
 *   - OscillatorHandle  (LineSeries / HistogramSeries in a dedicated pane)
 *     for all other indicators
 */
import type {
  IChartApi,
  ISeriesApi,
  SeriesOptionsMap,
} from "lightweight-charts";
import * as ti from "tulip-rs-wasm";
import type { Indicator, IndicatorInfo } from "tulip-rs-wasm";
import { OverlayPrimitive } from "./overlays/overlay-primitive.js";
import { HorizontalPrimitive } from "./overlays/horizontal-primitive.js";
import { OscillatorHandle } from "./oscillators/oscillator-handle.js";
import { getPaneManager } from "./pane-manager.js";
import { getPricePaneLegend } from "./helpers/price-pane-legend.js";
import type { LegendEntry } from "./helpers/price-pane-legend.js";
import {
  SERIES_COLORS,
  DEFAULT_LINE_WIDTH,
  DOT_RENDER_INDICATORS,
  DEFAULT_DOT_RADIUS,
  PSAR_UP_COLOR,
  PSAR_DOWN_COLOR,
  HORIZONTAL_LINE_INDICATORS,
  PIVOT_POINT_COLORS,
} from "./constants.js";
import type {
  AddIndicatorOptions,
  IndicatorHandle,
  OhlcvBar,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get the display type of the primary (first) output group. */
function getPrimaryDisplayType(info: IndicatorInfo): string {
  return info.displayGroups[0]?.displayType ?? "Indicator";
}

/**
 * Build overlay legend entries from outputs + enabled optionals.
 * For PSAR-style dynamic-color dot indicators, pass `upColor`/`downColor`
 * to get a two-entry ▲/▼ legend instead of the default output-color list.
 */
function buildOverlayLegendEntries(
  info: IndicatorInfo,
  colors: string[],
  optionalMask: boolean[] | null | undefined,
  upColor: string | null,
  downColor: string | null,
): LegendEntry[] {
  // Dot indicators with directional colouring (e.g. PSAR) — show ▲/▼ pair
  if (upColor && downColor) {
    return [
      { name: `${info.outputs[0]} ▲`, color: upColor },
      { name: `${info.outputs[0]} ▼`, color: downColor },
    ];
  }
  // Standard: one entry per primary output, then each enabled optional
  const entries: LegendEntry[] = info.outputs.map((name, i) => ({
    name,
    color: colors[i] ?? SERIES_COLORS[i % SERIES_COLORS.length],
  }));
  if (optionalMask) {
    let ci = info.outputs.length;
    optionalMask.forEach((enabled, i) => {
      if (!enabled) return;
      entries.push({
        name: info.optionalOutputs[i],
        color: colors[ci] ?? SERIES_COLORS[ci % SERIES_COLORS.length],
      });
      ci++;
    });
  }
  return entries;
}

// ── addIndicator ──────────────────────────────────────────────────────────────

/**
 * Add a tulip-rs technical indicator to a Lightweight Charts v5 chart.
 *
 * @param chart        The LWC `IChartApi` instance.
 * @param sourceSeries The candlestick (or other price) series used as the
 *                     attachment point for overlay primitives and as the Y-axis
 *                     price scale reference.
 * @param name         Indicator name, lower-case (e.g. `'sma'`, `'rsi'`, `'bbands'`).
 *                     All 70 tulip-rs indicators are supported except `'candlestick'`.
 * @param data         Full OHLCV dataset.  Must include `volume` for volume-based
 *                     indicators (AD, OBV, MFI, KVO, ADOSC, EMV, NVI, PVI, VWMA, VOSC).
 * @param options      Numeric indicator options in the same order as `indicator.info.options`
 *                     (e.g. `[20]` for SMA period, `[20, 2]` for BBands period + stddev).
 * @param addOptions   Visual and pane configuration (colors, fillBand, lineWidth, paneIndex).
 * @returns            An {@link IndicatorHandle} with `remove()`, `setData()`, `appendBar()`.
 *
 * @example
 * ```ts
 * import { init, addIndicator } from 'tulip-rs-lwc';
 * await init();
 *
 * // Overlay — SMA drawn on the price chart
 * const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
 *
 * // Band overlay — BBands with fill
 * const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
 *   colors:   ['#ef5350', '#2196F3', '#ef5350'],
 *   fillBand: true,
 * });
 *
 * // Oscillator — RSI in its own pane
 * const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);
 *
 * // Streaming — O(1) per bar, no history reprocessing
 * candles.update(newBar);
 * sma.appendBar(newBar);
 * rsi.appendBar(newBar);
 *
 * // Clean up
 * sma.remove();
 * ```
 */
export function addIndicator(
  chart: IChartApi,
  sourceSeries: ISeriesApi<keyof SeriesOptionsMap>,
  name: string,
  data: OhlcvBar[],
  options: number[],
  addOptions: AddIndicatorOptions = {},
): IndicatorHandle {
  if (name === "candlestick") {
    throw new Error(
      "tulip-rs-lwc: the candlestick indicator returns pattern objects, not numeric series, " +
        "and is not supported by addIndicator().",
    );
  }

  const indicator = (ti as unknown as Record<string, Indicator | undefined>)[
    name
  ];
  if (!indicator) {
    throw new Error(
      `tulip-rs-lwc: unknown indicator "${name}". ` +
        'Check the spelling — names are lower-case (e.g. "sma", "rsi", "bbands").',
    );
  }

  const info = indicator.info;
  const primaryDisplayType = getPrimaryDisplayType(info);
  const colors = addOptions.colors ?? [...SERIES_COLORS];
  const lineWidth = addOptions.lineWidth ?? DEFAULT_LINE_WIDTH;

  // True when every display group is "Overlay" (e.g. SMA, EMA, BBands).
  // Mixed-type indicators (e.g. VIDYA — Overlay primary but Indicator stddev
  // groups) must go through OscillatorHandle so each group is routed correctly.
  const isPureOverlay =
    primaryDisplayType === "Overlay" &&
    info.displayGroups.every((g) => g.displayType === "Overlay");

  // ── Horizontal price levels (e.g. Pivot Point) ────────────────────────────
  // Must be checked before the generic overlay path since pivitpoint is also
  // classified as DisplayType::Overlay in the Rust metadata.
  if (HORIZONTAL_LINE_INDICATORS.has(name)) {
    const levelColors = addOptions.colors ?? [...PIVOT_POINT_COLORS];
    const labels = [...info.outputs];
    const primitive = new HorizontalPrimitive(
      indicator,
      data,
      options,
      levelColors,
      labels,
    );
    sourceSeries.attachPrimitive(primitive);
    return {
      remove() {
        sourceSeries.detachPrimitive(primitive);
      },
      setData(newData: OhlcvBar[]) {
        primitive.setData(newData);
      },
      appendBar(bar: OhlcvBar) {
        primitive.appendBar(bar);
      },
    };
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  if (isPureOverlay) {
    const renderStyle =
      addOptions.renderStyle ??
      (DOT_RENDER_INDICATORS.has(name) ? "dots" : "line");
    const dotRadius = addOptions.dotRadius ?? DEFAULT_DOT_RADIUS;
    // For dot-style overlays that use directional colouring (e.g. PSAR),
    // auto-apply green/red based on whether the value is above or below the
    // bar's close price.  The caller can override via `upColor`/`downColor`.
    const useDynColor =
      DOT_RENDER_INDICATORS.has(name) && renderStyle === "dots";
    const upColor = useDynColor
      ? (addOptions.upColor ?? PSAR_UP_COLOR)
      : (addOptions.upColor ?? null);
    const downColor = useDynColor
      ? (addOptions.downColor ?? PSAR_DOWN_COLOR)
      : (addOptions.downColor ?? null);
    const primitive = new OverlayPrimitive(
      indicator,
      data,
      options,
      colors,
      addOptions.fillBand ?? false,
      addOptions.optionalOutputMask ?? null,
      renderStyle,
      dotRadius,
      upColor,
      downColor,
    );

    sourceSeries.attachPrimitive(primitive);

    const legendKey: object = {};
    getPricePaneLegend(chart).add(
      legendKey,
      buildOverlayLegendEntries(
        info,
        colors,
        addOptions.optionalOutputMask,
        upColor,
        downColor,
      ),
    );

    return {
      remove() {
        sourceSeries.detachPrimitive(primitive);
        getPricePaneLegend(chart).remove(legendKey);
      },
      setData(newData: OhlcvBar[]) {
        primitive.setData(newData);
      },
      appendBar(bar: OhlcvBar) {
        primitive.appendBar(bar);
      },
    };
  }

  // ── Volume overlay ─────────────────────────────────────────────────────────
  // For indicators whose primary display type is "Volume" (overlaid on the
  // volume bars panel rather than the price chart or a separate pane).
  // Currently no indicator has this as its primary type, but we handle it
  // for future-proofing.
  if (primaryDisplayType === "Volume") {
    const volumeSeries = addOptions.volumeSeries ?? null;
    if (!volumeSeries) {
      console.warn(
        `tulip-rs-lwc: "${name}" has primary display type "Volume" but ` +
          `no volumeSeries was provided in addOptions — indicator skipped.`,
      );
      return { remove() {}, setData() {}, appendBar() {} };
    }
    const primitive = new OverlayPrimitive(
      indicator,
      data,
      options,
      colors,
      addOptions.fillBand ?? false,
      addOptions.optionalOutputMask ?? null,
      "line",
      DEFAULT_DOT_RADIUS,
      null,
      null,
    );
    volumeSeries.attachPrimitive(primitive);
    return {
      remove() {
        volumeSeries.detachPrimitive(primitive);
      },
      setData(newData: OhlcvBar[]) {
        primitive.setData(newData);
      },
      appendBar(bar: OhlcvBar) {
        primitive.appendBar(bar);
      },
    };
  }

  // ── Oscillator ───────────────────────────────────────────────────────────────────
  const paneManager = getPaneManager(chart);
  const handle = new OscillatorHandle(
    chart,
    sourceSeries,
    indicator,
    data,
    options,
    paneManager,
    addOptions.paneIndex ?? null, // forcedPrimaryPaneIndex
    colors,
    lineWidth,
    addOptions.optionalOutputMask ?? null,
    addOptions.volumeSeries ?? null,
  );

  return {
    remove() {
      handle.remove();
    },
    setData(newData: OhlcvBar[]) {
      handle.setData(newData);
    },
    appendBar(bar: OhlcvBar) {
      handle.appendBar(bar);
    },
  };
}
