# tulip-rs-lwc

**TradingView Lightweight Charts v5 plugin for tulip-rs technical indicators.**

Add any of 70+ high-performance technical indicators to an existing Lightweight Charts chart with a single function call. Overlays are rendered directly on the price pane as canvas primitives; oscillators are placed in automatically-managed separate panes. Streaming updates are O(1) per bar via the tulip-rs `State` object — no history reprocessing.

---

## Why tulip-rs-lwc?

### Drop-in integration

You don't need to refactor your existing chart setup. `addIndicator()` takes your existing `IChartApi` and series instances — there is no wrapping layer, no chart reimplementation, and no opinionated data model. If you have a working Lightweight Charts chart today, you can add indicators to it in minutes.

```ts
// You already have this
const chart   = createChart(container);
const candles = chart.addSeries(CandlestickSeries);
candles.setData(ohlcv);

// Add this
await init();
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
```

---

### Overlays that respect the price scale

Most LWC overlays people build by adding extra `LineSeries` accidentally distort the Y-axis: the price scale shrinks to accommodate both the price series and the indicator, often collapsing the candlestick view. tulip-rs-lwc overlays are rendered as `ISeriesPrimitive` canvas drawings attached to your existing price series — they share the same price scale and only extend the Y-axis when the indicator genuinely exceeds the current price range (e.g. Bollinger Bands during a volatile expansion). Your candles stay centred.

---

### Automatic pane management

Oscillators (RSI, MACD, Stoch, CCI…) need their own pane beneath the price chart. tulip-rs-lwc allocates panes automatically and releases them when you call `remove()`. You never track pane indices yourself unless you want to — `paneIndex` is always optional.

```ts
const rsi  = addIndicator(chart, candles, 'rsi',  ohlcv, [14]);  // pane 1
const macd = addIndicator(chart, candles, 'macd', ohlcv, [12, 26, 9]);  // pane 2

rsi.remove();  // pane 1 is released automatically
```

---

### O(1) streaming per bar

Most indicator libraries recompute the full history on every new bar. With 1 000+ bars loaded this is noticeable; with 10 000 bars it causes visible lag on every tick. tulip-rs-lwc stores the tulip-rs-wasm `State` object from the initial computation and feeds only the new bar to `state.batchIndicator()` on each `appendBar()` call. Computation cost per tick is constant, regardless of history length.

---

### 70+ indicators, one API

All tulip-rs scalar indicators — moving averages, oscillators, volatility, volume, directional, and more — are accessible via the same `addIndicator()` call. There is no per-indicator plugin to import or configure.

---

### Band fills out of the box

Enable `fillBand: true` to shade the area between the first and last output series. This works for any multi-output overlay — Bollinger Bands, Donchian Channels, or any custom band indicator.

```ts
const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  colors:   ['#ef5350', '#2196F3', '#ef5350'],
  fillBand: true,
});
```

---

## Features at a Glance

| Capability | Detail |
|---|---|
| **Indicators** | 70+ tulip-rs scalar indicators |
| **Overlay rendering** | `ISeriesPrimitive` canvas drawing — no Y-axis distortion |
| **Band fills** | Semi-transparent fill between first and last output |
| **Dot rendering** | Per-bar dot scatter with per-point `upColor`/`downColor` colouring (PSAR) |
| **Horizontal lines** | Full-width dashed price-level lines with pill labels (Pivot Points) |
| **No last-value clutter** | Price lines and last-value labels suppressed on all indicator series |
| **Oscillator panes** | Automatic pane allocation and release |
| **MACD histogram** | Auto-detected by output name, rendered as `HistogramSeries` |
| **Streaming** | O(1) `appendBar()` via `state.batchIndicator()` |
| **TypeScript** | Fully typed public API and OHLCV types |
| **Tree-shakeable** | Pure ESM — only what you import is bundled |

---

## Quick Example

```ts
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { init, addIndicator } from 'tulip-rs-lwc';

await init();

const chart   = createChart(document.getElementById('chart'));
const candles = chart.addSeries(CandlestickSeries);
candles.setData(ohlcv);

// Overlay on the price chart
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

// Bollinger Bands with fill
const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  colors:   ['#ef5350', '#2196F3', '#ef5350'],
  fillBand: true,
});

// RSI in its own pane
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);

// MACD with histogram in a second oscillator pane
const macd = addIndicator(chart, candles, 'macd', ohlcv, [12, 26, 9]);

// Remove when done
sma.remove();
```

---

## Documentation Pages

| Page | Description |
|---|---|
| [Getting Started](getting_started.md) | Installation, peer dependencies, WASM initialisation |
| [Integration Guide](integration.md) | Adding to an existing chart, bundler and CDN setup |
| [Overlays](overlays.md) | Overlay primitives: SMA, EMA, BBands, PSAR, and more |
| [Oscillators](oscillators.md) | Oscillator panes: RSI, MACD, Stoch, CCI, and more |
| [Candlestick Patterns](candlestick_patterns.md) | 77+ pattern detection as annotated chart markers, with forecast filtering |
| [Streaming](streaming.md) | O(1) `appendBar()` and live feed integration |
| [API Reference](api_reference.md) | `init`, `addIndicator`, `addCandlestickPatterns`, `IndicatorHandle`, options types |
| [Indicators](indicators.md) | Full table of all 70+ supported indicators |

---

## Ecosystem

| Package | Description |
|---|---|
| [`tulip-rs-lwc`](https://www.npmjs.com/package/tulip-rs-lwc) | This package — Lightweight Charts plugin |
| [`tulip-rs-wasm`](https://www.npmjs.com/package/tulip-rs-wasm) | Core WASM binding — use directly for headless indicator computation in the browser |
| [`tulip-rs-node`](https://www.npmjs.com/package/tulip-rs-node) | Node.js native addon — server-side indicator computation |
| [`tulip_rs`](https://github.com/me60732/tulip_rs) | Rust core library |
| [`tulip-rs`](https://pypi.org/project/tulip-rs/) | Python binding via PyO3 |
