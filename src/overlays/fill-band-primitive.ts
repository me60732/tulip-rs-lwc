import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Time,
} from "lightweight-charts";
import { PluginBase } from "../plugin-base.js";
import { BAND_FILL_ALPHA } from "../constants.js";

type XY = { x: number; y: number };

class FillBandRenderer implements IPrimitivePaneRenderer {
  private _upper: XY[] = [];
  private _lower: XY[] = [];
  private _color = "#2196F3";

  update(upper: XY[], lower: XY[], color: string): void {
    this._upper = upper;
    this._lower = lower;
    this._color = color;
  }

  draw(): void {
    /* foreground: nothing — lines are drawn by LineSeries */
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    const { _upper: upper, _lower: lower, _color: color } = this;
    if (upper.length < 2 || lower.length < 2) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const xr = scope.horizontalPixelRatio;
      const yr = scope.verticalPixelRatio;
      ctx.save();
      ctx.scale(xr, yr);
      const region = new Path2D();
      region.moveTo(upper[0].x, upper[0].y);
      for (const p of upper) region.lineTo(p.x, p.y);
      for (let i = lower.length - 1; i >= 0; i--)
        region.lineTo(lower[i].x, lower[i].y);
      region.closePath();
      ctx.globalAlpha = BAND_FILL_ALPHA;
      ctx.fillStyle = color;
      ctx.fill(region);
      ctx.restore();
    });
  }
}

class FillBandPaneView implements IPrimitivePaneView {
  constructor(
    private readonly _prim: FillBandPrimitive,
    private readonly _renderer: FillBandRenderer,
  ) {}

  update(): void {
    const ts = this._prim.chart.timeScale();
    const series = this._prim.series;

    const toXY = (pts: { time: Time; value: number }[]): XY[] =>
      pts.flatMap(({ time, value }) => {
        const x = ts.timeToCoordinate(time);
        if (x === null) return [];
        const y = series.priceToCoordinate(value);
        if (y === null) return [];
        return [{ x, y }];
      });

    this._renderer.update(
      toXY(this._prim.line1),
      toXY(this._prim.line2),
      this._prim.color,
    );
  }

  renderer(): FillBandRenderer {
    return this._renderer;
  }
}

/**
 * FillBandPrimitive — draws a translucent fill between two time-value series.
 *
 * Attach to the candlestick series so it shares the price-pane coordinate
 * space.  The fill is drawn in `drawBackground` (behind candles).
 *
 * Call `setData(line1, line2)` whenever the underlying series data changes.
 * `line1` is typically the upper series; `line2` the lower.
 */
export class FillBandPrimitive extends PluginBase {
  /** @internal */ line1: { time: Time; value: number }[] = [];
  /** @internal */ line2: { time: Time; value: number }[] = [];
  /** @internal */ color: string;

  private readonly _renderer = new FillBandRenderer();
  private readonly _view: FillBandPaneView;

  constructor(color: string) {
    super();
    this.color = color;
    this._view = new FillBandPaneView(this, this._renderer);
  }

  setData(
    line1: { time: Time; value: number }[],
    line2: { time: Time; value: number }[],
  ): void {
    this.line1 = line1;
    this.line2 = line2;
    this.requestUpdate();
  }

  updateAllViews(): void {
    this._view.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view];
  }
}
