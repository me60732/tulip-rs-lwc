# Getting Started

## Installation

### npm (bundler — Vite, webpack, Rollup, esbuild)

Install the package and its peer dependencies:

```bash
npm install tulip-rs-lwc
npm install lightweight-charts fancy-canvas
```

`lightweight-charts` and `fancy-canvas` are peer dependencies — they must be installed in your project separately. tulip-rs-lwc targets Lightweight Charts v5.

`tulip-rs-wasm` is a regular dependency and is installed automatically.

---

### CDN (plain HTML, no bundler)

All three packages are available from jsDelivr as ES modules:

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
  <div id="chart" style="width:100%;height:400px;"></div>
  <script type="module">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import { init, addIndicator } from 'tulip-rs-lwc';

    // When loading from CDN you must provide the WASM file URL explicitly
    await init('https://cdn.jsdelivr.net/npm/tulip-rs-wasm@0.1.0/pkg/tulip_rs_wasm_bg.wasm');

    const chart   = createChart(document.getElementById('chart'));
    const candles = chart.addSeries(CandlestickSeries);
    candles.setData(ohlcv);

    addIndicator(chart, candles, 'sma', ohlcv, [20]);
  </script>
</body>
</html>
```

!!! note "CDN and WASM"
    When using a CDN or any setup where the WASM file is not bundled alongside the JS, you must pass the full URL of the `.wasm` binary to `init()`. See [Integration Guide — CDN Setup](integration.md#cdn--plain-html) for details.

---

## Initialising the WASM Module

`tulip-rs-lwc` re-exports `init` from `tulip-rs-wasm`. You must call it **once** before any `addIndicator()` calls. It is safe to `await` at the top level of an ES module or inside an `async` function.

=== "Bundler (Vite, webpack)"

    ```ts
    import { init, addIndicator } from 'tulip-rs-lwc';

    // No URL needed — the bundler resolves the WASM asset automatically
    await init();
    ```

=== "CDN / plain HTML"

    ```ts
    import { init, addIndicator } from 'tulip-rs-lwc';

    // Provide the WASM binary URL explicitly
    await init('https://cdn.jsdelivr.net/npm/tulip-rs-wasm@0.1.0/pkg/tulip_rs_wasm_bg.wasm');
    ```

!!! warning "Call `init()` once"
    Calling `init()` multiple times is safe (subsequent calls are no-ops), but you should call it before the first `addIndicator()`. A common pattern is to `await init()` at the top of your chart initialisation function.

---

## Your First Indicator

This minimal example adds a 20-period SMA overlay and a 14-period RSI to an existing Lightweight Charts candlestick chart:

```ts
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { init, addIndicator } from 'tulip-rs-lwc';

// Sample OHLCV data — replace with your own
const ohlcv = [
  { time: '2024-01-02', open: 150.0, high: 152.5, low: 149.8, close: 151.9, volume: 980000 },
  { time: '2024-01-03', open: 151.9, high: 154.1, low: 151.2, close: 153.5, volume: 1200000 },
  // ...
];

async function main() {
  // 1. Initialise WASM once
  await init();

  // 2. Create your chart and series as normal
  const chart   = createChart(document.getElementById('chart'));
  const candles = chart.addSeries(CandlestickSeries);
  candles.setData(ohlcv);

  // 3. Add indicators
  const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
  const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);

  // 4. Remove when no longer needed
  // sma.remove();
  // rsi.remove();
}

main();
```

---

## TypeScript Support

tulip-rs-lwc is written in TypeScript and ships with full type declarations. No `@types/` package is needed.

```ts
import type { OhlcvBar, IndicatorHandle, AddIndicatorOptions } from 'tulip-rs-lwc';
```

All public types are re-exported from the package root — see [API Reference](api_reference.md) for the full type list.

---

## Next Steps

| Topic | Page |
|---|---|
| Adding to an existing chart | [Integration Guide](integration.md) |
| Overlay examples (SMA, BBands, PSAR) | [Overlays](overlays.md) |
| Oscillator examples (RSI, MACD, Stoch) | [Oscillators](oscillators.md) |
| Live feed / streaming | [Streaming](streaming.md) |
| Full API reference | [API Reference](api_reference.md) |
| Supported indicators | [Indicators](indicators.md) |
