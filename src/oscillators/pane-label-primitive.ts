import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
} from "lightweight-charts";

// ── Types ─────────────────────────────────────────────────────────────────────

/** One entry in the pane legend — a series name and its CSS color string. */
export interface LegendEntry {
  name: string;
  color: string;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

const FONT = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SEG_W = 14; // colored dash width (px)
const SEG_GAP = 4; // gap between dash and name
const ENTRY_GAP = 10; // gap between consecutive entries
const LABEL_GAP = 12; // gap between group label and first entry
const LEFT_PAD = 8; // left margin
const TOP = 14; // first-row baseline (px)
const LINE_H = 14; // line height for wrapping

class PaneLabelRenderer implements IPrimitivePaneRenderer {
  private _label: string;
  private _series: LegendEntry[];

  constructor(label: string, series: LegendEntry[]) {
    this._label = label;
    this._series = series;
  }

  setEntries(entries: LegendEntry[]): void {
    this._series = entries;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._label && this._series.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();
      ctx.font = FONT;
      ctx.textBaseline = "alphabetic";

      let x = LEFT_PAD;
      let y = TOP;

      // ── Group label ──────────────────────────────────────────────────────
      if (this._label) {
        ctx.fillStyle = "rgba(180, 180, 180, 0.6)";
        ctx.fillText(this._label, x, y);
        x += ctx.measureText(this._label).width + LABEL_GAP;
      }

      // ── Colored series entries ───────────────────────────────────────────
      for (const { name, color } of this._series) {
        const nameW = ctx.measureText(name).width;
        const entryW = SEG_W + SEG_GAP + nameW + ENTRY_GAP;

        // Wrap to next row if this entry would overflow (but never on the
        // very first entry — always draw at least one entry per row).
        if (x > LEFT_PAD && x + entryW > mediaSize.width - LEFT_PAD) {
          x = LEFT_PAD;
          y += LINE_H;
        }

        // Colored dash
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + SEG_W, y - 4);
        ctx.stroke();
        x += SEG_W + SEG_GAP;

        // Colored name
        ctx.fillStyle = color;
        ctx.fillText(name, x, y);
        x += nameW + ENTRY_GAP;
      }

      ctx.restore();
    });
  }
}

// ── Pane view ─────────────────────────────────────────────────────────────────

class PaneLabelView implements IPanePrimitivePaneView {
  private _renderer: PaneLabelRenderer;

  constructor(label: string, series: LegendEntry[]) {
    this._renderer = new PaneLabelRenderer(label, series);
  }

  setEntries(entries: LegendEntry[]): void {
    this._renderer.setEntries(entries);
  }

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

// ── Public class ──────────────────────────────────────────────────────────────

/**
 * An `IPanePrimitive` that draws a compact horizontal legend at the top-left
 * of the pane it is attached to.
 *
 * The legend shows the display-group label followed by one entry per series:
 * a short colored dash and the output name.  Long legends wrap to the next
 * row when they reach the right edge of the pane.
 *
 * Attach via `pane.attachPrimitive(primitive)` and detach via
 * `pane.detachPrimitive(primitive)` before removing series from the pane
 * (LWC auto-removes empty panes, so detach while the pane still exists).
 */
export class PaneLabelPrimitive {
  private _view: PaneLabelView;

  constructor(label: string, series: LegendEntry[] = []) {
    this._view = new PaneLabelView(label, series);
  }

  /** Replace the legend entries after construction (used by PricePaneLegend). */
  setEntries(entries: LegendEntry[]): void {
    this._view.setEntries(entries);
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    return [this._view];
  }
}
