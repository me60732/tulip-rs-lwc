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
import type { IChartApi, ISeriesApi, SeriesOptionsMap } from 'lightweight-charts';
import * as ti from 'tulip-rs-wasm';
import type { Indicator } from 'tulip-rs-wasm';
import { OverlayPrimitive } from './overlays/overlay-primitive.js';
import { OscillatorHandle } from './oscillators/oscillator-handle.js';
import { getPaneManager } from './pane-manager.js';
import { SERIES_COLORS, DEFAULT_LINE_WIDTH } from './constants.js';
import type { AddIndicatorOptions, IndicatorHandle, OhlcvBar } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverlay(displayType: string): boolean {
  return displayType.toLowerCase() === 'overlay';
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
  chart:        IChartApi,
  sourceSeries: ISeriesApi<keyof SeriesOptionsMap>,
  name:         string,
  data:         OhlcvBar[],
  options:      number[],
  addOptions:   AddIndicatorOptions = {},
): IndicatorHandle {
  if (name === 'candlestick') {
    throw new Error(
      'tulip-rs-lwc: the candlestick indicator returns pattern objects, not numeric series, ' +
      'and is not supported by addIndicator().',
    );
  }

  const indicator = (ti as unknown as Record<string, Indicator | undefined>)[name];
  if (!indicator) {
    throw new Error(`tulip-rs-lwc: unknown indicator "${name}". ` +
      'Check the spelling — names are lower-case (e.g. "sma", "rsi", "bbands").');
  }

  const info      = indicator.info;
  const colors    = addOptions.colors    ?? [...SERIES_COLORS];
  const lineWidth = addOptions.lineWidth ?? DEFAULT_LINE_WIDTH;

  // ── Overlay ────────────────────────────────────────────────────────────────
  if (isOverlay(info.displayType)) {
    const primitive = new OverlayPrimitive(
      indicator,
      data,
      options,
      colors,
      addOptions.fillBand ?? false,
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
  const paneIndex   = addOptions.paneIndex ?? paneManager.allocate();

  const handle = new OscillatorHandle(
    chart,
    indicator,
    data,
    options,
    paneIndex,
    colors,
    lineWidth,
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
