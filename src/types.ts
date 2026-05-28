import type { Time } from "lightweight-charts";

// ── Core data types ───────────────────────────────────────────────────────────

/**
 * A single OHLCV bar.  `volume` is optional — it is required only for
 * volume-based indicators (AD, OBV, MFI, KVO, etc.).
 */
export type OhlcvBar = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * One element of the aligned output array produced after lookback-offsetting
 * a tulip-rs-wasm indicator result.  `values[i]` is the i-th output series
 * value at `time`.
 */
export type AlignedPoint = {
  time: Time;
  values: number[];
};

// ── Internal state type ────────────────────────────────────────────────────────

/**
 * Type-safe view of a tulip-rs-wasm State object.
 * The wasm-bindgen State classes expose these methods on every indicator.
 * Used internally; never exposed in the public API.
 */
export type WasmState = {
  /**
   * Feed new bars into the existing state without reprocessing history.
   * Returns an array of Float64Array — one per output series.
   * Each Float64Array will have length 0 (still in warmup) or equal to the
   * number of input bars once warmed up.
   */
  batchIndicator(
    inputs: number[][],
    optionalOutputs?: boolean[] | null,
  ): Float64Array[];
  toJson(): string;
};

// ── Public API types ──────────────────────────────────────────────────────────

/** Options passed to {@link addIndicator}. */
export type AddIndicatorOptions = {
  /**
   * One CSS color string per output series.
   * Falls back to {@link SERIES_COLORS} if shorter than the number of outputs.
   */
  colors?: string[];

  /**
   * Shade the area between the first and last output series.
   * Intended for band indicators (BBands, Keltner, etc.).
   * Default: `false`.
   */
  fillBand?: boolean;

  /**
   * Force the oscillator into a specific pane index instead of allocating
   * the next free pane automatically.
   * Has no effect for overlay indicators.
   */
  paneIndex?: number;

  /** Line width in pixels for all line series.  Default: `1`. */
  lineWidth?: number;
};

// ── Candlestick pattern types ───────────────────────────────────────────────

/**
 * Forecast type filter for {@link addCandlestickPatterns}.
 * When specified, only patterns with this forecast are shown.
 *
 * Accepted values map directly to the Rust `ForecastType` enum:
 * - `'BullishReversal'`                — single-direction bullish reversal
 * - `'BearishReversal'`                — single-direction bearish reversal
 * - `'BullishContinuation'`            — bullish continuation
 * - `'BearishContinuation'`            — bearish continuation
 * - `'BullishReversalOrContinuation'`  — bullish reversal or continuation
 * - `'BearishReversalOrContinuation'`  — bearish reversal or continuation
 */
export type ForecastFilter =
  | "BullishReversal"
  | "BearishReversal"
  | "BullishContinuation"
  | "BearishContinuation"
  | "BullishReversalOrContinuation"
  | "BearishReversalOrContinuation";

/** Options passed to {@link addCandlestickPatterns}. */
export type AddCandlestickPatternOptions = {
  /**
   * Only show patterns with this forecast type.
   * When omitted, all detected patterns are rendered.
   *
   * - `'BullishReversal'`               — arrowUp below bar (green)
   * - `'BearishReversal'`               — arrowDown above bar (red)
   * - `'BullishContinuation'`           — circle above bar (orange)
   * - `'BearishContinuation'`           — circle above bar (orange)
   * - `'BullishReversalOrContinuation'` — arrowUp below bar (green)
   * - `'BearishReversalOrContinuation'` — arrowDown above bar (red)
   */
  filter?: ForecastFilter;

  /** CSS colour for BullishReversal markers.  Default: `'#4CAF50'` (green). */
  bullishColor?: string;

  /** CSS colour for BearishReversal markers.  Default: `'#ef5350'` (red). */
  bearishColor?: string;

  /** CSS colour for Continuation markers.  Default: `'#FF9800'` (orange). */
  continuationColor?: string;

  /** CSS colour for Unknown forecast markers.  Default: `'#9E9E9E'` (grey). */
  unknownColor?: string;

  /**
   * Show the pattern short-name (e.g. `"hammer"`, `"doji"`) as a text
   * annotation on each marker.  Default: `true`.
   */
  showText?: boolean;
};

// ── Shared handle type ────────────────────────────────────────────────────────

/** Handle returned by {@link addIndicator}.  Use it to update or remove the indicator. */
export type IndicatorHandle = {
  /** Remove the indicator from the chart and free all resources. */
  remove(): void;

  /**
   * Replace the full dataset and recompute the indicator from scratch.
   * Keeps the indicator on the same pane / primitive.
   */
  setData(data: OhlcvBar[]): void;

  /**
   * Append one new bar and update the indicator **incrementally** using the
   * stored tulip-rs-wasm State object (`state.batchIndicator()`).
   * O(1) — does not reprocess history.
   */
  appendBar(bar: OhlcvBar): void;
};
