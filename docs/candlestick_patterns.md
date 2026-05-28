# Candlestick Patterns

tulip-rs detects 77+ Japanese candlestick patterns. In `tulip-rs-lwc` these are rendered as **series markers** directly on the candlestick chart — each detected pattern is annotated with an arrow and the pattern name at the bar it was found on.

This uses `addCandlestickPatterns()`, a separate function from `addIndicator()`, because candlestick patterns return labelled objects (not numeric series) and are rendered using the LWC v5 `createSeriesMarkers()` plugin rather than as line or histogram series.

---

## Quick Start

```ts
import { init, addCandlestickPatterns } from 'tulip-rs-lwc';

await init();

const chart   = createChart(container);
const candles = chart.addSeries(CandlestickSeries);
candles.setData(ohlcv);

// All patterns — annotated with pattern name
const patterns = addCandlestickPatterns(candles, ohlcv);

// Streaming — O(1) per bar
candles.update(newBar);
patterns.appendBar(newBar);

// Clean up
patterns.remove();
```

---

## How It Works

`addCandlestickPatterns()` calls `tulip-rs-wasm`'s candlestick indicator internally and maps each detected pattern to an LWC v5 `SeriesMarkerBar`:

| Forecast | Shape | Position | Default Colour |
|---|---|---|---|
| `BullishReversal` | `arrowUp` | below bar | `#4CAF50` (green) |
| `BearishReversal` | `arrowDown` | above bar | `#ef5350` (red) |
| `Continuation` | `circle` | above bar | `#FF9800` (orange) |
| `Unknown` | `square` | above bar | `#9E9E9E` (grey) |

The pattern short-name (e.g. `"hammer"`, `"doji"`, `"engulfing"`) is shown as an inline text annotation on the marker by default (`showText: true`).

Markers are managed via the LWC v5 `createSeriesMarkers()` plugin, which is created and attached to the series automatically. Calling `remove()` detaches the plugin cleanly.

---

## Forecast Filtering

Pass a `filter` option to show only patterns with a specific forecast type. The filter maps directly to the Rust `ForecastType` enum and is passed on every `batchIndicator()` call during streaming — the candlestick state does not capture it internally, so it is always explicitly forwarded.

```ts
// Bullish reversals only
const bullish = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BullishReversal',
});

// Bearish reversals only
const bearish = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BearishReversal',
});

// Bullish continuation patterns
const bullCont = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BullishContinuation',
});

// Any bearish pattern — reversal or continuation
const anyBear = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BearishReversalOrContinuation',
});
```

When `filter` is omitted, all detected patterns across all forecast types are shown.

The full set of accepted filter values (matching the Rust `ForecastType` enum exactly):

| Filter value | Description |
|---|---|
| `'BullishReversal'` | Bullish reversal patterns |
| `'BearishReversal'` | Bearish reversal patterns |
| `'BullishContinuation'` | Bullish continuation patterns |
| `'BearishContinuation'` | Bearish continuation patterns |
| `'BullishReversalOrContinuation'` | Any bullish pattern |
| `'BearishReversalOrContinuation'` | Any bearish pattern |

---

## Options

The second positional argument is `[candle_period, trend_period, trend_signal]`:

| Option | Description | Default |
|---|---|---|
| `candle_period` | Period for OHLC body/shadow size classification | `5` |
| `trend_period` | Period for the prior trend calculation | `1` |
| `trend_signal` | Trend signal threshold | `1` |

```ts
// Default [5, 1, 1]
addCandlestickPatterns(candles, ohlcv);

// Longer candle classification period
addCandlestickPatterns(candles, ohlcv, [10, 3, 1]);
```

The `candle_period` controls how the library classifies candle body and shadow sizes relative to recent bars. A longer period produces more conservative pattern detection on noisy data; a shorter period is more sensitive.

---

## Colour Customisation

Override the default colours per forecast type:

```ts
const patterns = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  bullishColor:      '#00E676',  // bright green
  bearishColor:      '#FF1744',  // bright red
  continuationColor: '#2979FF',  // blue
  unknownColor:      '#757575',  // grey
});
```

---

## Hiding the Text Annotation

Pattern names are shown by default. Set `showText: false` to render bare arrows without labels — useful if you have high pattern density and the annotations become crowded:

```ts
const patterns = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  showText: false,
});
```

---

## Streaming

`appendBar()` uses `state.batchIndicator()` internally — O(1) per bar, no history reprocessing. The filter (if set) is applied automatically.

```ts
const patterns = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BullishReversal',
});

ws.onmessage = (event) => {
  const bar = JSON.parse(event.data);
  candles.update(bar);
  patterns.appendBar(bar);  // O(1), filter automatically applied
};
```

---

## Combined with Indicators

`addCandlestickPatterns()` and `addIndicator()` are fully independent — you can use both on the same series simultaneously:

```ts
await init();

// Numeric indicators
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);

// Candlestick patterns alongside
const patterns = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BullishReversal',
});

// Stream all together
function onNewBar(bar) {
  candles.update(bar);
  sma.appendBar(bar);
  rsi.appendBar(bar);
  patterns.appendBar(bar);
}

// Remove independently
patterns.remove(); // markers gone, SMA and RSI unaffected
```

---

## Multiple Pattern Sets

Because each `addCandlestickPatterns()` call creates its own independent `ISeriesMarkersPluginApi` instance, you can add multiple pattern sets with different filters to the same series. Each set manages its own marker array:

```ts
const bullish = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BullishReversal',
  bullishColor: '#00E676',
});

const bearish = addCandlestickPatterns(candles, ohlcv, [5, 1, 1], {
  filter: 'BearishReversal',
  bearishColor: '#FF1744',
});

// Both sets of markers are visible simultaneously
// Remove them independently when needed
bullish.remove();
bearish.remove();
```

---

## API

### `addCandlestickPatterns(sourceSeries, data, options?, addOptions?)`

```ts
function addCandlestickPatterns(
  sourceSeries: ISeriesApi<...>,
  data:         OhlcvBar[],
  options?:     [number, number, number],   // [candle_period, trend_period, trend_signal]
  addOptions?:  AddCandlestickPatternOptions,
): IndicatorHandle
```

Returns an `IndicatorHandle` — the same type as `addIndicator()` — with `remove()`, `setData()`, and `appendBar()`.

### `AddCandlestickPatternOptions`

```ts
type AddCandlestickPatternOptions = {
  filter?:            'BullishReversal' | 'BearishReversal'
                    | 'BullishContinuation' | 'BearishContinuation'
                    | 'BullishReversalOrContinuation' | 'BearishReversalOrContinuation';
  bullishColor?:      string;   // default '#4CAF50'
  bearishColor?:      string;   // default '#ef5350'
  continuationColor?: string;   // default '#FF9800'
  unknownColor?:      string;   // default '#9E9E9E'
  showText?:          boolean;  // default true
};
```
