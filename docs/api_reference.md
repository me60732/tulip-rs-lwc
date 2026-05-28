# API Reference

---

## `init(wasmUrl?)`

Re-exported from `tulip-rs-wasm`. Initialises the WASM module. Must be called **once** before any `addIndicator()` calls.

```ts
function init(wasmUrl?: string | URL | Request): Promise<void>
```

| Parameter | Type | Description |
|---|---|---|
| `wasmUrl` | `string \| URL \| Request \| undefined` | URL of the `.wasm` binary. Omit when using a bundler (Vite, webpack) — the asset is resolved automatically. Required when loading from a CDN or serving files without a bundler. |

**Returns:** `Promise<void>` — resolves when the WASM module is ready.

**Example:**

```ts
// Bundler — no URL needed
await init();

// CDN
await init('https://cdn.jsdelivr.net/npm/tulip-rs-wasm@0.1.0/pkg/tulip_rs_wasm_bg.wasm');
```

---

## `addIndicator(chart, sourceSeries, name, data, options, addOptions?)`

Add a tulip-rs technical indicator to a Lightweight Charts v5 chart. Routes automatically to an overlay primitive or an oscillator pane based on the indicator's `displayType`.

```ts
function addIndicator(
  chart:        IChartApi,
  sourceSeries: ISeriesApi<keyof SeriesOptionsMap>,
  name:         string,
  data:         OhlcvBar[],
  options:      number[],
  addOptions?:  AddIndicatorOptions,
): IndicatorHandle
```

| Parameter | Type | Description |
|---|---|---|
| `chart` | `IChartApi` | The LWC chart instance (return value of `createChart()`). |
| `sourceSeries` | `ISeriesApi<...>` | The primary price series. Overlay primitives attach to this series; its price scale is used for Y-axis coordinate conversion. |
| `name` | `string` | Lower-case indicator name, e.g. `'sma'`, `'rsi'`, `'bbands'`. See [Indicators](indicators.md) for the full list. |
| `data` | `OhlcvBar[]` | Full OHLCV dataset. The `volume` field is required for volume-based indicators (AD, OBV, MFI, KVO, ADOSC, EMV, NVI, PVI, VWMA, VOSC). |
| `options` | `number[]` | Numeric indicator parameters in the order the indicator expects (e.g. `[14]` for RSI period, `[20, 2]` for BBands period and stddev). |
| `addOptions` | `AddIndicatorOptions` | Visual and pane configuration. All fields are optional. |

**Returns:** [`IndicatorHandle`](#indicatorhandle)

**Throws:**
- If `name` is `'candlestick'` — the candlestick pattern indicator returns objects, not numeric series, and is not supported.
- If `name` is unknown — an informative error with the indicator name is thrown.

**Example:**

```ts
// Overlay
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

// Overlay with options
const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  colors:   ['#ef5350', '#2196F3', '#ef5350'],
  fillBand: true,
});

// Oscillator
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14], {
  colors: ['#9C27B0'],
});
```

---

## `IndicatorHandle`

Returned by every `addIndicator()` call. Use it to update data or remove the indicator.

```ts
type IndicatorHandle = {
  remove():          void;
  setData(data: OhlcvBar[]): void;
  appendBar(bar: OhlcvBar):  void;
};
```

### `.remove()`

Remove the indicator from the chart and free all associated resources.

- **Overlays:** detaches the `ISeriesPrimitive` from the source series.
- **Oscillators:** removes all `LineSeries` / `HistogramSeries` from the chart; releases the allocated pane (unless you specified a custom `paneIndex` in `AddIndicatorOptions`).

```ts
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
sma.remove();
```

### `.setData(data)`

Replace the full dataset and recompute the indicator from scratch. The indicator remains on the same pane / primitive — only the underlying data and state are reset.

Use this when the user changes the symbol or timeframe:

```ts
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

async function onSymbolChange(newOhlcv) {
  candles.setData(newOhlcv);
  sma.setData(newOhlcv);  // recomputes on the new dataset
}
```

### `.appendBar(bar)`

Append one new bar and update the indicator **incrementally** using the stored `State` object. O(1) per call — does not reprocess history.

```ts
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

ws.onmessage = (event) => {
  const bar = JSON.parse(event.data);
  candles.update(bar);
  sma.appendBar(bar);
};
```

During the warmup period (i.e. before the indicator has accumulated enough bars to produce output), `appendBar()` feeds the bar to the internal state but draws nothing. Once warmup is complete, each call produces one new chart point.

---

## `AddIndicatorOptions`

Optional configuration passed as the sixth argument to `addIndicator()`. All fields are optional.

```ts
type AddIndicatorOptions = {
  colors?:    string[];
  fillBand?:  boolean;
  lineWidth?: number;
  paneIndex?: number;
};
```

### `colors`

One CSS colour string per output series. Accepts any valid CSS colour — hex, `rgb()`, `rgba()`, named colours.

If fewer colours are provided than there are output series, the remaining series cycle through the built-in default palette:

```
['#2196F3', '#ef5350', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B']
```

```ts
// Single output
{ colors: ['#FFD700'] }

// Multi-output (BBands)
{ colors: ['#ef5350', '#2196F3', '#ef5350'] }

// Semi-transparent
{ colors: ['rgba(33, 150, 243, 0.7)'] }
```

### `fillBand`

`boolean` — shade the area between the **first** and **last** output series with a semi-transparent fill. Drawn behind candlesticks.

Intended for band-style indicators (Bollinger Bands, Donchian Channels, etc.). Default: `false`.

```ts
const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  fillBand: true,
});
```

### `lineWidth`

`number` — line width in pixels for `LineSeries` outputs. Default: `1`.

Has no effect on overlay primitives (which always use `lineWidth = 1` on the canvas) or on `HistogramSeries` outputs.

```ts
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20], {
  lineWidth: 2,
});
```

### `paneIndex`

`number` — force the oscillator into a specific pane instead of allocating the next free pane automatically. Has no effect on overlay indicators.

When you specify `paneIndex`, the pane is **not** released when `remove()` is called — pane lifecycle becomes your responsibility.

Use this to place two oscillators in the same pane:

```ts
const rsi      = addIndicator(chart, candles, 'rsi',      ohlcv, [14]);    // auto → pane 1
const stochrsi = addIndicator(chart, candles, 'stochrsi', ohlcv, [14], {
  paneIndex: 1,   // share RSI's pane
  colors:    ['#FF9800'],
});
```

---

## `OhlcvBar`

The data type for OHLCV bars, used by `addIndicator()`, `setData()`, and `appendBar()`.

```ts
type OhlcvBar = {
  time:    Time;    // LWC Time — string ('2024-01-02'), UTCTimestamp (number), or BusinessDay
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume?: number;  // required for volume-based indicators
};
```

`Time` is the Lightweight Charts time type — the same type you use with `series.setData()`. All three LWC time formats are supported: ISO date strings (`'2024-01-02'`), Unix timestamps in seconds, and `{ year, month, day }` objects.

---

## Exports

All public types and the two function exports are available from the package root:

```ts
import {
  init,            // function — initialise WASM
  addIndicator,    // function — add an indicator
} from 'tulip-rs-lwc';

import type {
  OhlcvBar,             // input bar type
  IndicatorHandle,      // handle returned by addIndicator()
  AddIndicatorOptions,  // visual/pane config
} from 'tulip-rs-lwc';
```
