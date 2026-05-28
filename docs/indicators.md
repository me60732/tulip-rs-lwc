# Indicators

All 70+ tulip-rs scalar indicators are supported via [`addIndicator()`](api_reference.md). The candlestick pattern indicator is handled separately by [`addCandlestickPatterns()`](candlestick_patterns.md) — it returns labelled pattern objects rather than numeric series and is rendered as chart markers.

Indicators whose `displayType` is `"Overlay"` are rendered as canvas primitives on the price pane. All others are rendered as `LineSeries` / `HistogramSeries` in automatically-managed oscillator panes.

Pass the **Name** (lower-case) to `addIndicator()`. Options are positional — pass them in the order listed in the **Options** column.

---

## Trend — Overlay

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `sma` | Simple Moving Average | close | period | sma |
| `ema` | Exponential Moving Average | close | period | ema |
| `dema` | Double Exponential Moving Average | close | period | dema |
| `tema` | Triple Exponential Moving Average | close | period | tema |
| `wma` | Weighted Moving Average | close | period | wma |
| `hma` | Hull Moving Average | close | period | hma |
| `kama` | Kaufman Adaptive Moving Average | close | period | kama |
| `trima` | Triangular Moving Average | close | period | trima |
| `zlema` | Zero-Lag Exponential Moving Average | close | period | zlema |
| `wilders` | Wilders Smoothing | close | period | wilders |
| `vidya` | Variable Index Dynamic Average | close | short\_period, long\_period, alpha | vidya |
| `linreg` | Linear Regression | close | period | linreg |
| `tsf` | Time Series Forecast | close | period | tsf |
| `psar` | Parabolic SAR | high, low | accel\_start, accel\_max | psar |

---

## Volatility — Overlay

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `bbands` | Bollinger Bands | close | period, stddev | bbands\_upper, bbands\_middle, bbands\_lower |

---

## Price — Overlay

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `avgprice` | Average Price | open, high, low, close | _(none)_ | avgprice |
| `medprice` | Median Price | high, low | _(none)_ | medprice |
| `typprice` | Typical Price | high, low, close | _(none)_ | typprice |
| `wcprice` | Weighted Close Price | high, low, close | _(none)_ | wcprice |

---

## Statistical — Overlay

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `max` | Maximum | close | period | max |
| `min` | Minimum | close | period | min |

---

## Momentum — Oscillator

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `rsi` | Relative Strength Index | close | period | rsi |
| `cmo` | Chande Momentum Oscillator | close | period | cmo |
| `mom` | Momentum | close | period | mom |
| `roc` | Rate of Change | close | period | roc |
| `rocr` | Rate of Change Ratio | close | period | rocr |
| `stochrsi` | Stochastic RSI | close | period | stochrsi |
| `dpo` | Detrended Price Oscillator | close | period | dpo |
| `fosc` | Forecast Oscillator | close | period | fosc |
| `macd` | MACD | close | fast\_period, slow\_period, signal\_period | macd, macd\_signal, macd\_histogram |
| `apo` | Absolute Price Oscillator | close | short\_period, long\_period | apo |
| `ppo` | Percentage Price Oscillator | close | short\_period, long\_period | ppo |
| `stoch` | Stochastic Oscillator | high, low, close | k\_period, k\_slowing, d\_period | stoch\_k, stoch\_d |
| `trix` | 1-Day Rate-of-Change of a Triple EMA | close | period | trix |

---

## Volatility — Oscillator

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `atr` | Average True Range | high, low, close | period | atr |
| `natr` | Normalized ATR | high, low, close | period | natr |
| `volatility` | Volatility | close | period | volatility |
| `stddev` | Standard Deviation | close | period | stddev |
| `md` | Mean Deviation | close | period | md |
| `tr` | True Range | high, low, close | _(none)_ | tr |

---

## Volume — Oscillator

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `obv` | On Balance Volume | close, volume | _(none)_ | obv |
| `ad` | Accumulation/Distribution | high, low, close, volume | _(none)_ | ad |
| `adosc` | A/D Oscillator | high, low, close, volume | short\_period, long\_period | adosc |
| `mfi` | Money Flow Index | high, low, close, volume | period | mfi |
| `emv` | Ease of Movement | high, low, volume | period | emv |
| `nvi` | Negative Volume Index | close, volume | _(none)_ | nvi |
| `pvi` | Positive Volume Index | close, volume | _(none)_ | pvi |
| `kvo` | Klinger Volume Oscillator | high, low, close, volume | short\_period, long\_period, signal\_period | kvo, kvo\_signal |
| `vwma` | Volume Weighted Moving Average | close, volume | period | vwma |
| `vosc` | Volume Oscillator | volume | short\_period, long\_period | vosc |

---

## Directional — Oscillator

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `adx` | Average Directional Index | high, low, close | period | adx |
| `adxr` | Average Directional Rating | high, low, close | period | adxr |
| `di` | Directional Indicators | high, low, close | period | plus\_di, minus\_di |
| `dm` | Directional Movement | high, low | period | plus\_dm, minus\_dm |
| `dx` | Directional Movement Index | high, low, close | period | dx |
| `aroon` | Aroon | high, low | period | aroon\_down, aroon\_up |
| `aroonosc` | Aroon Oscillator | high, low | period | aroonosc |

---

## Other — Oscillator

| Name | Full Name | Inputs | Options | Outputs |
|---|---|---|---|---|
| `ao` | Awesome Oscillator | high, low | _(none)_ | ao |
| `bop` | Balance of Power | open, high, low, close | _(none)_ | bop |
| `cci` | Commodity Channel Index | high, low, close | period | cci |
| `cvi` | Coefficient of Variation Index | high, low | period | cvi |
| `fisher` | Fisher Transform | high, low | period | fisher, fisher\_signal |
| `mass` | Mass Index | high, low | period | mass |
| `marketfi` | Market Facilitation Index | high, low, volume | _(none)_ | marketfi |
| `msw` | Mesa Sine Wave | close | period | msw\_sine, msw\_lead |
| `qstick` | QStick | open, close | period | qstick |
| `vhf` | Vertical Horizontal Filter | close | period | vhf |
| `wad` | Williams Accumulation/Distribution | high, low, close | _(none)_ | wad |
| `willr` | Williams %R | high, low, close | period | willr |
| `pivotpoint` | Pivot Points | high, low, close | _(none)_ | pivot, r1, r2, s1, s2 |
| `ultosc` | Ultimate Oscillator | high, low, close | short\_period, medium\_period, long\_period | ultosc |

---

## Notes on Inputs

tulip-rs-lwc automatically maps the input names from `indicator.info.inputs` to the corresponding OHLCV fields:

| Input name | OHLCV field | Notes |
|---|---|---|
| `real` | `close` | Generic single-price input (most common) |
| `close` | `close` | |
| `open` | `open` | |
| `high` | `high` | |
| `low` | `low` | |
| `volume` | `volume` | Defaults to `0` if `volume` is missing from the bar |

You never need to specify which fields an indicator uses — this is handled automatically from the indicator's metadata.

!!! warning "Volume-based indicators require `volume`"
    If your `OhlcvBar` data does not include a `volume` field, volume-based indicators (OBV, AD, MFI, KVO, ADOSC, EMV, NVI, PVI, VWMA, VOSC, MARKETFI) will receive zeros for all volume values and produce incorrect results. Always include `volume` when using these indicators.
