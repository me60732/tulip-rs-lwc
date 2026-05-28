# Streaming

tulip-rs-lwc supports incremental live-feed updates via `handle.appendBar()`. Each call costs O(1) — only the new bar is processed, regardless of how much history is loaded.

---

## The Problem with Full Recompute

The naive approach to keeping a chart indicator up to date is to call the indicator function on every new bar with the full history:

```ts
// ❌ Naive approach — O(n) per tick
ws.onmessage = (event) => {
  const newBar = JSON.parse(event.data);
  ohlcv.push(newBar);

  // Recomputes all 1000+ bars every tick
  const [outputs] = ti.sma.indicator([ohlcv.map(b => b.close)], [20]);
  // ...update chart manually...
};
```

With 1 000 bars this is imperceptible. With 5 000 bars on a 1-minute chart you will notice it. With 50 000 bars on a tick chart it will lag visibly. The cost grows linearly with history length.

---

## How `appendBar()` Works

When `addIndicator()` is first called it runs `indicator.indicator()` on the full dataset and captures the returned `State` object internally. The `State` represents the indicator's running computation — all the internal EMA accumulators, ring buffers, and partial sums that the indicator has built up over the full history.

When `appendBar()` is called with a new bar, tulip-rs-lwc feeds only that bar to `state.batchIndicator()`. The state picks up where it left off and returns the new output value(s) — if the indicator is past its warmup period — or an empty result if it is still in warmup. This is the same cost regardless of whether there are 100 or 100 000 bars in history.

```
initial indicator() call:     O(n)  — happens once, upfront
each appendBar() call:        O(1)  — constant per bar forever
```

---

## Basic Example

```ts
import { init, addIndicator } from 'tulip-rs-lwc';

await init();

const chart   = createChart(container);
const candles = chart.addSeries(CandlestickSeries);
candles.setData(ohlcv);

const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);

// On each new bar from a live feed
function onNewBar(bar) {
  // Update the LWC candle series as normal
  candles.update(bar);

  // Update indicators — each is O(1) regardless of history length
  sma.appendBar(bar);
  rsi.appendBar(bar);
}
```

---

## WebSocket Live Feed

```ts
const ws = new WebSocket('wss://your-feed/BTCUSDT');

ws.onmessage = (event) => {
  const bar = JSON.parse(event.data);
  // bar: { time, open, high, low, close, volume }

  candles.update(bar);
  sma.appendBar(bar);
  macd.appendBar(bar);
  rsi.appendBar(bar);
};
```

---

## Bar Format

`appendBar()` accepts the same `OhlcvBar` type as `setData()`:

```ts
type OhlcvBar = {
  time:    Time;    // LWC Time — same format as your existing bars
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume?: number;  // include for volume-based indicators
};
```

The `time` value must be monotonically increasing — passing a bar whose time is equal to or earlier than the last bar in the dataset results in undefined behaviour (same constraint as LWC's own `series.update()`).

---

## Warmup Period

All technical indicators require a minimum number of bars before they produce their first output — this is the **warmup period** (or lookback). During warmup, `appendBar()` feeds the bar to the state but produces no new chart point. Once the indicator exits warmup it starts producing one output point per bar.

For example, SMA(20) requires 20 bars before it produces its first value. If you call `appendBar()` during the first 19 bars after the initial load, no new point is drawn. On the 20th bar and beyond, a point is drawn for each call.

This is handled automatically — no special handling is needed in your code.

---

## `appendBar()` vs `setData()`

| Method | Use case | Cost |
|---|---|---|
| `setData(data)` | Replace the full dataset and recompute | O(n) |
| `appendBar(bar)` | Append one bar from a live feed | O(1) |

Use `setData()` when the user changes the symbol or timeframe and you have a new full dataset. Use `appendBar()` for each individual bar arriving from a WebSocket or polling feed.

---

## Multiple Indicators

Each indicator maintains its own independent `State` object. You can have any number of indicators streaming in parallel — each `appendBar()` call is independent:

```ts
const sma   = addIndicator(chart, candles, 'sma',    ohlcv, [20]);
const bb    = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2]);
const rsi   = addIndicator(chart, candles, 'rsi',    ohlcv, [14]);
const macd  = addIndicator(chart, candles, 'macd',   ohlcv, [12, 26, 9]);
const adx   = addIndicator(chart, candles, 'adx',    ohlcv, [14]);

function onNewBar(bar) {
  candles.update(bar);
  sma.appendBar(bar);
  bb.appendBar(bar);
  rsi.appendBar(bar);
  macd.appendBar(bar);
  adx.appendBar(bar);
}
```

All five `appendBar()` calls together still cost O(1) per bar — each one calls into the WASM `batchIndicator()` for a single bar of its own indicator.

---

## State Persistence

The internal `State` object is managed by `tulip-rs-wasm` and is not directly exposed in the tulip-rs-lwc public API. If you need to persist or transfer indicator state (e.g. for server-side reconstruction or resuming across page loads), use `tulip-rs-wasm` directly and manage the state yourself. See the [tulip-rs-wasm documentation](https://me60732.github.io/tulip_rs/) for details.
