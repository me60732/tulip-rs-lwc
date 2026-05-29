/**
 * pattern-highlight-primitive.ts
 *
 * An ISeriesPrimitive that:
 *   - Subscribes to crosshair moves.
 *   - When the user hovers a bar that belongs to one or more candlestick patterns, draws:
 *       • drawBackground() — semi-transparent highlight rects spanning each pattern's bars.
 *       • draw()           — floating tooltip: full name, Japanese name, forecast for ALL patterns.
 */

import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  MouseEventParams,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import { PluginBase } from "../plugin-base.js";
import type { OhlcvBar } from "../types.js";

// ── Public types ──────────────────────────────────────────────────────────────

/** Metadata for one detected candlestick pattern. */
export interface PatternEntry {
  /** Index into the data array for the first (start) bar of the pattern. */
  startIdx: number;
  /** Index into the data array for the last (detection) bar of the pattern. */
  endIdx: number;
  startTime: Time;
  endTime: Time;
  fullName: string;
  japaneseName: string;
  forecast: string;
  /** CSS colour matching the forecast type. */
  color: string;
}

// ── Renderer helpers ──────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Renderer data ─────────────────────────────────────────────────────────────

interface RendererData {
  patterns: PatternEntry[];
  rects: Array<{ startX: number; endX: number; color: string }>;
  halfBar: number;
  midX: number | null; // anchor for tooltip (midpoint of union of all spans)
}

/** Human-readable label for each forecast type — long variants are abbreviated. */
function forecastLabel(forecast: string): string {
  const MAP: Record<string, string> = {
    BullishReversal: "Bullish Reversal",
    BearishReversal: "Bearish Reversal",
    BullishContinuation: "Bullish Continuation",
    BearishContinuation: "Bearish Continuation",
    BullishReversalOrContinuation: "Bullish Rev. / Cont.",
    BearishReversalOrContinuation: "Bearish Rev. / Cont.",
    Unknown: "Unknown",
  };
  return MAP[forecast] ?? forecast.replace(/([A-Z])/g, " $1").trim();
}

class PatternHighlightRenderer implements IPrimitivePaneRenderer {
  private _data: RendererData = {
    patterns: [],
    rects: [],
    halfBar: 4,
    midX: null,
  };

  update(data: RendererData): void {
    this._data = data;
  }

  /** Highlight rectangles — drawn behind candles. */
  drawBackground(target: CanvasRenderingTarget2D): void {
    const { rects, halfBar } = this._data;
    if (!rects.length) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const xr = scope.horizontalPixelRatio;
      const yr = scope.verticalPixelRatio;
      const ph = scope.bitmapSize.height / yr; // CSS px height of pane

      ctx.save();
      ctx.scale(xr, yr);

      for (const r of rects) {
        const left = r.startX - halfBar;
        const width = Math.max(halfBar * 2, r.endX - r.startX + halfBar * 2);

        ctx.fillStyle = hexToRgba(r.color, 0.12);
        ctx.fillRect(left, 0, width, ph);

        ctx.strokeStyle = hexToRgba(r.color, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, 0);
        ctx.lineTo(left, ph);
        ctx.moveTo(left + width, 0);
        ctx.lineTo(left + width, ph);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  /** Tooltip box — drawn in front of candles. */
  draw(target: CanvasRenderingTarget2D): void {
    const { patterns, midX } = this._data;
    if (!patterns.length || midX === null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const xr = scope.horizontalPixelRatio;
      const yr = scope.verticalPixelRatio;
      const pw = scope.bitmapSize.width / xr;
      const ph = scope.bitmapSize.height / yr;

      ctx.save();
      ctx.scale(xr, yr);
      this._drawTooltip(ctx, patterns, midX, pw, ph);
      ctx.restore();
    });
  }

  private _drawTooltip(
    ctx: CanvasRenderingContext2D,
    patterns: PatternEntry[],
    anchorX: number,
    paneW: number,
    paneH: number,
  ): void {
    const PAD = 9;
    const LH = 17;
    const SECTION_H = 2 * LH;
    const SEP = 7;
    const W = 225;
    const FONT =
      '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

    const N = patterns.length;
    const totalH = N * SECTION_H + (N > 1 ? (N - 1) * SEP : 0) + PAD * 2;

    let bx = Math.max(4, Math.min(anchorX - W / 2, paneW - W - 4));
    const allBearish = patterns.every((p) => p.forecast.startsWith("Bearish"));
    const by = allBearish ? paneH - totalH - 8 : 8;

    // Background
    ctx.fillStyle = "rgba(19,23,34,0.93)";
    roundRect(ctx, bx, by, W, totalH, 5);
    ctx.fill();

    // Border colour: uniform if all same colour, otherwise neutral
    const uniqueColors = [...new Set(patterns.map((p) => p.color))];
    ctx.strokeStyle =
      uniqueColors.length === 1 ? hexToRgba(uniqueColors[0], 0.75) : "#4a4e5e";
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, W, totalH, 5);
    ctx.stroke();

    let ty = by + PAD;
    for (let si = 0; si < patterns.length; si++) {
      const p = patterns[si];
      const label = forecastLabel(p.forecast);

      // Separator between patterns
      if (si > 0) {
        ctx.strokeStyle = "#2a2e3e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + PAD, ty + SEP / 2);
        ctx.lineTo(bx + W - PAD, ty + SEP / 2);
        ctx.stroke();
        ty += SEP;
      }

      // Line 1: ● FullName
      ty += LH;
      // dot
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(bx + PAD + 4, ty - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      // name
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = p.color;
      ctx.fillText(p.fullName, bx + PAD + 12, ty);

      // Line 2: JapaneseName · ForecastLabel
      ty += LH;
      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = "#787b86";
      ctx.fillText(`${p.japaneseName}  ·  ${label}`, bx + PAD + 12, ty);
    }
  }
}

// ── Pane view ─────────────────────────────────────────────────────────────────

class PatternHighlightPaneView implements IPrimitivePaneView {
  private readonly _renderer = new PatternHighlightRenderer();

  constructor(private readonly _primitive: PatternHighlightPrimitive) {}

  update(): void {
    const patterns = this._primitive.hoveredPatterns;
    if (!patterns.length) {
      this._renderer.update({
        patterns: [],
        rects: [],
        halfBar: 4,
        midX: null,
      });
      return;
    }

    const ts = this._primitive.chart.timeScale();
    const halfBar = Math.max(2, ts.options().barSpacing / 2);
    const rects: Array<{ startX: number; endX: number; color: string }> = [];

    for (const p of patterns) {
      const startX = ts.timeToCoordinate(p.startTime);
      const endX = ts.timeToCoordinate(p.endTime);
      if (startX !== null && endX !== null) {
        rects.push({ startX, endX, color: p.color });
      }
    }

    // Tooltip anchor = midpoint of the union of all pattern spans
    const allX = rects.flatMap((r) => [r.startX, r.endX]);
    const midX = allX.length
      ? (Math.min(...allX) + Math.max(...allX)) / 2
      : null;

    this._renderer.update({ patterns, rects, halfBar, midX });
  }

  renderer(): PatternHighlightRenderer {
    return this._renderer;
  }
}

// ── PatternHighlightPrimitive ─────────────────────────────────────────────────

export class PatternHighlightPrimitive extends PluginBase {
  /** Currently hovered patterns — read by PatternHighlightPaneView. @internal */
  hoveredPatterns: PatternEntry[] = [];

  private _timeIndex: Map<string, PatternEntry[]> = new Map();
  private _hoveredKey: PatternEntry[] | null = null;
  private _paneView: PatternHighlightPaneView;
  private _crosshairCb: ((p: MouseEventParams<Time>) => void) | null = null;

  constructor() {
    super();
    this._paneView = new PatternHighlightPaneView(this);
  }

  // ── ISeriesPrimitive ─────────────────────────────────────────────────────

  updateAllViews(): void {
    this._paneView.update();
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  // ── PluginBase lifecycle ─────────────────────────────────────────────────

  override attached(params: SeriesAttachedParameter<Time>): void {
    super.attached(params);
    this._crosshairCb = (mouseParams) => {
      const t = mouseParams.time as Time | undefined;
      const patterns = t ? (this._timeIndex.get(String(t)) ?? null) : null;
      if (patterns !== this._hoveredKey) {
        // identity check — same Map slot = same object
        this._hoveredKey = patterns;
        this.hoveredPatterns = patterns ?? [];
        this.requestUpdate();
      }
    };
    this.chart.subscribeCrosshairMove(this._crosshairCb);
  }

  override detached(): void {
    if (this._crosshairCb) {
      // Unsubscribe BEFORE super.detached() clears the chart reference.
      this.chart.unsubscribeCrosshairMove(this._crosshairCb);
      this._crosshairCb = null;
    }
    super.detached();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Replace all stored patterns and rebuild the time index.
   * Maps every bar within each pattern's span to ALL patterns covering that bar,
   * so hovering any bar in a multi-pattern overlap shows every pattern.
   */
  updatePatterns(entries: PatternEntry[], data: OhlcvBar[]): void {
    this._timeIndex.clear();
    this._hoveredKey = null;
    this.hoveredPatterns = [];

    for (const entry of entries) {
      for (let i = entry.startIdx; i <= entry.endIdx; i++) {
        const key = String(data[i].time);
        if (!this._timeIndex.has(key)) {
          this._timeIndex.set(key, []);
        }
        this._timeIndex.get(key)!.push(entry);
      }
    }
    this.requestUpdate();
  }
}
