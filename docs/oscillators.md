# Oscillators

Oscillator indicators are rendered in separate panes beneath the price chart using standard Lightweight Charts `LineSeries` and `HistogramSeries`. tulip-rs-lwc allocates panes automatically and releases them when you remove an indicator.

---

## How Oscillators Work

When you add an oscillator, tulip-rs-lwc:

1. Calls the indicator via `tulip-rs-wasm` and computes the full history.
2. Creates one `LineSeries` or `HistogramSeries` per output.
3. Moves each series to a dedicated pane via `series.moveToPane(paneIndex)`.
4. Pushes the computed data with `series.setData()`.

The **pane manager** allocates pane indices sequentially starting at pane 1 (pane 0 is always the price chart). When an oscillator is removed, the pane index is released and can be reused by the next indicator added.

**MACD histogram detection** is automatic: if an output name contains `"histogram"` or ends with `"hist"`, that output is rendered as a `HistogramSeries` rather than a `LineSeries`. You don't configure this — it is detected by the output name returned by `indicator.info.outputs`.

---

## Indicators That Are Oscillators

| Category | Indicators |
|---|---|
| **Momentum** | RSI, CMO, MOM, ROC, ROCR, STOCHRSI, DPO, FOSC, MACD, APO, PPO, STOCH, TRIX |
| **Volatility** | ATR, NATR, VOLATILITY, STDDEV, MD, TR |
| **Volume** | OBV, AD, ADOSC, MFI, EMV, NVI, PVI, KVO, VWMA, VOSC |
| **Directional** | ADX, ADXR, DI, DM, DX, AROON, AROONOSC |
| **Other** | AO, BOP, CCI, CVI, FISHER, MASS, MARKETFI, MSW, QSTICK, VHF, WAD, WILLR, PIVOTPOINT, ULTOSC |

---

## Examples

### RSI

```ts
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);
```

RSI produces a single output series in the range 0–100. It is placed in pane 1 automatically.

Custom colour:

```ts
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14], {
  colors: ['#9C27B0'],
});
```

---

### MACD

MACD produces three output series: MACD line, signal line, and histogram. The histogram is detected automatically by output name and rendered as a `HistogramSeries`:

```ts
const macd = addIndicator(chart, candles, 'macd', ohlcv, [12, 26, 9]);
```

Options: `[fast_period, slow_period, signal_period]`.

Customise line and histogram colours:

```ts
const macd = addIndicator(chart, candles, 'macd', ohlcv, [12, 26, 9], {
  colors: ['#2196F3', '#ef5350', '#4CAF50'],  // MACD line, signal, histogram
});
```

---

### Stochastic Oscillator

Stochastic produces two outputs: `%K` (fast) and `%D` (slow signal):

```ts
const stoch = addIndicator(chart, candles, 'stoch', ohlcv, [14, 3, 3], {
  colors: ['#2196F3', '#FF9800'],  // %K, %D
});
```

Options: `[k_period, k_slowing, d_period]`.

---

### Stochastic RSI

StochRSI produces a single output in the 0–1 range:

```ts
const stochrsi = addIndicator(chart, candles, 'stochrsi', ohlcv, [14]);
```

---

### Commodity Channel Index (CCI)

```ts
const cci = addIndicator(chart, candles, 'cci', ohlcv, [20]);
```

---

### Williams %R

```ts
const willr = addIndicator(chart, candles, 'willr', ohlcv, [14]);
```

---

### ATR

Average True Range — a measure of market volatility:

```ts
const atr = addIndicator(chart, candles, 'atr', ohlcv, [14]);
```

---

### Volume Indicators

Volume-based oscillators require `volume` to be present in your `OhlcvBar` data:

```ts
// Ensure your data includes volume
const ohlcv = [
  { time: '2024-01-02', open: 150, high: 152, low: 149, close: 151, volume: 980000 },
  // ...
];

const obv   = addIndicator(chart, candles, 'obv',   ohlcv, []);
const mfi   = addIndicator(chart, candles, 'mfi',   ohlcv, [14]);
const adosc = addIndicator(chart, candles, 'adosc', ohlcv, [3, 10]);
```

---

### ADX and Directional Indicators

ADX measures trend strength; DI produces `+DI` and `-DI`:

```ts
const adx = addIndicator(chart, candles, 'adx', ohlcv, [14]);

const di = addIndicator(chart, candles, 'di', ohlcv, [14], {
  colors: ['#4CAF50', '#ef5350'],  // +DI green, -DI red
});
```

---

### Fisher Transform

Produces two outputs — Fisher and signal:

```ts
const fisher = addIndicator(chart, candles, 'fisher', ohlcv, [9], {
  colors: ['#2196F3', '#FF9800'],
});
```

---

### Aroon

```ts
// Aroon Down and Aroon Up
const aroon = addIndicator(chart, candles, 'aroon', ohlcv, [14], {
  colors: ['#ef5350', '#4CAF50'],  // down, up
});

// Aroon Oscillator (single output)
const aroonosc = addIndicator(chart, candles, 'aroonosc', ohlcv, [14]);
```

---

## Multiple Oscillators

Each oscillator gets its own pane automatically. Add as many as you need:

```ts
const rsi  = addIndicator(chart, candles, 'rsi',  ohlcv, [14]);   // pane 1
const macd = addIndicator(chart, candles, 'macd', ohlcv, [12, 26, 9]);  // pane 2
const adx  = addIndicator(chart, candles, 'adx',  ohlcv, [14]);   // pane 3
```

Panes are released when each indicator is removed:

```ts
rsi.remove();   // pane 1 released
macd.remove();  // pane 2 released
// Adding a new oscillator now reuses pane 1
const cci = addIndicator(chart, candles, 'cci', ohlcv, [20]);  // pane 1
```

---

## Sharing a Pane

To place two oscillators in the same pane, specify `paneIndex` explicitly for the second one. Note that when you manage `paneIndex` yourself, tulip-rs-lwc does **not** release the pane when the indicator is removed — pane lifecycle becomes your responsibility.

```ts
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);  // auto — pane 1

// Place StochRSI alongside RSI in the same pane
const stochrsi = addIndicator(chart, candles, 'stochrsi', ohlcv, [14], {
  paneIndex: 1,
  colors: ['#FF9800'],
});
```

---

## Removing an Oscillator

```ts
const rsi = addIndicator(chart, candles, 'rsi', ohlcv, [14]);

// Removes all series, releases the pane
rsi.remove();
```
