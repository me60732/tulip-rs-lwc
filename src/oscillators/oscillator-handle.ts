/**
 * OscillatorHandle — manages one or more standard LWC series (LineSeries /
 * HistogramSeries) rendered in a dedicated pane beneath the price chart.
 *
 * Each primary output and any oscillator-scale optional outputs map to one
 * series.  Price-scale optional outputs (e.g. short_ema / long_ema for APO,
 * MACD, PPO) are routed to a DataOverlayPrimitive attached to the candlestick
 * series so they render on the price chart instead.
 *
 * All outputs are back-aligned independently: the last element of each output
 * array corresponds to the last bar, so different lookback lengths start at
 * their own natural first bar with no trimming required.
 *
 * Streaming:
 *   - Initial compute:  `indicator.indicator()` + `series.setData()`
 *   - Incremental:      `appendBar()` → `state.batchIndicator()` → `series.update()`
 */
import type {
  IChartApi,
  ISeriesApi,
  SeriesOptionsMap,
} from "lightweight-charts";
import { LineSeries, HistogramSeries } from "lightweight-charts";
import type { Indicator } from "tulip-rs-wasm";
import { extractInputs } from "../helpers/input-extractor.js";
import { SERIES_COLORS, DEFAULT_LINE_WIDTH } from "../constants.js";
import { isPriceScaleOptional } from "../helpers/price-scale-optionals.js";
import { DataOverlayPrimitive } from "../overlays/data-overlay-primitive.js";
import type { OhlcvBar, WasmState } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isHistogramOutput(outputName: string): boolean {
  const lower = outputName.toLowerCase();
  return (
    lower === "histogram" || lower.endsWith("_hist") || lower.endsWith("hist")
  );
}

type OscSeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

// ── OscillatorHandle ──────────────────────────────────────────────────────────

export class OscillatorHandle {
  private _chart: IChartApi;
  private _indicator: Indicator;
  private _optionValues: number[];
  private _paneIndex: number;
  private _seriesList: OscSeries[];
  private _state: WasmState | null = null;
  private _data: OhlcvBar[];
  private readonly _optionalMask: boolean[] | null;

  /** Indices into rawOutputs that feed oscillator LineSeries. */
  private _relevantIndices: number[];
  /** Indices into rawOutputs that feed the price-chart overlay primitive. */
  private _overlayIndices: number[];

  private _overlayPrimitive: DataOverlayPrimitive | null = null;
  private _sourceSeries: ISeriesApi<keyof SeriesOptionsMap> | null = null;

  constructor(
    chart: IChartApi,
    sourceSeries: ISeriesApi<keyof SeriesOptionsMap> | null,
    indicator: Indicator,
    data: OhlcvBar[],
    optionValues: number[],
    paneIndex: number,
    colors: string[],
    lineWidth: number,
    optionalMask: boolean[] | null = null,
  ) {
    this._chart = chart;
    this._sourceSeries = sourceSeries;
    this._indicator = indicator;
    this._data = [...data];
    this._optionValues = optionValues;
    this._paneIndex = paneIndex;
    this._optionalMask = optionalMask;

    const info = indicator.info;
    const nPrimary = info.outputs.length;

    // ── Phase 1: classify outputs ────────────────────────────────────────────
    // Primary outputs always go to oscillator series in the pane.
    this._relevantIndices = Array.from({ length: nPrimary }, (_, i) => i);
    this._overlayIndices = [];

    if (optionalMask) {
      optionalMask.forEach((enabled, i) => {
        if (!enabled) return;
        const optName = info.optionalOutputs[i];
        if (isPriceScaleOptional(info.name, optName)) {
          this._overlayIndices.push(nPrimary + i);
        } else {
          this._relevantIndices.push(nPrimary + i);
        }
      });
    }

    // ── Phase 2 & 3 preamble: build colorMap in natural order ────────────────
    // Natural order expected from the caller:
    //   colors[0 .. nPrimary-1]       → primary outputs
    //   colors[nPrimary ..]           → enabled optionals in optionalMask index order
    // Map from rawOutputIndex → color so any internal routing order works.
    const colorMap = new Map<number, string>();
    for (let i = 0; i < nPrimary; i++) {
      colorMap.set(i, colors[i] ?? SERIES_COLORS[i % SERIES_COLORS.length]);
    }
    let natOptColorIdx = nPrimary;
    if (optionalMask) {
      optionalMask.forEach((enabled, i) => {
        if (!enabled) return;
        const color =
          colors[natOptColorIdx] ??
          SERIES_COLORS[natOptColorIdx % SERIES_COLORS.length];
        natOptColorIdx++;
        colorMap.set(nPrimary + i, color);
      });
    }

    // ── Phase 2: create oscillator series ────────────────────────────────────
    this._seriesList = this._relevantIndices.map((outputIdx) => {
      const color = colorMap.get(outputIdx) ?? SERIES_COLORS[0];

      const isPrimary = outputIdx < nPrimary;
      const name = isPrimary
        ? info.outputs[outputIdx]
        : info.optionalOutputs[outputIdx - nPrimary];

      if (isPrimary && isHistogramOutput(name)) {
        const s = chart.addSeries(HistogramSeries, {
          color,
          priceLineVisible: false,
          lastValueVisible: false,
        }) as ISeriesApi<"Histogram">;
        s.moveToPane(paneIndex);
        return s;
      }

      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: lineWidth as 1 | 2 | 3 | 4,
        priceLineVisible: false,
        lastValueVisible: false,
      }) as ISeriesApi<"Line">;
      s.moveToPane(paneIndex);
      return s;
    });

    // ── Phase 3: create overlay primitive for price-scale optionals ──────────
    if (this._overlayIndices.length > 0 && sourceSeries) {
      const overlayColors = this._overlayIndices.map(
        (idx) => colorMap.get(idx) ?? SERIES_COLORS[0],
      );
      this._overlayPrimitive = new DataOverlayPrimitive(overlayColors);
      sourceSeries.attachPrimitive(this._overlayPrimitive);
    }

    this._computeFull();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  remove(): void {
    for (const s of this._seriesList) {
      this._chart.removeSeries(s);
    }
    if (this._overlayPrimitive && this._sourceSeries) {
      this._sourceSeries.detachPrimitive(this._overlayPrimitive);
      this._overlayPrimitive = null;
    }
  }

  setData(data: OhlcvBar[]): void {
    this._data = [...data];
    this._computeFull();
  }

  /**
   * Append one bar incrementally via `state.batchIndicator()`.
   * Each output is updated independently — O(1) per call.
   */
  appendBar(bar: OhlcvBar): void {
    this._data.push(bar);

    if (!this._state) {
      this._computeFull();
      return;
    }

    const inputs = extractInputs([bar], this._indicator.info.inputs);
    const batchRaw = this._state.batchIndicator(
      inputs,
      this._optionalMask ?? null,
    );

    // Update each oscillator series independently.
    this._relevantIndices.forEach((idx, i) => {
      const out = batchRaw[idx];
      if (!out || out.length === 0) return; // still in warmup
      (this._seriesList[i] as ISeriesApi<"Line">).update({
        time: bar.time,
        value: out[out.length - 1],
      });
    });

    // Update price-scale overlay primitive.
    if (this._overlayPrimitive && this._overlayIndices.length > 0) {
      const overlayBatch = this._overlayIndices.map(
        (idx) => batchRaw[idx] ?? new Float64Array(0),
      );
      this._overlayPrimitive.appendPoint(bar.time, overlayBatch);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _computeFull(): void {
    const info = this._indicator.info;
    const inputs = extractInputs(this._data, info.inputs);

    const [rawOutputs, rawState] = this._indicator.indicator(
      inputs,
      this._optionValues,
      this._optionalMask ?? undefined,
    );
    this._state = rawState as unknown as WasmState;

    // ── Oscillator series: back-align each output independently ──────────────
    // The last element of each output array corresponds to the last bar, so
    // different lookback lengths simply start at different points in history.
    this._relevantIndices.forEach((idx, i) => {
      const out = rawOutputs[idx] ?? new Float64Array(0);
      const lookback = this._data.length - out.length;
      const seriesData = [...out].map((value, j) => ({
        time: this._data[lookback + j].time,
        value,
      }));
      (this._seriesList[i] as ISeriesApi<"Line">).setData(seriesData);
    });

    // ── Price-scale overlay: same back-alignment, independently per output ───
    if (this._overlayPrimitive && this._overlayIndices.length > 0) {
      const overlayLines = this._overlayIndices.map((idx) => {
        const out = rawOutputs[idx] ?? new Float64Array(0);
        const lookback = this._data.length - out.length;
        return [...out].map((value, j) => ({
          time: this._data[lookback + j].time,
          value,
        }));
      });
      this._overlayPrimitive.setData(overlayLines);
    }
  }
}
