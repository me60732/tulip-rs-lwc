/**
 * OscillatorHandle — manages one or more standard LWC series (LineSeries /
 * HistogramSeries) rendered in a dedicated pane beneath the price chart.
 *
 * Each tulip-rs output maps to one series.  Outputs whose name contains
 * "histogram" or "hist" are rendered as HistogramSeries; all others use
 * LineSeries.
 *
 * Streaming:
 *   - Initial compute:  `indicator.indicator()` + `series.setData()`
 *   - Incremental:      `appendBar()` → `state.batchIndicator()` → `series.update()`
 */
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { LineSeries, HistogramSeries } from "lightweight-charts";
import type { Indicator } from "tulip-rs-wasm";
import { alignOutputs, appendAlignedPoint } from "../helpers/align-outputs.js";
import { extractInputs } from "../helpers/input-extractor.js";
import { SERIES_COLORS, DEFAULT_LINE_WIDTH } from "../constants.js";
import type { AlignedPoint, OhlcvBar, WasmState } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when the output should be rendered as a histogram bar instead of a line. */
function isHistogramOutput(outputName: string): boolean {
  const lower = outputName.toLowerCase();
  return (
    lower === "histogram" || lower.endsWith("_hist") || lower.endsWith("hist")
  );
}

// Use a union that covers the series types we create.
type OscSeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

// ── OscillatorHandle ──────────────────────────────────────────────────────────

export class OscillatorHandle {
  private _chart: IChartApi;
  private _indicator: Indicator;
  private _optionValues: number[];
  private _paneIndex: number;
  private _seriesList: OscSeries[];
  private _state: WasmState | null = null;
  private _alignedData: AlignedPoint[] = [];
  private _data: OhlcvBar[];

  constructor(
    chart: IChartApi,
    indicator: Indicator,
    data: OhlcvBar[],
    optionValues: number[],
    paneIndex: number,
    colors: string[],
    lineWidth: number,
  ) {
    this._chart = chart;
    this._indicator = indicator;
    this._data = [...data];
    this._optionValues = optionValues;
    this._paneIndex = paneIndex;

    const info = indicator.info;

    // Create one series per output, choosing the right type.
    this._seriesList = info.outputs.map((outputName, i) => {
      const color = colors[i] ?? SERIES_COLORS[i % SERIES_COLORS.length];
      if (isHistogramOutput(outputName)) {
        const s = chart.addSeries(HistogramSeries, {
          color,
        }) as ISeriesApi<"Histogram">;
        s.moveToPane(paneIndex);
        return s;
      } else {
        const s = chart.addSeries(LineSeries, {
          color,
          lineWidth: lineWidth as 1 | 2 | 3 | 4,
        }) as ISeriesApi<"Line">;
        s.moveToPane(paneIndex);
        return s;
      }
    });

    this._computeFull();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  remove(): void {
    for (const s of this._seriesList) {
      this._chart.removeSeries(s);
    }
  }

  setData(data: OhlcvBar[]): void {
    this._data = [...data];
    this._computeFull();
  }

  /**
   * Append one bar and update incrementally via `state.batchIndicator()`.
   * Calls `series.update()` on each output series — O(1) per call.
   */
  appendBar(bar: OhlcvBar): void {
    this._data.push(bar);

    if (!this._state) {
      this._computeFull();
      return;
    }

    const inputs = extractInputs([bar], this._indicator.info.inputs);
    const batchOutputs = this._state.batchIndicator(inputs);
    const added = appendAlignedPoint(this._alignedData, bar.time, batchOutputs);

    if (added) {
      const last = this._alignedData[this._alignedData.length - 1];
      this._seriesList.forEach((series, i) => {
        // series.update() appends or replaces the last point.
        (series as ISeriesApi<"Line">).update({
          time: bar.time,
          value: last.values[i],
        });
      });
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _computeFull(): void {
    const info = this._indicator.info;
    const inputs = extractInputs(this._data, info.inputs);

    const [outputs, rawState] = this._indicator.indicator(
      inputs,
      this._optionValues,
    );
    this._state = rawState as unknown as WasmState;

    const lookback = this._data.length - (outputs[0]?.length ?? 0);
    this._alignedData = alignOutputs(this._data, outputs, lookback);

    // Push data to each LWC series.
    this._seriesList.forEach((series, i) => {
      const seriesData = this._alignedData.map(({ time, values }) => ({
        time,
        value: values[i],
      }));
      // setData() accepts {time, value}[] for both Line and Histogram series.
      (series as ISeriesApi<"Line">).setData(seriesData);
    });
  }
}
