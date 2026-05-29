/**
 * HorizontalPrimitive — renders a set of named price levels as full-width
 * dashed horizontal lines on the price pane.
 *
 * Designed for indicators that output a fixed set of support / resistance /
 * pivot levels at any given moment (e.g. Pivot Point: s3, s2, s1, pp, r1,
 * r2, r3).  Only the **most recent** value of each output series is used;
 * the lines span the entire visible width of the chart.
 *
 * Each line is labelled at the right edge with the output name and price.
 */
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  AutoscaleInfo,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
} from "lightweight-charts";
import type { Indicator } from "tulip-rs-wasm";
import { PluginBase } from "../plugin-base.js";
import { extractInputs } from "../helpers/input-extractor.js";
import { SERIES_COLORS } from "../constants.js";
import type { OhlcvBar, WasmState } from "../types.js";

// ── Internal data types ────────────────────────────────────────────────────────

interface Level {
  price: number;
  /** CSS-pixel Y coordinate, null when priceToCoordinate returns null. */
  y: number | null;
  color: string;
  label: string;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

class HorizontalRenderer implements IPrimitivePaneRenderer {
  private _levels: Level[] = [];

  update(levels: Level[]): void {
    this._levels = levels;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._levels.length === 0) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const xr = scope.horizontalPixelRatio;
      const yr = scope.verticalPixelRatio;
      const bmpWidth = scope.bitmapSize.width;

      ctx.save();
      ctx.lineWidth = Math.max(1, yr);

      for (const level of this._levels) {
        if (level.y === null) continue;
        const y = Math.round(level.y * yr);

        // ── Dashed line across the full pane width ──────────────────────────
        ctx.strokeStyle = level.color;
        ctx.setLineDash([6 * xr, 4 * xr]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(bmpWidth, y);
        ctx.stroke();

        // ── Label at right edge ─────────────────────────────────────────────
        ctx.setLineDash([]);
        ctx.font = `bold ${Math.round(10 * yr)}px system-ui, sans-serif`;
        ctx.textBaseline = "bottom";

        const text = level.label.toUpperCase();
        const textW = ctx.measureText(text).width;
        const pad = 5 * xr;

        // Pill background for readability over candlesticks
        const pillH = Math.round(13 * yr);
        const pillX = bmpWidth - textW - pad * 2;
        const pillY = y - pillH;
        ctx.fillStyle = "rgba(19, 23, 34, 0.75)";
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, textW + pad * 2, pillH, 3 * xr);
        ctx.fill();

        ctx.fillStyle = level.color;
        ctx.fillText(text, pillX + pad, y - 1 * yr);
      }

      ctx.restore();
    });
  }
}

// ── Pane view ─────────────────────────────────────────────────────────────────

class HorizontalPaneView implements IPrimitivePaneView {
  private _primitive: HorizontalPrimitive;
  private _renderer: HorizontalRenderer;

  constructor(primitive: HorizontalPrimitive, renderer: HorizontalRenderer) {
    this._primitive = primitive;
    this._renderer = renderer;
  }

  update(): void {
    const series = this._primitive.series;
    const resolved: Level[] = this._primitive.levels.map((lvl) => ({
      ...lvl,
      y: series.priceToCoordinate(lvl.price),
    }));
    this._renderer.update(resolved);
  }

  renderer(): HorizontalRenderer {
    return this._renderer;
  }
}

// ── HorizontalPrimitive ───────────────────────────────────────────────────────

export class HorizontalPrimitive extends PluginBase {
  /**
   * Current set of price levels to render.
   * Rebuilt by `_computeFull()` from the most recent indicator output.
   * @internal
   */
  levels: Array<{ price: number; color: string; label: string }> = [];

  private _data: OhlcvBar[];
  private _indicator: Indicator;
  private _optionValues: number[];
  private _state: WasmState | null = null;
  private _colors: readonly string[];
  private _labels: readonly string[];
  private _minValue = Infinity;
  private _maxValue = -Infinity;
  private _renderer: HorizontalRenderer;
  private _paneView: HorizontalPaneView;

  /**
   * @param indicator    The tulip-rs-wasm Indicator object.
   * @param data         Full OHLCV history.
   * @param optionValues Numeric option values in the same order as `info.options`.
   * @param colors       One colour per output (e.g. PIVOT_POINT_COLORS).
   * @param labels       One label per output (e.g. the `info.outputs` names).
   */
  constructor(
    indicator: Indicator,
    data: OhlcvBar[],
    optionValues: number[],
    colors: readonly string[],
    labels: readonly string[],
  ) {
    super();
    this._indicator = indicator;
    this._data = [...data];
    this._optionValues = optionValues;
    this._colors = colors;
    this._labels = labels;
    this._renderer = new HorizontalRenderer();
    this._paneView = new HorizontalPaneView(this, this._renderer);
    this._computeFull();
  }

  // ── ISeriesPrimitive ────────────────────────────────────────────────────────

  updateAllViews(): void {
    this._paneView.update();
  }

  paneViews(): readonly [HorizontalPaneView] {
    return [this._paneView];
  }

  /**
   * Extend the Y-axis to include all pivot / S/R levels so the chart
   * doesn't clip them off-screen when they are far from the price range.
   */
  autoscaleInfo(_start: Logical, _end: Logical): AutoscaleInfo | null {
    if (!isFinite(this._minValue)) return null;
    return {
      priceRange: { minValue: this._minValue, maxValue: this._maxValue },
    };
  }

  // ── Public streaming / data API ───────────────────────────────────────────

  /**
   * Append one bar.  Pivot levels are period-based so a full recompute is
   * needed to pick up any change; the state-based batch path would work too
   * but the dataset is small enough that this is simpler and always correct.
   */
  appendBar(bar: OhlcvBar): void {
    this._data.push(bar);
    this._computeFull();
    this.requestUpdate();
  }

  /** Replace all data and recompute. */
  setData(data: OhlcvBar[]): void {
    this._data = [...data];
    this._computeFull();
    this.requestUpdate();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _computeFull(): void {
    const info = this._indicator.info;
    const inputs = extractInputs(this._data, info.inputs);

    const [rawOutputs, rawState] = this._indicator.indicator(
      inputs,
      this._optionValues,
      undefined,
    );
    this._state = rawState as unknown as WasmState;

    this._minValue = Infinity;
    this._maxValue = -Infinity;
    this.levels = [];

    const numOutputs = info.outputs.length;

    // Pivot Point (and similar indicators) pack all level values into a single
    // output array: rawOutputs[0] = [s3, s2, s1, pp, r1, r2, r3].
    // Detect this by checking whether there is exactly one output series whose
    // length matches the number of declared outputs.
    const packed =
      rawOutputs.length === 1 && rawOutputs[0].length === numOutputs;

    for (let i = 0; i < numOutputs; i++) {
      const price = packed
        ? rawOutputs[0][i] // unpack flat array
        : rawOutputs[i]?.[rawOutputs[i].length - 1]; // normal: last value of each series

      if (price === undefined || !isFinite(price)) continue;

      if (price < this._minValue) this._minValue = price;
      if (price > this._maxValue) this._maxValue = price;

      this.levels.push({
        price,
        color: this._colors[i] ?? SERIES_COLORS[i % SERIES_COLORS.length],
        label: this._labels[i] ?? info.outputs[i] ?? `L${i}`,
      });
    }
  }
}
