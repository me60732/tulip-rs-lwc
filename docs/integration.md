# Integration Guide

This page covers how to integrate tulip-rs-lwc into a Lightweight Charts project — from a basic setup to CDN-only usage and TypeScript configuration.

---

## Adding to an Existing Chart

The most common use case: you already have a Lightweight Charts chart with a candlestick (or other) series, and you want to add indicators to it. No refactoring is required.

```ts
import { init, addIndicator } from 'tulip-rs-lwc';

// Existing LWC setup — nothing changes here
const chart   = createChart(container, { width: 800, height: 400 });
const candles = chart.addSeries(CandlestickSeries);
candles.setData(ohlcv);

// Initialise WASM — call once, before addIndicator()
await init();

// Add indicators to the existing chart
const sma   = addIndicator(chart, candles, 'sma',   ohlcv, [20]);
const bb    = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], { fillBand: true });
const rsi   = addIndicator(chart, candles, 'rsi',   ohlcv, [14]);
const macd  = addIndicator(chart, candles, 'macd',  ohlcv, [12, 26, 9]);
```

`addIndicator()` returns a handle for each indicator. Hold on to it if you need to update data or remove the indicator later.

---

## What to Pass

### `chart`

Your `IChartApi` instance — the return value of `createChart()`. tulip-rs-lwc uses this to create series for oscillators and to access the time scale for coordinate conversion in overlays.

### `sourceSeries`

Your primary price series — typically a `CandlestickSeries` but any series type works. Overlay primitives are attached to this series so they share its pane and price scale. It is also used as the Y-axis reference for coordinate conversion.

### `name`

Lower-case indicator name: `'sma'`, `'rsi'`, `'bbands'`, `'macd'`, etc. A full list is in the [Indicators](indicators.md) page. Passing an unknown name throws an informative error.

### `data`

Your OHLCV dataset — the same array you pass to `candles.setData()`. Include the `volume` field for volume-based indicators (AD, OBV, MFI, KVO, ADOSC, EMV, NVI, PVI, VWMA, VOSC).

```ts
type OhlcvBar = {
  time:    Time;    // LWC Time — string, number, or { year, month, day }
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume?: number;  // required only for volume indicators
};
```

### `options`

A `number[]` of indicator parameters in the order the indicator expects:

```ts
addIndicator(chart, candles, 'sma',    ohlcv, [20]);         // period
addIndicator(chart, candles, 'bbands', ohlcv, [20, 2]);      // period, stddev multiplier
addIndicator(chart, candles, 'macd',   ohlcv, [12, 26, 9]);  // fast, slow, signal
addIndicator(chart, candles, 'rsi',    ohlcv, [14]);         // period
addIndicator(chart, candles, 'psar',   ohlcv, [0.02, 0.2]);  // accel_start, accel_max
addIndicator(chart, candles, 'pivotpoint', ohlcv, []);        // no options — horizontal line rendering
```

See the [Indicators](indicators.md) table for the options each indicator accepts.

### `addOptions`

Key visual fields in `AddIndicatorOptions`:

| Field | Type | Default | Description |
|---|---|---|---|
| `colors` | `string[]` | palette | One CSS colour per output series |
| `fillBand` | `boolean` | `false` | Shade area between first and last output |
| `lineWidth` | `number` | `1` | Line width in pixels (oscillator series only) |
| `paneIndex` | `number` | auto | Force a specific pane for oscillators |
| `renderStyle` | `'line' \| 'dots'` | `'line'` | Connected line or isolated dots |
| `dotRadius` | `number` | `3` | Dot radius in pixels (dots mode only) |
| `upColor` | `string` | `'#26a69a'` | Dot colour when in uptrend (PSAR) |
| `downColor` | `string` | `'#ef5350'` | Dot colour when in downtrend (PSAR) |

Two indicators use special rendering automatically — no options needed:

- **`psar`** — always renders as coloured dots (`upColor`/`downColor`); `colors` is ignored.
- **`pivotpoint`** — renders as full-width dashed horizontal lines on the price pane; it does **not** open an oscillator pane despite its non-overlay `displayType`.

See [API Reference — AddIndicatorOptions](api_reference.md#addindicatoroptions) for full documentation.

---

## Bundler Setup (Vite, webpack, Rollup)

With a modern bundler, `tulip-rs-wasm` (and its `.wasm` binary) is resolved automatically. No extra configuration is needed for most setups.

### Vite

Works out of the box. Vite handles `.wasm` assets natively when imported via `tulip-rs-wasm`'s `init()`.

```ts
// vite.config.ts — no special wasm config needed
import { defineConfig } from 'vite';
export default defineConfig({});
```

```ts
// main.ts
import { init, addIndicator } from 'tulip-rs-lwc';
await init(); // WASM resolved automatically
```

### webpack 5

webpack 5 supports WebAssembly as an async module. Enable `asyncWebAssembly` in your config:

```js
// webpack.config.js
module.exports = {
  experiments: {
    asyncWebAssembly: true,
  },
};
```

Then import and call `init()` as normal. No WASM URL needed.

---

## CDN / Plain HTML

When loading from a CDN or serving files statically without a bundler, the WASM binary is not co-located with the JS modules, so you must pass its URL to `init()`.

```html
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
  {
    "imports": {
      "lightweight-charts": "https://cdn.jsdelivr.net/npm/lightweight-charts@5/dist/lightweight-charts.standalone.development.js",
      "fancy-canvas":       "https://cdn.jsdelivr.net/npm/fancy-canvas@2/dist/fancy-canvas.module.js",
      "tulip-rs-wasm":      "https://cdn.jsdelivr.net/npm/tulip-rs-wasm@0.1.0/index.js",
      "tulip-rs-lwc":       "https://cdn.jsdelivr.net/npm/tulip-rs-lwc@0.1.0/index.js"
    }
  }
  </script>
</head>
<body>
  <div id="chart" style="width:100%;height:500px;"></div>
  <script type="module">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import { init, addIndicator } from 'tulip-rs-lwc';

    const WASM_URL = 'https://cdn.jsdelivr.net/npm/tulip-rs-wasm@0.1.0/pkg/tulip_rs_wasm_bg.wasm';

    async function main() {
      await init(WASM_URL);

      const chart   = createChart(document.getElementById('chart'));
      const candles = chart.addSeries(CandlestickSeries);
      candles.setData(ohlcv);

      addIndicator(chart, candles, 'ema', ohlcv, [20]);
      addIndicator(chart, candles, 'rsi', ohlcv, [14]);
    }

    main();
  </script>
</body>
</html>
```

!!! note "Import maps browser support"
    Import maps are supported in all modern browsers (Chrome 89+, Firefox 108+, Safari 16.4+). For older browser targets, use a bundler instead.

---

## Removing Indicators

Every `addIndicator()` call returns an `IndicatorHandle`. Call `.remove()` to detach the indicator and free all associated resources (canvas primitives, series, panes).

```ts
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);

// Remove SMA after 5 seconds
setTimeout(() => {
  sma.remove();
  // The pane allocated to RSI is unaffected
}, 5000);
```

For oscillators, the pane is released automatically when `remove()` is called (unless you specified a custom `paneIndex` in `AddIndicatorOptions`, in which case pane lifecycle is your responsibility).

---

## Replacing Data

Use `handle.setData(newData)` to replace the full dataset and recompute the indicator from scratch. This is useful when the user changes the symbol or timeframe:

```ts
let sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

async function changeSymbol(newOhlcv) {
  candles.setData(newOhlcv);
  sma.setData(newOhlcv);   // recomputes SMA on the new dataset
}
```

For appending single bars in a live feed, use `appendBar()` instead — see [Streaming](streaming.md).

---

## Multiple Charts

Each chart instance maintains its own independent pane manager. You can add tulip-rs-lwc indicators to as many charts as you like — pane indices are tracked separately per chart.

```ts
const chart1 = createChart(container1);
const chart2 = createChart(container2);

// Independent — pane allocation is per-chart
addIndicator(chart1, series1, 'rsi', data1, [14]);
addIndicator(chart2, series2, 'rsi', data2, [14]);
```
