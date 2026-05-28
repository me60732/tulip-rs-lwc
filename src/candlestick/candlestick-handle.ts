/**
 * candlestick-handle.ts
 *
 * Renders tulip-rs candlestick pattern detections as Lightweight Charts v5
 * series markers via the `createSeriesMarkers()` plugin API.
 *
 * Each pattern found at a bar is placed as a marker:
 *
 *   BullishReversal  → arrowUp   below the bar  (green by default)
 *   BearishReversal  → arrowDown above the bar  (red by default)
 *   Continuation     → circle    above the bar  (orange by default)
 *   Unknown          → square    above the bar  (grey by default)
 *
 * The pattern short-name (e.g. "hammer", "doji") is shown as the marker
 * text annotation when `showText` is true (default).
 *
 * Streaming:
 *   - Initial compute:  `candlestick.indicator()` — full history, stores State
 *   - Incremental:      `appendBar()` → `state.batchIndicator()` — O(1)
 *
 * The filter passed to `addCandlestickPatterns()` is captured inside the
 * wasm State at the point `indicator()` is called, so `batchIndicator()`
 * automatically applies the same filter without needing it again.
 */
import {
  createSeriesMarkers,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarkerBar,
  type SeriesMarkerBarPosition,
  type SeriesMarkerShape,
  type SeriesOptionsMap,
  type Time,
} from "lightweight-charts";
import * as ti from "tulip-rs-wasm";
import type { OhlcvBar, AddCandlestickPatternOptions } from "../types.js";

// ── Wasm types ────────────────────────────────────────────────────────────────

/**
 * Pattern object returned by the tulip-rs-wasm candlestick indicator.
 * One per pattern detected at a bar.
 */
export interface CandlestickPatternResult {
  /** Short lowercase name, e.g. `"doji"`, `"hammer"`. */
  name: string;
  /** Full English name, e.g. `"Doji"`, `"Hammer"`. */
  fullName: string;
  /** Japanese name. */
  japaneseName: string;
  /** Number of bars the pattern spans. */
  bars: number;
  /**
   * Forecast type — one of:
   * `"BullishReversal"` | `"BearishReversal"` | `"Continuation"` | `"Unknown"`
   */
  forecast: string;
}

/**
 * Internal wasm State type for the candlestick indicator.
 * Unlike numeric indicators whose State returns Float64Array[], the
 * candlestick State returns an array of pattern arrays (one per bar).
 */
interface CandlestickWasmState {
  /**
   * Feed one or more bars; returns one pattern-array per input bar.
   * `forecastType` is optional — omit to return all patterns, or pass a
   * filter string to match only patterns of that forecast type.  Unlike
   * numeric indicators the filter is NOT captured in the state itself;
   * it must be passed on every `batchIndicator()` call.
   */
  batchIndicator(
    inputs: number[][],
    forecastType?: string,
  ): (CandlestickPatternResult[] | null)[];
  toJson(): string;
}

/**
 * Type-safe view of tulip-rs-wasm's candlestick indicator.
 * The generic Indicator<S> class types indicator() as returning Float64Array[]
 * for outputs, but candlestick is special — outputs are pattern object arrays.
 */
interface CandlestickIndicatorApi {
  indicator(
    inputs: number[][],
    options: number[],
    filter?: string,
  ): [(CandlestickPatternResult[] | null)[], CandlestickWasmState];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_BULLISH_COLOR = "#4CAF50"; // green
const DEFAULT_BEARISH_COLOR = "#ef5350"; // red
const DEFAULT_CONTINUATION_COLOR = "#FF9800"; // orange
const DEFAULT_UNKNOWN_COLOR = "#9E9E9E"; // grey

// ── Helpers ───────────────────────────────────────────────────────────────────

interface BarMarkerStyle {
  position: SeriesMarkerBarPosition;
  shape: SeriesMarkerShape;
  color: string;
}

function forecastStyle(
  forecast: string,
  colors: {
    bullish: string;
    bearish: string;
    continuation: string;
    unknown: string;
  },
): BarMarkerStyle {
  switch (forecast) {
    case "BullishReversal":
      return { position: "belowBar", shape: "arrowUp", color: colors.bullish };
    case "BearishReversal":
      return {
        position: "aboveBar",
        shape: "arrowDown",
        color: colors.bearish,
      };
    case "Continuation":
      return {
        position: "aboveBar",
        shape: "circle",
        color: colors.continuation,
      };
    default:
      return { position: "aboveBar", shape: "square", color: colors.unknown };
  }
}

// ── CandlestickPatternHandle ──────────────────────────────────────────────────

export class CandlestickPatternHandle {
  private readonly _plugin: ISeriesMarkersPluginApi<Time>;
  private readonly _api: CandlestickIndicatorApi;
  private readonly _filter: string | undefined;
  private readonly _showText: boolean;
  private readonly _colors: {
    bullish: string;
    bearish: string;
    continuation: string;
    unknown: string;
  };

  private _data: OhlcvBar[];
  private _cpOpts: number[];
  private _state: CandlestickWasmState | null = null;
  private _markers: SeriesMarkerBar<Time>[] = [];

  constructor(
    series: ISeriesApi<keyof SeriesOptionsMap>,
    data: OhlcvBar[],
    cpOptions: number[],
    addOpts: AddCandlestickPatternOptions,
  ) {
    this._data = [...data];
    this._cpOpts = cpOptions;
    this._filter = addOpts.filter;
    this._showText = addOpts.showText ?? true;
    this._colors = {
      bullish: addOpts.bullishColor ?? DEFAULT_BULLISH_COLOR,
      bearish: addOpts.bearishColor ?? DEFAULT_BEARISH_COLOR,
      continuation: addOpts.continuationColor ?? DEFAULT_CONTINUATION_COLOR,
      unknown: addOpts.unknownColor ?? DEFAULT_UNKNOWN_COLOR,
    };

    // Cast to the candlestick-specific API — the generic Indicator class
    // uses Float64Array[] for outputs which doesn't apply here.
    this._api = ti.candlestick as unknown as CandlestickIndicatorApi;

    // Create the LWC v5 markers plugin and attach it to the series.
    // This is the correct way to place markers in LWC v5 — not series.setMarkers().
    this._plugin = createSeriesMarkers(series);

    this._computeFull();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Remove all markers and detach the plugin from the series. */
  remove(): void {
    this._markers = [];
    this._plugin.detach();
  }

  setData(data: OhlcvBar[]): void {
    this._data = [...data];
    this._computeFull();
  }

  /**
   * Append one bar and update markers incrementally via `state.batchIndicator()`.
   * O(1) — only the new bar is processed.
   *
   * The filter (if any) is already captured in the State from the initial
   * `indicator()` call, so it is automatically applied here without needing
   * to be passed again.
   */
  appendBar(bar: OhlcvBar): void {
    this._data.push(bar);

    if (!this._state) {
      // State not yet initialised (warmup) — fall back to full recompute.
      this._computeFull();
      return;
    }

    // Feed the single new bar as [[open],[high],[low],[close]].
    // Pass _filter explicitly — unlike numeric indicators, the candlestick
    // State does not capture the filter internally; it must be supplied
    // on every batchIndicator() call.
    const inputs = [[bar.open], [bar.high], [bar.low], [bar.close]];
    const batchResult = this._state.batchIndicator(inputs, this._filter);
    const patterns = batchResult[0];

    if (patterns && patterns.length > 0) {
      for (const p of patterns) {
        this._markers.push(this._makeMarker(bar.time, p));
      }
      // _markers is kept in chronological order by appending — setMarkers
      // requires ascending-time order, which is always satisfied here.
      this._plugin.setMarkers(this._markers);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _makeMarker(
    time: Time,
    pattern: CandlestickPatternResult,
  ): SeriesMarkerBar<Time> {
    const style = forecastStyle(pattern.forecast, this._colors);
    const marker: SeriesMarkerBar<Time> = {
      time,
      position: style.position,
      shape: style.shape,
      color: style.color,
      size: 1,
    };
    if (this._showText) {
      marker.text = pattern.name;
    }
    return marker;
  }

  private _computeFull(): void {
    const open = this._data.map((d) => d.open);
    const high = this._data.map((d) => d.high);
    const low = this._data.map((d) => d.low);
    const close = this._data.map((d) => d.close);

    const [result, state] = this._api.indicator(
      [open, high, low, close],
      this._cpOpts,
      this._filter,
    );

    this._state = state;
    this._markers = [];

    // result.length === data.length - lookback
    // result[i] corresponds to data[lookback + i]
    const lookback = this._data.length - result.length;

    result.forEach((patterns, i) => {
      if (!patterns || patterns.length === 0) return;
      const { time } = this._data[lookback + i];
      for (const p of patterns) {
        this._markers.push(this._makeMarker(time, p));
      }
    });

    this._plugin.setMarkers(this._markers);
  }
}
