# Overlays

Overlay indicators are drawn directly on the price pane, sharing the same coordinate space and price scale as your candlestick series. tulip-rs-lwc renders overlays as `ISeriesPrimitive<Time>` — a canvas drawing API provided by Lightweight Charts — rather than as additional `LineSeries` instances.

---

## How Overlay Primitives Work

When you add an overlay indicator, tulip-rs-lwc creates an `OverlayPrimitive` and attaches it to your `sourceSeries` via `series.attachPrimitive()`. The primitive:

- **Draws in front of candlesticks** — indicator lines are rendered in the `draw()` pass, in front of the price bars.
- **Draws behind candlesticks** — band fills are rendered in the `drawBackground()` pass, behind the price bars, so candles always remain visible.
- **Extends the Y-axis correctly** — `autoscaleInfo()` returns the global min/max of all indicator output values. The price scale expands to include indicator values only when they fall outside the current price range; it never collapses the candlestick view.
- **Updates incrementally** — `updateAllViews()` converts stored `{time, value}` data to canvas coordinates (`timeToCoordinate` / `priceToCoordinate`) before each paint cycle. No indicator recomputation happens during painting.

---

## Indicators That Are Overlays

| Category | Indicators |
|---|---|
| **Trend** | SMA, EMA, DEMA, TEMA, WMA, HMA, KAMA, TRIMA, ZLEMA, WILDERS, VIDYA, LINREG, TSF, PSAR |
| **Price** | AVGPRICE, MEDPRICE, TYPPRICE, WCPRICE |
| **Volatility** | BBANDS |
| **Statistical** | MAX, MIN |
| **Pivot Points** | PIVOTPOINT |

The indicator type is determined by the `displayType` field returned by `indicator.info` — tulip-rs-lwc routes automatically; you do not specify it.

!!! note "No last-value price lines"
    Indicator series have `priceLineVisible: false` and `lastValueVisible: false` set by default. The floating dashed horizontal line that Lightweight Charts normally draws at the last data point is suppressed for all indicator outputs, keeping the chart clean when multiple indicators are active.

---

## Examples

### Simple Moving Average (SMA)

```ts
const sma20 = addIndicator(chart, candles, 'sma', ohlcv, [20]);

// Custom colour
const sma50 = addIndicator(chart, candles, 'sma', ohlcv, [50], {
  colors: ['#FF9800'],
});

// Both overlays share the price pane
```

---

### Exponential Moving Average (EMA)

```ts
const ema12 = addIndicator(chart, candles, 'ema', ohlcv, [12], {
  colors: ['#2196F3'],
});

const ema26 = addIndicator(chart, candles, 'ema', ohlcv, [26], {
  colors: ['#ef5350'],
});
```

---

### Bollinger Bands (BBands)

BBands returns three outputs — upper, middle, and lower bands. Pass three colours (one per output) and enable `fillBand` to shade the region between the upper and lower bands:

```ts
const bb = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  colors:   ['#ef5350', '#2196F3', '#ef5350'],  // upper, middle, lower
  fillBand: true,
});
```

The fill is drawn behind the candlesticks at 10% opacity, so the candles remain clearly visible. The standard deviation multiplier is the second option: `[period, stddev_multiplier]`.

---

### Parabolic SAR (PSAR)

PSAR is rendered as a **scatter of dots** on the price chart — each bar gets an isolated filled circle placed at the stop-and-reverse level, with no connecting line between them. Dots appear **below** price bars during an uptrend and **above** during a downtrend.

Dots are coloured automatically based on their position relative to the close price:

- 🟢 **Green** (`upColor`) — SAR is below the close price (uptrend)
- 🔴 **Red** (`downColor`) — SAR is above the close price (downtrend)

```ts
// Default colours — green uptrend, red downtrend
const psar = addIndicator(chart, candles, 'psar', ohlcv, [0.02, 0.2]);

// Custom colours
const psar = addIndicator(chart, candles, 'psar', ohlcv, [0.02, 0.2], {
  upColor:   '#4CAF50',
  downColor: '#ef5350',
});
```

Options: `[accel_start, accel_max]` — standard default is `[0.02, 0.2]`.

The dot radius defaults to 3 px. Override it with `dotRadius`:

```ts
const psar = addIndicator(chart, candles, 'psar', ohlcv, [0.02, 0.2], {
  dotRadius: 5,
});
```

PSAR's dot rendering is selected automatically via the `DOT_RENDER_INDICATORS` whitelist — you do not need to set `renderStyle: 'dots'` explicitly.

---

### Other Multi-Period Overlays

```ts
// Hull Moving Average — smoother and more responsive than SMA
const hma = addIndicator(chart, candles, 'hma', ohlcv, [14]);

// KAMA — adapts to market noise
const kama = addIndicator(chart, candles, 'kama', ohlcv, [10]);

// DEMA — double-smoothed EMA, reduced lag
const dema = addIndicator(chart, candles, 'dema', ohlcv, [20]);

// TEMA — triple-smoothed EMA, minimal lag
const tema = addIndicator(chart, candles, 'tema', ohlcv, [20]);

// Zero-Lag EMA
const zlema = addIndicator(chart, candles, 'zlema', ohlcv, [20]);

// VIDYA — variable-index dynamic average
const vidya = addIndicator(chart, candles, 'vidya', ohlcv, [5, 20, 0.2]);

// Linear Regression
const linreg = addIndicator(chart, candles, 'linreg', ohlcv, [14]);
```

---

### Pivot Points (PIVOTPOINT)

Pivot Points are rendered as **full-width dashed horizontal lines** across the entire price pane — one line per level, with a labelled pill at the right edge. This is handled by `HorizontalPrimitive`, which is selected automatically via the `HORIZONTAL_LINE_INDICATORS` whitelist.

The seven standard levels are drawn with colour-coded labels:

| Level | Label | Role |
|---|---|---|
| R3 | `R3` | Third resistance |
| R2 | `R2` | Second resistance |
| R1 | `R1` | First resistance |
| PP | `PP` | Pivot point |
| S1 | `S1` | First support |
| S2 | `S2` | Second support |
| S3 | `S3` | Third support |

```ts
const pp = addIndicator(chart, candles, 'pivotpoint', ohlcv, []);
```

No additional `addOptions` are required — the horizontal rendering and level colours are applied automatically. The lines persist across chart panning and zooming, always spanning the full visible width.

!!! note
    Pivot Points are computed from OHLC data. The output is a single packed array of 7 values `[s3, s2, s1, pp, r1, r2, r3]` that `HorizontalPrimitive` unpacks internally. The indicator takes no options (`[]`).

---

### Price Series Overlays

These compute a derived price from OHLC data and overlay it on the chart. They take no options:

```ts
// Typical Price: (high + low + close) / 3
const typ = addIndicator(chart, candles, 'typprice', ohlcv, []);

// Weighted Close: (high + low + close*2) / 4
const wcp = addIndicator(chart, candles, 'wcprice', ohlcv, []);

// Median Price: (high + low) / 2
const med = addIndicator(chart, candles, 'medprice', ohlcv, []);
```

---

## Colour Customisation

The `colors` option accepts one CSS colour string per output series. If you provide fewer colours than there are outputs, the remaining outputs cycle through the built-in default palette:

```
['#2196F3', '#ef5350', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B']
```

```ts
// Single-output overlay
addIndicator(chart, candles, 'sma', ohlcv, [20], {
  colors: ['#FFD700'],  // gold
});

// Multi-output (BBands)
addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], {
  colors: ['rgba(239,83,80,0.8)', '#2196F3', 'rgba(239,83,80,0.8)'],
});
```

### Per-Point Colour: `upColor` / `downColor`

For dot-rendered indicators (currently PSAR), each dot is coloured individually based on whether it represents an uptrend or downtrend condition:

```ts
const psar = addIndicator(chart, candles, 'psar', ohlcv, [0.02, 0.2], {
  upColor:   '#26a69a',   // default green — SAR below price
  downColor: '#ef5350',   // default red   — SAR above price
});
```

The `colors` array has no effect on PSAR — use `upColor` and `downColor` instead.

### Render Style

The `renderStyle` option switches between `'line'` (default) and `'dots'` for any overlay primitive. PSAR selects `'dots'` automatically. You can apply dot rendering to any other overlay if needed:

```ts
// Dots on a moving average (unconventional, but possible)
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20], {
  renderStyle: 'dots',
  dotRadius:   3,
});
```

---

## Stacking Multiple Overlays

You can add as many overlays as you like to the same chart. They are all drawn on the same price pane and each maintains its own data and state:

```ts
const sma20 = addIndicator(chart, candles, 'sma', ohlcv, [20]);
const sma50 = addIndicator(chart, candles, 'sma', ohlcv, [50], { colors: ['#FF9800'] });
const bb    = addIndicator(chart, candles, 'bbands', ohlcv, [20, 2], { fillBand: true });

// Each has its own handle and independent remove/update
sma20.remove();  // removes only the 20-period SMA
```

---

## Removing an Overlay

```ts
const sma = addIndicator(chart, candles, 'sma', ohlcv, [20]);

// Detaches the primitive from the series and frees all resources
sma.remove();
```
