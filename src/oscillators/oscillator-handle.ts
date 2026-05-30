/**
 * OscillatorHandle — manages all rendering targets for one tulip-rs indicator,
 * with each `DisplayGroup` mapped to its own dedicated rendering target:
 *
 *   - `"Indicator"` groups → LineSeries / HistogramSeries in a dedicated pane
 *                            (each group gets its own separately-allocated pane)
 *   - `"Overlay"`   groups → DataOverlayPrimitive on the price-chart series
 *   - `"Volume"`    groups → DataOverlayPrimitive on the volume-bars series
 *
 * Examples:
 *   - roc(+mom)   → ROC pane  |  separate Momentum pane
 *   - fosc(+all)  → FOSC pane  |  tsf/linreg/linregintercept on price chart  |
 *                                 linregslope in its own separate pane
 *   - vosc(+SMAs) → VOSC pane  |  short_sma/long_sma on volume panel
 *
 * Streaming:
 *   - Initial compute:  `indicator.indicator()` + `series.setData()`
 *   - Incremental:      `appendBar()` → `state.batchIndicator()` → `series.update()`
 */
import type {
  IChartApi,
  IPaneApi,
  ISeriesApi,
  SeriesOptionsMap,
  Time,
} from "lightweight-charts";
import { LineSeries, HistogramSeries } from "lightweight-charts";
import type { Indicator } from "tulip-rs-wasm";
import { extractInputs } from "../helpers/input-extractor.js";
import { SERIES_COLORS, DEFAULT_LINE_WIDTH } from "../constants.js";
import { DataOverlayPrimitive } from "../overlays/data-overlay-primitive.js";
import type { OhlcvBar, WasmState } from "../types.js";
import type { PaneAllocator } from "../pane-manager.js";
import { PaneLabelPrimitive } from "./pane-label-primitive.js";
import type { LegendEntry } from "./pane-label-primitive.js";
import { getPricePaneLegend } from "../helpers/price-pane-legend.js";

// ── Internal render-group types ───────────────────────────────────────────────

type OscSeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

/** One `Indicator`-type DisplayGroup: a set of LWC series sharing one pane. */
type IndicatorRenderGroup = {
  outputIndices: number[]; // indices into rawOutputs[]
  paneIndex: number;
  seriesList: OscSeries[];
  /** true if this handle allocated the pane — it will release it on remove(). */
  ownedPane: boolean;
  paneRef: IPaneApi<Time> | null;
  labelPrimitive: PaneLabelPrimitive | null;
};

/** One `Overlay`-type DisplayGroup: lines drawn on the price chart. */
type OverlayRenderGroup = {
  outputIndices: number[];
  primitive: DataOverlayPrimitive;
  legendKey: object;
};

/** One `Volume`-type DisplayGroup: lines drawn on the volume panel. */
type VolumeRenderGroup = {
  outputIndices: number[];
  primitive: DataOverlayPrimitive;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isHistogramOutput(outputName: string): boolean {
  const lower = outputName.toLowerCase();
  return (
    lower === "histogram" || lower.endsWith("_hist") || lower.endsWith("hist")
  );
}

// ── OscillatorHandle ──────────────────────────────────────────────────────────

export class OscillatorHandle {
  private _chart: IChartApi;
  private _indicator: Indicator;
  private _optionValues: number[];
  private _data: OhlcvBar[];
  private readonly _optionalMask: boolean[] | null;
  private readonly _paneAllocator: PaneAllocator;
  private _state: WasmState | null = null;

  private _indicatorGroups: IndicatorRenderGroup[] = [];
  private _overlayGroups: OverlayRenderGroup[] = [];
  private _volumeGroups: VolumeRenderGroup[] = [];

  private _sourceSeries: ISeriesApi<keyof SeriesOptionsMap> | null = null;
  private _volumeSeries: ISeriesApi<keyof SeriesOptionsMap> | null = null;

  constructor(
    chart: IChartApi,
    sourceSeries: ISeriesApi<keyof SeriesOptionsMap> | null,
    indicator: Indicator,
    data: OhlcvBar[],
    optionValues: number[],
    paneAllocator: PaneAllocator,
    /**
     * When set, the first `Indicator` group uses this pane index instead of
     * allocating one.  The caller owns that pane (it will NOT be released by
     * `remove()`).  Pass `null` to always allocate from the pane allocator.
     */
    forcedPrimaryPaneIndex: number | null,
    colors: string[],
    lineWidth: number,
    optionalMask: boolean[] | null = null,
    volumeSeries: ISeriesApi<keyof SeriesOptionsMap> | null = null,
  ) {
    this._chart = chart;
    this._sourceSeries = sourceSeries;
    this._indicator = indicator;
    this._data = [...data];
    this._optionValues = optionValues;
    this._paneAllocator = paneAllocator;
    this._optionalMask = optionalMask;
    this._volumeSeries = volumeSeries;

    const info = indicator.info;
    const nPrimary = info.outputs.length;

    // ── Step 1: map output name → rawOutputs index ────────────────────────────
    const outputIndexMap = new Map<string, number>();
    for (let i = 0; i < info.outputs.length; i++) {
      outputIndexMap.set(info.outputs[i], i);
    }
    for (let i = 0; i < info.optionalOutputs.length; i++) {
      outputIndexMap.set(info.optionalOutputs[i], nPrimary + i);
    }

    // Set of rawOutput indices for enabled optional outputs.
    const activeOptionalIndices = new Set<number>();
    if (optionalMask) {
      optionalMask.forEach((enabled, i) => {
        if (enabled) activeOptionalIndices.add(nPrimary + i);
      });
    }

    // ── Step 2: build rawOutputIndex → CSS color map ──────────────────────────
    // Caller provides `colors` in natural order:
    //   colors[0 .. nPrimary-1]  → primary outputs
    //   colors[nPrimary ..]      → enabled optionals in optionalMask index order
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

    // ── Step 3: for each DisplayGroup, collect active rawOutput indices ────────
    type GroupEntry = {
      displayType: string;
      outputIndices: number[];
      label: string;
    };
    const groupEntries: GroupEntry[] = [];

    for (const group of info.displayGroups) {
      const indices: number[] = [];
      for (const outputName of group.outputs) {
        const rawIdx = outputIndexMap.get(outputName);
        if (rawIdx === undefined) continue;
        // Primary outputs are always active; optionals only when enabled.
        if (rawIdx < nPrimary || activeOptionalIndices.has(rawIdx)) {
          indices.push(rawIdx);
        }
      }
      if (indices.length > 0) {
        groupEntries.push({
          displayType: group.displayType,
          outputIndices: indices,
          label: group.label,
        });
      }
    }

    // ── Step 4: create rendering targets ──────────────────────────────────────
    let firstIndicatorGroup = true;

    for (const { displayType, outputIndices, label } of groupEntries) {
      if (displayType === "Overlay") {
        // All outputs in this group overlay the price chart together.
        if (!sourceSeries) continue;
        const overlayColors = outputIndices.map(
          (idx) => colorMap.get(idx) ?? SERIES_COLORS[0],
        );
        const primitive = new DataOverlayPrimitive(overlayColors);
        sourceSeries.attachPrimitive(primitive);
        // Register entries in the shared price-pane legend.
        const legendKey: object = {};
        const overlayLegendEntries: LegendEntry[] = outputIndices.map(
          (rawIdx, i) => ({
            name:
              rawIdx < nPrimary
                ? info.outputs[rawIdx]
                : info.optionalOutputs[rawIdx - nPrimary],
            color: overlayColors[i],
          }),
        );
        getPricePaneLegend(this._chart).add(legendKey, overlayLegendEntries);
        this._overlayGroups.push({ outputIndices, primitive, legendKey });
      } else if (displayType === "Volume") {
        // All outputs in this group overlay the volume panel together.
        if (!volumeSeries) continue;
        const volumeColors = outputIndices.map(
          (idx) => colorMap.get(idx) ?? SERIES_COLORS[0],
        );
        const primitive = new DataOverlayPrimitive(volumeColors);
        volumeSeries.attachPrimitive(primitive);
        this._volumeGroups.push({ outputIndices, primitive });
      } else {
        // Indicator — each group gets its own dedicated pane.
        // The first group may use a forced pane index (from addOptions.paneIndex).
        let paneIndex: number;
        let ownedPane: boolean;
        if (firstIndicatorGroup && forcedPrimaryPaneIndex !== null) {
          paneIndex = forcedPrimaryPaneIndex;
          ownedPane = false; // caller owns this pane
        } else {
          paneIndex = paneAllocator.allocate();
          ownedPane = true;
        }
        firstIndicatorGroup = false;

        const legendEntries: LegendEntry[] = [];
        const seriesList: OscSeries[] = outputIndices.map((rawIdx) => {
          const color = colorMap.get(rawIdx) ?? SERIES_COLORS[0];
          const isPrimaryOutput = rawIdx < nPrimary;
          const outputName = isPrimaryOutput
            ? info.outputs[rawIdx]
            : info.optionalOutputs[rawIdx - nPrimary];
          legendEntries.push({ name: outputName, color });

          if (isPrimaryOutput && isHistogramOutput(outputName)) {
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

        // Get the actual IPane reference (created by the first moveToPane call above)
        const paneRef =
          (this._chart.panes()[paneIndex] as IPaneApi<Time>) ?? null;
        const labelPrimitive = paneRef
          ? new PaneLabelPrimitive(label, legendEntries)
          : null;
        if (labelPrimitive && paneRef) {
          paneRef.attachPrimitive(labelPrimitive);
        }

        this._indicatorGroups.push({
          outputIndices,
          paneIndex,
          seriesList,
          ownedPane,
          paneRef,
          labelPrimitive,
        });
      }
    }

    this._computeFull();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  remove(): void {
    // Remove all oscillator series and release any panes we own.
    for (const group of this._indicatorGroups) {
      // Detach label before series removal (series removal may auto-remove the pane)
      if (group.labelPrimitive && group.paneRef) {
        try {
          group.paneRef.detachPrimitive(group.labelPrimitive);
        } catch {
          /* pane already gone */
        }
      }
      for (const s of group.seriesList) {
        this._chart.removeSeries(s);
      }
      if (group.ownedPane) {
        this._paneAllocator.release(group.paneIndex);
      }
    }
    // Detach price-chart overlay primitives.
    if (this._sourceSeries) {
      for (const group of this._overlayGroups) {
        this._sourceSeries.detachPrimitive(group.primitive);
        getPricePaneLegend(this._chart).remove(group.legendKey);
      }
    }
    // Detach volume-panel overlay primitives.
    if (this._volumeSeries) {
      for (const group of this._volumeGroups) {
        this._volumeSeries.detachPrimitive(group.primitive);
      }
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

    // Update indicator series.
    for (const group of this._indicatorGroups) {
      group.outputIndices.forEach((rawIdx, seriesPos) => {
        const out = batchRaw[rawIdx];
        if (!out || out.length === 0) return; // still in warmup
        (group.seriesList[seriesPos] as ISeriesApi<"Line">).update({
          time: bar.time,
          value: out[out.length - 1],
        });
      });
    }

    // Update price-chart overlay primitives.
    for (const group of this._overlayGroups) {
      const batchSlice = group.outputIndices.map(
        (idx) => batchRaw[idx] ?? new Float64Array(0),
      );
      group.primitive.appendPoint(bar.time, batchSlice);
    }

    // Update volume-panel overlay primitives.
    for (const group of this._volumeGroups) {
      const batchSlice = group.outputIndices.map(
        (idx) => batchRaw[idx] ?? new Float64Array(0),
      );
      group.primitive.appendPoint(bar.time, batchSlice);
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

    // ── Indicator groups: back-align each output independently ────────────────
    for (const group of this._indicatorGroups) {
      group.outputIndices.forEach((rawIdx, seriesPos) => {
        const out = rawOutputs[rawIdx] ?? new Float64Array(0);
        const lookback = this._data.length - out.length;
        const seriesData = [...out].map((value, j) => ({
          time: this._data[lookback + j].time,
          value,
        }));
        (group.seriesList[seriesPos] as ISeriesApi<"Line">).setData(seriesData);
      });
    }

    // ── Overlay groups: back-align and push to primitive ──────────────────────
    for (const group of this._overlayGroups) {
      const lines = group.outputIndices.map((rawIdx) => {
        const out = rawOutputs[rawIdx] ?? new Float64Array(0);
        const lookback = this._data.length - out.length;
        return [...out].map((value, j) => ({
          time: this._data[lookback + j].time,
          value,
        }));
      });
      group.primitive.setData(lines);
    }

    // ── Volume groups: back-align and push to primitive ───────────────────────
    for (const group of this._volumeGroups) {
      const lines = group.outputIndices.map((rawIdx) => {
        const out = rawOutputs[rawIdx] ?? new Float64Array(0);
        const lookback = this._data.length - out.length;
        return [...out].map((value, j) => ({
          time: this._data[lookback + j].time,
          value,
        }));
      });
      group.primitive.setData(lines);
    }
  }
}
