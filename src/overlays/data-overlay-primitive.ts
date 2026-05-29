/**
 * DataOverlayPrimitive — renders pre-computed line series directly on the
 * price chart pane as an `ISeriesPrimitive<Time>`.
 *
 * Unlike OverlayPrimitive, this class does NOT compute any indicator itself.
 * It just renders whatever per-output line data is pushed into it via
 * `setData()` / `appendPoint()`.
 *
 * Each output line is stored independently as `{time, value}[]`, back-aligned
 * from the end so different lookback lengths each start at their own natural
 * first bar without any trimming.
 *
 * Used by OscillatorHandle to render price-scale optional outputs (e.g.
 * short_ema / long_ema for APO, MACD, PPO) on the main price chart while
 * the oscillator line itself stays in its own separate pane.
 */
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Time,
} from "lightweight-charts";
import { PluginBase } from "../plugin-base.js";
import { SERIES_COLORS } from "../constants.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RendererLine {
  color: string;
  points: Array<{ x: number; y: number }>;
}

export type LinePoint = { time: Time; value: number };

// ── Renderer ──────────────────────────────────────────────────────────────────

class DataOverlayRenderer implements IPrimitivePaneRenderer {
  private _lines: RendererLine[] = [];

  update(lines: RendererLine[]): void {
    this._lines = lines;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._lines.length === 0) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      for (const line of this._lines) {
        if (line.points.length < 2) continue;
        const path = new Path2D();
        path.moveTo(line.points[0].x, line.points[0].y);
        for (let i = 1; i < line.points.length; i++) {
          path.lineTo(line.points[i].x, line.points[i].y);
        }
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1;
        ctx.stroke(path);
      }
      ctx.restore();
    });
  }
}

// ── Pane view ─────────────────────────────────────────────────────────────────

class DataOverlayPaneView implements IPrimitivePaneView {
  private _primitive: DataOverlayPrimitive;
  private _renderer: DataOverlayRenderer;

  constructor(primitive: DataOverlayPrimitive, renderer: DataOverlayRenderer) {
    this._primitive = primitive;
    this._renderer = renderer;
  }

  update(): void {
    const chart = this._primitive.chart;
    const series = this._primitive.series;
    const timeScale = chart.timeScale();

    // Each line is independent — different lengths are fine since they're
    // back-aligned and rendered separately.
    const rendererLines: RendererLine[] = this._primitive.lines.map(
      (lineData, i) => {
        const color =
          this._primitive.colors[i] ?? SERIES_COLORS[i % SERIES_COLORS.length];
        const points: { x: number; y: number }[] = [];
        for (const { time, value } of lineData) {
          const x = timeScale.timeToCoordinate(time);
          if (x === null) continue;
          const y = series.priceToCoordinate(value);
          if (y !== null) points.push({ x, y });
        }
        return { color, points };
      },
    );

    this._renderer.update(rendererLines);
  }

  renderer(): DataOverlayRenderer {
    return this._renderer;
  }
}

// ── DataOverlayPrimitive ──────────────────────────────────────────────────────

export class DataOverlayPrimitive extends PluginBase {
  /** @internal — one array per output, back-aligned independently */
  lines: LinePoint[][] = [];
  /** @internal */ colors: string[];

  private _renderer: DataOverlayRenderer;
  private _paneView: DataOverlayPaneView;

  constructor(colors: string[]) {
    super();
    this.colors = colors;
    this._renderer = new DataOverlayRenderer();
    this._paneView = new DataOverlayPaneView(this, this._renderer);
  }

  // ── Public data API ────────────────────────────────────────────────────────

  /**
   * Replace all line data. Each element of `lines` is one output series,
   * already back-aligned (last element = last bar).
   */
  setData(lines: LinePoint[][]): void {
    this.lines = lines;
    this.requestUpdate();
  }

  /**
   * Append the latest bar's values from `state.batchIndicator()`.
   * `batchSlice` is the subset of the full batch output for this primitive's
   * outputs, in the same order as `colors`.
   * Skips any output still in its warmup period (empty Float64Array).
   */
  appendPoint(time: Time, batchSlice: Float64Array[]): void {
    let anyAdded = false;
    batchSlice.forEach((out, i) => {
      if (!out || out.length === 0) return;
      if (!this.lines[i]) this.lines[i] = [];
      this.lines[i].push({ time, value: out[out.length - 1] });
      anyAdded = true;
    });
    if (anyAdded) this.requestUpdate();
  }

  // ── ISeriesPrimitive ───────────────────────────────────────────────────────

  updateAllViews(): void {
    this._paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  // autoscaleInfo intentionally omitted — price-scale MA values (EMAs/SMAs of
  // close price) always fall within the candlestick range by definition.
}
