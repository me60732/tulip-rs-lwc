/**
 * addCandlestickPatterns — add tulip-rs candlestick pattern markers to an
 * existing Lightweight Charts series.
 *
 * Unlike `addIndicator()`, which renders numeric output series, this function
 * renders detected patterns as LWC series markers (arrowUp / arrowDown /
 * circle) annotated with the pattern short-name.
 *
 * @param sourceSeries  The candlestick series to attach markers to.
 * @param data          Full OHLCV dataset (same array as candles.setData()).
 * @param options       `[candle_period, trend_period, trend_signal]`.
 *                      Default: `[5, 1, 1]`.
 * @param addOptions    Visual configuration — colours, filter, showText.
 * @returns             An {@link IndicatorHandle} with `remove()`, `setData()`, `appendBar()`.
 *
 * @example
 * ```ts
 * import { init, addCandlestickPatterns } from 'tulip-rs-lwc';
 * await init();
 *
 * // All patterns with name annotations
 * const patterns = addCandlestickPatterns(candles, ohlcv);
 *
 * // Bullish reversals only
 * const bullish = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
 *   filter: 'BullishReversal',
 * });
 *
 * // Streaming
 * candles.update(newBar);
 * patterns.appendBar(newBar);
 * ```
 */
import type { ISeriesApi, SeriesOptionsMap } from 'lightweight-charts';
import { CandlestickPatternHandle } from './candlestick/candlestick-handle.js';
import type { OhlcvBar, IndicatorHandle, AddCandlestickPatternOptions } from './types.js';

export function addCandlestickPatterns(
  sourceSeries: ISeriesApi<keyof SeriesOptionsMap>,
  data:         OhlcvBar[],
  options:      [number, number, number] = [5, 1, 1],
  addOptions:   AddCandlestickPatternOptions = {},
): IndicatorHandle {
  const handle = new CandlestickPatternHandle(sourceSeries, data, options, addOptions);
  return {
    remove():               void { handle.remove(); },
    setData(d: OhlcvBar[]): void { handle.setData(d); },
    appendBar(b: OhlcvBar): void { handle.appendBar(b); },
  };
}
