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
import type { Indicator } from "tulip-rs-wasm";
import { OverlayPrimitive } from "./overlays/overlay-primitive.js";
import { HorizontalPrimitive } from "./overlays/horizontal-primitive.js";
import { OscillatorHandle } from "./oscillators/oscillator-handle.js";
import { getPaneManager } from "./pane-manager.js";
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

function isOverlay(displayType: string): boolean {
  return displayType.toLowerCase() === "overlay";
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
  const colors = addOptions.colors ?? [...SERIES_COLORS];
  const lineWidth = addOptions.lineWidth ?? DEFAULT_LINE_WIDTH;

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
  if (isOverlay(info.displayType)) {
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

  // ── Oscillator ─────────────────────────────────────────────────────────────
  const paneManager = getPaneManager(chart);
  const paneIndex = addOptions.paneIndex ?? paneManager.allocate();

  const handle = new OscillatorHandle(
    chart,
    sourceSeries,
    indicator,
    data,
    options,
    paneIndex,
    colors,
    lineWidth,
    addOptions.optionalOutputMask ?? null,
  );

  return {
    remove() {
      handle.remove();
      // Only release if we allocated the pane ourselves.
      if (addOptions.paneIndex === undefined) {
        paneManager.release(paneIndex);
      }
    },
    setData(newData: OhlcvBar[]) {
      handle.setData(newData);
    },
    appendBar(bar: OhlcvBar) {
      handle.appendBar(bar);
    },
  };
}
