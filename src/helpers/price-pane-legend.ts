/**
 * PricePaneLegend — a single shared `PaneLabelPrimitive` on the price chart
 * pane (pane 0) that accumulates legend entries from every active overlay
 * indicator, displaying them as one horizontal legend.
 *
 * Usage:
 *   const key = {};                                   // unique per indicator
 *   getPricePaneLegend(chart).add(key, entries);       // on addIndicator
 *   getPricePaneLegend(chart).remove(key);             // on handle.remove()
 */
import type { IChartApi } from "lightweight-charts";
import { PaneLabelPrimitive } from "../oscillators/pane-label-primitive.js";
import type { LegendEntry } from "../oscillators/pane-label-primitive.js";

export type { LegendEntry };

// ── PricePaneLegend ───────────────────────────────────────────────────────────

class PricePaneLegend {
  private _primitive: PaneLabelPrimitive;
  private _groups = new Map<object, LegendEntry[]>();

  constructor(chart: IChartApi) {
    this._primitive = new PaneLabelPrimitive("", []);
    chart.panes()[0]?.attachPrimitive(this._primitive);
  }

  /**
   * Register a set of legend entries for one indicator instance.
   * `key` must be a unique object created per `addIndicator` call so entries
   * can be individually removed later.
   */
  add(key: object, entries: LegendEntry[]): void {
    this._groups.set(key, entries);
    this._flush();
  }

  /** Remove the entries registered under `key` (called from `remove()`). */
  remove(key: object): void {
    this._groups.delete(key);
    this._flush();
  }

  private _flush(): void {
    const all: LegendEntry[] = [];
    for (const group of this._groups.values()) {
      all.push(...group);
    }
    this._primitive.setEntries(all);
  }
}

// WeakMap so the legend is GC'd when the chart is destroyed.
const _cache = new WeakMap<IChartApi, PricePaneLegend>();

/**
 * Return the `PricePaneLegend` for a chart, creating it lazily on first call.
 * All overlay indicators on the same chart share the same instance.
 */
export function getPricePaneLegend(chart: IChartApi): PricePaneLegend {
  let legend = _cache.get(chart);
  if (!legend) {
    legend = new PricePaneLegend(chart);
    _cache.set(chart, legend);
  }
  return legend;
}
