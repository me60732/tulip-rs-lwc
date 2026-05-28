/**
 * OverlayPrimitive — draws indicator lines (and optional band fill) directly
 * on the price chart pane as an `ISeriesPrimitive<Time>`.
 *
 * Rendering architecture (follows the official bands-indicator pattern):
 *   - `drawBackground()` — band fill drawn BEHIND candlesticks
 *   - `draw()`           — indicator lines drawn IN FRONT of candlesticks
 *
 * Streaming:
 *   - Initial compute:  `indicator.indicator()` — full history, stores State
 *   - Incremental:      `appendBar()` calls `state.batchIndicator()` — O(1)
 */
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  AutoscaleInfo,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  Time,
} from 'lightweight-charts';
import type { Indicator } from 'tulip-rs-wasm';
import { PluginBase } from '../plugin-base.js';
import { alignOutputs, appendAlignedPoint } from '../helpers/align-outputs.js';
import { extractInputs } from '../helpers/input-extractor.js';
import { SERIES_COLORS, BAND_FILL_ALPHA } from '../constants.js';
import type { AlignedPoint, OhlcvBar, WasmState } from '../types.js';

// ── Renderer ──────────────────────────────────────────────────────────────────

interface RendererLine {
  color:  string;
  points: Array<{ x: number; y: number }>;
}

interface RendererData {
  lines:    RendererLine[];
  fillBand: boolean;
}

class OverlayRenderer implements IPrimitivePaneRenderer {
  private _data: RendererData = { lines: [], fillBand: false };

  update(data: RendererData): void {
    this._data = data;
  }

  // Indicator lines are drawn in front of candlesticks.
  draw(target: CanvasRenderingTarget2D): void {
    const { lines } = this._data;
    if (lines.length === 0) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx  = scope.context;
      const xr   = scope.horizontalPixelRatio;
      const yr   = scope.verticalPixelRatio;

      ctx.save();
      ctx.scale(xr, yr);

      for (const line of lines) {
        if (line.points.length < 2) continue;
        const path = new Path2D();
        path.moveTo(line.points[0].x, line.points[0].y);
        for (let i = 1; i < line.points.length; i++) {
          path.lineTo(line.points[i].x, line.points[i].y);
        }
        ctx.strokeStyle = line.color;
        ctx.lineWidth   = 1;
        ctx.stroke(path);
      }

      ctx.restore();
    });
  }

  // Band fill is drawn behind candlesticks.
  drawBackground(target: CanvasRenderingTarget2D): void {
    const { lines, fillBand } = this._data;
    if (!fillBand || lines.length < 2) return;

    const upper = lines[0].points;
    const lower = lines[lines.length - 1].points;
    if (upper.length === 0 || lower.length === 0) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const xr  = scope.horizontalPixelRatio;
      const yr  = scope.verticalPixelRatio;

      ctx.save();
      ctx.scale(xr, yr);

      const region = new Path2D();
      region.moveTo(upper[0].x, upper[0].y);
      for (const p of upper) region.lineTo(p.x, p.y);
      // Walk lower band in reverse to close the shape
      for (let i = lower.length - 1; i >= 0; i--) region.lineTo(lower[i].x, lower[i].y);
      region.closePath();

      ctx.globalAlpha = BAND_FILL_ALPHA;
      ctx.fillStyle   = lines[0].color;
      ctx.fill(region);
      ctx.restore();
    });
  }
}

// ── Pane view ─────────────────────────────────────────────────────────────────

class OverlayPaneView implements IPrimitivePaneView {
  private _primitive: OverlayPrimitive;
  private _renderer:  OverlayRenderer;

  constructor(primitive: OverlayPrimitive, renderer: OverlayRenderer) {
    this._primitive = primitive;
    this._renderer  = renderer;
  }

  /**
   * Called by LWC before every paint cycle.
   * Converts stored {time, value} points → canvas {x, y} coordinates.
   */
  update(): void {
    const chart     = this._primitive.chart;
    const series    = this._primitive.series;
    const timeScale = chart.timeScale();
    const aligned   = this._primitive.alignedData;
    const colors    = this._primitive.colors;
    const numOut    = aligned[0]?.values.length ?? 0;

    const lines: RendererLine[] = Array.from({ length: numOut }, (_, i) => ({
      color:  colors[i] ?? SERIES_COLORS[i % SERIES_COLORS.length],
      points: [],
    }));

    for (const { time, values } of aligned) {
      const x = timeScale.timeToCoordinate(time);
      if (x === null) continue;
      values.forEach((val, i) => {
        const y = series.priceToCoordinate(val);
        if (y !== null) lines[i].points.push({ x, y });
      });
    }

    this._renderer.update({ lines, fillBand: this._primitive.fillBand });
  }

  renderer(): OverlayRenderer {
    return this._renderer;
  }
}

// ── OverlayPrimitive ──────────────────────────────────────────────────────────

export class OverlayPrimitive extends PluginBase {
  // These fields are accessed by OverlayPaneView (package-internal).
  /** @internal */ alignedData: AlignedPoint[] = [];
  /** @internal */ colors:      string[];
  /** @internal */ fillBand:    boolean;

  private _data:         OhlcvBar[];
  private _indicator:    Indicator;
  private _optionValues: number[];
  private _state:        WasmState | null = null;
  private _minValue      = Infinity;
  private _maxValue      = -Infinity;
  private _renderer:     OverlayRenderer;
  private _paneView:     OverlayPaneView;

  constructor(
    indicator:    Indicator,
    data:         OhlcvBar[],
    optionValues: number[],
    colors:       string[],
    fillBand:     boolean,
  ) {
    super();
    this._indicator    = indicator;
    this._data         = [...data];
    this._optionValues = optionValues;
    this.colors        = colors;
    this.fillBand      = fillBand;
    this._renderer     = new OverlayRenderer();
    this._paneView     = new OverlayPaneView(this, this._renderer);
    this._computeFull();
  }

  // ── ISeriesPrimitive ────────────────────────────────────────────────────────

  updateAllViews(): void {
    this._paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  /**
   * Extend the Y-axis scale to include indicator values.
   * Returns the global min/max of all computed output values (not viewport-
   * restricted for simplicity; a future version could use UpperLowerInRange).
   */
  autoscaleInfo(_start: Logical, _end: Logical): AutoscaleInfo | null {
    if (!isFinite(this._minValue)) return null;
    return {
      priceRange: { minValue: this._minValue, maxValue: this._maxValue },
    };
  }

  // ── Public streaming / data API ───────────────────────────────────────────

  /**
   * Append one bar and update incrementally via `state.batchIndicator()`.
   * Does not reprocess historical data — O(1) per call.
   */
  appendBar(bar: OhlcvBar): void {
    this._data.push(bar);

    if (!this._state) {
      // Guard: state not initialised yet (no-op during warmup on first call
      // before indicator has produced any output at all).
      this._computeFull();
      return;
    }

    const inputs       = extractInputs([bar], this._indicator.info.inputs);
    const batchOutputs = this._state.batchIndicator(inputs);
    const added        = appendAlignedPoint(this.alignedData, bar.time, batchOutputs);

    if (added) {
      const last = this.alignedData[this.alignedData.length - 1];
      for (const v of last.values) {
        if (v < this._minValue) this._minValue = v;
        if (v > this._maxValue) this._maxValue = v;
      }
    }

    this.requestUpdate();
  }

  /** Replace all data and recompute from scratch. */
  setData(data: OhlcvBar[]): void {
    this._data = [...data];
    this._computeFull();
    this.requestUpdate();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _computeFull(): void {
    const info   = this._indicator.info;
    const inputs = extractInputs(this._data, info.inputs);

    const [outputs, rawState] = this._indicator.indicator(inputs, this._optionValues);
    // Cast the opaque wasm-bindgen State to our typed interface.
    this._state = rawState as unknown as WasmState;

    const lookback   = this._data.length - (outputs[0]?.length ?? 0);
    this.alignedData = alignOutputs(this._data, outputs, lookback);
    this._rebuildMinMax();
  }

  private _rebuildMinMax(): void {
    this._minValue = Infinity;
    this._maxValue = -Infinity;
    for (const { values } of this.alignedData) {
      for (const v of values) {
        if (v < this._minValue) this._minValue = v;
        if (v > this._maxValue) this._maxValue = v;
      }
    }
  }
}
