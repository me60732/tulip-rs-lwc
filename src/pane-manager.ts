import type { IChartApi } from "lightweight-charts";

// ── PaneAllocator interface ──────────────────────────────────────────────────

/**
 * Minimal interface used by OscillatorHandle to allocate and release oscillator
 * panes without depending on the concrete PaneManager class.
 */
export interface PaneAllocator {
  allocate(): number;
  release(pane: number): void;
}

// ── PaneManager ─────────────────────────────────────────────────────────

/**
 * Tracks oscillator pane allocation for a single chart instance.
 *
 * Pane 0 is always the price chart (candlesticks). Panes 1+ are allocated
 * for oscillator indicators.
 *
 * Rather than maintaining an internal counter (which drifts out of sync with
 * LWC after panes are removed), `allocate()` reads `chart.panes().length`
 * directly. LWC auto-removes empty panes when all their series are deleted,
 * so `chart.panes().length` always reflects reality. This guarantees that
 * `moveToPane(allocate())` always lands at the correct next slot, and that
 * two series calling `moveToPane` with the *same* allocated index share a
 * pane rather than each creating a new one.
 */
class PaneManager implements PaneAllocator {
  private _chart: IChartApi;

  constructor(chart: IChartApi) {
    this._chart = chart;
  }

  /**
   * Return the index of the next available pane.
   * Calling `series.moveToPane()` with this value will create a new pane at
   * that position. Subsequent calls with the *same* value move series into
   * the pane that was just created.
   */
  allocate(): number {
    return this._chart.panes().length;
  }

  /**
   * LWC automatically removes a pane when its last series is removed via
   * `chart.removeSeries()`. No explicit release bookkeeping is needed.
   */
  release(_pane: number): void {
    // no-op — LWC handles pane cleanup automatically
  }
}

// WeakMap keyed on the chart instance so the manager is GC’d automatically
// when the chart is destroyed.
const _managers = new WeakMap<IChartApi, PaneManager>();

/**
 * Return the PaneManager for a chart, creating it lazily on first call.
 * All `addIndicator()` calls on the same chart share the same manager.
 */
export function getPaneManager(chart: IChartApi): PaneManager {
  let manager = _managers.get(chart);
  if (!manager) {
    manager = new PaneManager(chart);
    _managers.set(chart, manager);
  }
  return manager;
}
