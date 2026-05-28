import type { IChartApi } from 'lightweight-charts';

// ── PaneManager ───────────────────────────────────────────────────────────────

/**
 * Tracks oscillator pane allocation for a single chart instance.
 *
 * - Pane 0 is always the price chart (candlesticks).
 * - Panes 1+ are allocated sequentially for oscillator indicators.
 *
 * Multiple output series belonging to the same indicator occupy the same pane
 * and share a single allocation slot (the `OscillatorHandle` calls `allocate`
 * once and `release` once regardless of how many series it creates).
 */
class PaneManager {
  private _next = 1;
  private _refCounts = new Map<number, number>();

  /** Reserve the next free pane and return its index. */
  allocate(): number {
    const pane = this._next++;
    this._refCounts.set(pane, 1);
    return pane;
  }

  /**
   * Release a pane.  If it was the topmost allocated pane, reclaim the slot
   * so the next `allocate()` reuses it.
   */
  release(pane: number): void {
    const remaining = (this._refCounts.get(pane) ?? 1) - 1;
    if (remaining <= 0) {
      this._refCounts.delete(pane);
      if (pane === this._next - 1) {
        this._next--;
      }
    } else {
      this._refCounts.set(pane, remaining);
    }
  }
}

// WeakMap keyed on the chart instance so the manager is GC'd automatically
// when the chart is destroyed.
const _managers = new WeakMap<IChartApi, PaneManager>();

/**
 * Return the PaneManager for a chart, creating it lazily on first call.
 * All `addIndicator()` calls on the same chart share the same manager.
 */
export function getPaneManager(chart: IChartApi): PaneManager {
  let manager = _managers.get(chart);
  if (!manager) {
    manager = new PaneManager();
    _managers.set(chart, manager);
  }
  return manager;
}
