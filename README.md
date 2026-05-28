# tulip-rs-lwc

[![npm](https://img.shields.io/npm/v/tulip-rs-lwc.svg)](https://www.npmjs.com/package/tulip-rs-lwc)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-me60732.github.io-blue)](https://me60732.github.io/tulip-rs-lwc/)

**TradingView Lightweight Charts v5 plugin for tulip-rs technical indicators.**

Add any of 70+ tulip-rs indicators to a Lightweight Charts chart with a single function call. Detect 77+ candlestick patterns and render them as annotated chart markers. Overlays are drawn directly on the price pane as `ISeriesPrimitive` canvas drawings; oscillators are placed in automatically-managed separate panes. Streaming is O(1) per bar via `state.batchIndicator()` — no history reprocessing.

---

## Installation

```bash
npm install tulip-rs-lwc
```

Peer dependencies (install separately):
```bash
npm install lightweight-charts fancy-canvas
```

---

## Quick Start

```ts
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { init, addIndicator, addCandlestickPatterns } from 'tulip-rs-lwc';

// 1. Initialise the WASM module once
await init();

// 2. Create chart and candlestick series as normal
const chart   = createChart(document.getElementById('chart'));
const candles = chart.addSeries(CandlestickSeries);
candles.setData(ohlcv); // your {time, open, high, low, close, volume?}[] data

// 3. Add indicators — returns a handle for updates / removal
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  colors:   ['#ef5350', '#2196F3', '#ef5350'], // upper / middle / lower
  fillBand: true,
});

const rsi  = addIndicator(chart, candles, 'rsi',  ohlcv, [14]);
const macd = addIndicator(chart, candles, 'macd', ohlcv, [12, 26, 9]);

// 4. Detect candlestick patterns — annotated markers on the chart
const patterns = addCandlestickPatterns(candles, ohlcv);

// Bullish reversals only
const bullish = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BullishReversal',
});

// 5. Remove when done
sma.remove();
patterns.remove();
```

---

## Streaming (O(1) incremental updates)

```ts
const sma      = addIndicator(chart, candles, 'sma', ohlcv, [20]);
const rsi      = addIndicator(chart, candles, 'rsi', ohlcv, [14]);
const patterns = addCandlestickPatterns(candles, ohlcv);

// When a new bar arrives
candles.update(newBar);
sma.appendBar(newBar);      // O(1) — no history reprocessing
rsi.appendBar(newBar);      // O(1)
patterns.appendBar(newBar); // O(1) — filter automatically applied
```

---

## API

### `init(wasmUrl?)`

Re-exported from `tulip-rs-wasm`. Must be called once before any other function.

```ts
// Bundler (Vite, webpack) — WASM asset resolved automatically
await init();

// CDN / plain HTML
await init('https://cdn.jsdelivr.net/npm/tulip-rs-wasm@0.1.0/pkg/tulip_rs_wasm_bg.wasm');
```

---

### `addIndicator(chart, sourceSeries, name, data, options, addOptions?)`

| Parameter    | Type                  | Description |
|---|---|---|
| `chart`        | `IChartApi`           | The LWC chart instance |
| `sourceSeries` | `ISeriesApi<...>`     | The candlestick series (overlay attachment point + Y-axis reference) |
| `name`         | `string`              | Indicator name, lower-case: `'sma'`, `'rsi'`, `'bbands'`, … |
| `data`         | `OhlcvBar[]`          | Full OHLCV dataset (include `volume` for volume-based indicators) |
| `options`      | `number[]`            | Numeric options (e.g. `[14]` for RSI period) |
| `addOptions`   | `AddIndicatorOptions` | Visual configuration (optional) |

Returns an `IndicatorHandle`:

| Method            | Description |
|---|---|
| `.remove()`       | Remove the indicator and free all resources |
| `.setData(data)`  | Replace the full dataset and recompute |
| `.appendBar(bar)` | Append one bar, update incrementally (O(1)) |

```ts
type AddIndicatorOptions = {
  colors?:    string[];  // CSS colors, one per output series
  fillBand?:  boolean;   // shade area between first/last output (BBands, etc.)
  lineWidth?: number;    // line width in px (default: 1)
  paneIndex?: number;    // force a specific pane for oscillators
};
```

---

### `addCandlestickPatterns(sourceSeries, data, options?, addOptions?)`

Detects Japanese candlestick patterns and renders each one as a `SeriesMarkerBar` directly on the chart — `arrowUp` below the bar for bullish reversals, `arrowDown` above for bearish, `circle` for continuations. The pattern short-name (`"hammer"`, `"doji"`, etc.) is shown as an inline text annotation.

| Parameter    | Type                            | Description |
|---|---|---|
| `sourceSeries` | `ISeriesApi<...>`               | The candlestick series to attach markers to |
| `data`         | `OhlcvBar[]`                    | Full OHLCV dataset |
| `options`      | `[number, number, number]`      | `[candle_period, trend_period, trend_signal]` — default `[5, 1, 1]` |
| `addOptions`   | `AddCandlestickPatternOptions`  | Visual configuration and filter (optional) |

Returns an `IndicatorHandle` (same type as `addIndicator` — same `remove()`, `setData()`, `appendBar()`).

```ts
type AddCandlestickPatternOptions = {
  filter?:            'BullishReversal' | 'BearishReversal'
                    | 'BullishContinuation' | 'BearishContinuation'
                    | 'BullishReversalOrContinuation' | 'BearishReversalOrContinuation';
  bullishColor?:      string;   // default '#4CAF50' (green)
  bearishColor?:      string;   // default '#ef5350' (red)
  continuationColor?: string;   // default '#FF9800' (orange)
  unknownColor?:      string;   // default '#9E9E9E' (grey)
  showText?:          boolean;  // show pattern name annotation (default: true)
};
```

---

## How It Works

### Overlays (SMA, EMA, BBands, PSAR, …)

Implemented as `ISeriesPrimitive<Time>` attached to the candlestick series. Lines are drawn in front of candlesticks via `draw()`; band fills are drawn behind via `drawBackground()`. `autoscaleInfo()` extends the Y-axis only when indicator values fall outside the current price range — the candlestick view is never collapsed.

### Oscillators (RSI, MACD, Stoch, CCI, …)

Implemented using standard LWC `LineSeries` / `HistogramSeries` moved to dedicated panes via `series.moveToPane(n)`. MACD histogram output is detected by name and rendered as `HistogramSeries` automatically. Pane indices are allocated and released automatically via `PaneManager`.

### Candlestick Patterns

Implemented using the LWC v5 `createSeriesMarkers()` plugin API. Each `addCandlestickPatterns()` call creates an independent `ISeriesMarkersPluginApi` instance, so multiple pattern sets (e.g. bullish-only and bearish-only) can coexist on the same series. `remove()` calls `plugin.detach()` for a clean teardown.

### Streaming via `batchIndicator()`

All three functions store the tulip-rs-wasm `State` object from the initial computation. `appendBar()` feeds only the new bar to `state.batchIndicator()` — O(1) per call, regardless of history length.

---

## Indicators

All 70+ tulip-rs scalar indicators are supported via `addIndicator()`. Candlestick patterns (77+) are supported via `addCandlestickPatterns()`.

| Category | Indicators |
|---|---|
| **Trend (Overlay)** | SMA, EMA, DEMA, TEMA, WMA, HMA, KAMA, TRIMA, ZLEMA, WILDERS, VIDYA, LINREG, TSF, PSAR |
| **Volatility (Overlay)** | BBANDS |
| **Price (Overlay)** | AVGPRICE, MEDPRICE, TYPPRICE, WCPRICE |
| **Momentum (Oscillator)** | RSI, CMO, MOM, ROC, ROCR, STOCHRSI, DPO, FOSC, MACD, APO, PPO, STOCH |
| **Volatility (Oscillator)** | ATR, NATR, VOLATILITY, STDDEV, MD |
| **Volume (Oscillator)** | OBV, AD, ADOSC, MFI, EMV, NVI, PVI, KVO, VWMA, VOSC |
| **Directional** | ADX, ADXR, DI, DM, DX, AROON, AROONOSC |
| **Other** | AO, BOP, CCI, CVI, FISHER, MASS, MARKETFI, MSW, QSTICK, TR, VHF, WAD, WILLR, PIVOTPOINT, ULTOSC |
| **Candlestick Patterns** | 77+ patterns via `addCandlestickPatterns()` — filter by BullishReversal, BearishReversal, BullishContinuation, BearishContinuation, and more |

---

## Language Support

| Language | Status | Package |
|---|---|---|
| **Browser (WASM)** | ✅ Core library | [`tulip-rs-wasm`](https://www.npmjs.com/package/tulip-rs-wasm) |
| **LWC Plugin** | ✅ This package | [`tulip-rs-lwc`](https://www.npmjs.com/package/tulip-rs-lwc) |
| **Node.js** | ✅ Supported | [`tulip-rs-node`](https://www.npmjs.com/package/tulip-rs-node) |
| **Rust** | ✅ Native | [`tulip_rs`](https://github.com/me60732/tulip_rs) |
| **Python** | ✅ Supported | `pip install tulip-rs` |

---

## License

[MIT](LICENSE)
