/**
 * PluginBase — adapted from the official LWC plugin-examples repository.
 * https://github.com/tradingview/lightweight-charts/blob/master/plugin-examples/src/plugins/plugin-base.ts
 *
 * Handles the attach/detach lifecycle, keeps typed references to `chart` and
 * `series`, and wires `series.subscribeDataChanged` → `dataUpdated()`.
 */
import type {
  DataChangedScope,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesOptionsMap,
  Time,
} from 'lightweight-charts';

export abstract class PluginBase implements ISeriesPrimitive<Time> {
  private _chart:         IChartApi | undefined                          = undefined;
  private _series:        ISeriesApi<keyof SeriesOptionsMap> | undefined = undefined;
  private _requestUpdate: (() => void) | undefined                       = undefined;

  // Subclasses opt in to data-change notifications by declaring this method.
  protected dataUpdated?(scope: DataChangedScope): void;

  protected requestUpdate(): void {
    this._requestUpdate?.();
  }

  public attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>): void {
    this._chart  = chart;
    this._series = series;
    this._series.subscribeDataChanged(this._fireDataUpdated);
    this._requestUpdate = requestUpdate;
    this.requestUpdate();
  }

  public detached(): void {
    this._series?.unsubscribeDataChanged(this._fireDataUpdated);
    this._chart         = undefined;
    this._series        = undefined;
    this._requestUpdate = undefined;
  }

  public get chart(): IChartApi {
    if (!this._chart) throw new Error('PluginBase: not attached to a chart');
    return this._chart;
  }

  public get series(): ISeriesApi<keyof SeriesOptionsMap> {
    if (!this._series) throw new Error('PluginBase: not attached to a series');
    return this._series;
  }

  // Arrow function preserves `this` across subscribe/unsubscribe.
  private _fireDataUpdated = (scope: DataChangedScope): void => {
    this.dataUpdated?.(scope);
  };
}
