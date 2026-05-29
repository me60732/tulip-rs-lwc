/**
 * Explicit whitelist: for each oscillator indicator, which of its optional
 * outputs are on the price scale (and should therefore be rendered as an
 * overlay on the price chart rather than in the oscillator pane).
 *
 * This must be maintained manually because the name alone is not sufficient —
 * e.g. `short_ema` in `adosc` is an EMA of the AD line (not price), while
 * `short_ema` in `apo`/`macd`/`ppo` is an EMA of close price.
 *
 * Overlay-type indicators (dema, tema, trix, wma, fosc, tsf, mfi, kvo, vidya
 * etc.) are handled entirely by OverlayPrimitive and never reach this lookup.
 */
const PRICE_SCALE_OPTIONAL_OUTPUTS: Readonly<Record<string, ReadonlySet<string>>> = {
  // Awesome Oscillator: SMAs and medprice are computed from (high+low)/2
  ao:     new Set(['short_sma', 'long_sma', 'medprice']),

  // Absolute Price Oscillator: EMAs of close price
  apo:    new Set(['short_ema', 'long_ema']),

  // Commodity Channel Index: SMA and typical price are price-scale
  // (mean deviation 'md' is a small deviation value — stays in osc pane)
  cci:    new Set(['sma', 'typprice']),

  // Detrended Price Oscillator: SMA of real/close
  dpo:    new Set(['sma']),

  // Ease of Movement: median price (high+low)/2
  emv:    new Set(['medprice']),

  // MACD: both EMAs are of close price
  macd:   new Set(['short_ema', 'long_ema']),

  // Mean Deviation: SMA of real/close
  md:     new Set(['sma']),

  // Percentage Price Oscillator: EMAs of close price
  ppo:    new Set(['short_ema', 'long_ema']),

  // Standard Deviation: SMA of real/close
  stddev: new Set(['sma']),

  // NOT included (oscillator-scale optional outputs):
  //   adosc  — short_ema/long_ema are EMAs of the AD line, not price
  //   kvo    — short_ema/long_ema are EMAs of KVO values (Overlay type anyway)
  //   vosc   — short_sma/long_sma are SMAs of volume
  //   adx/adxr/di/dx — atr, tr, dx are all range/oscillator values
  //   atr/natr       — tr is true range
  //   aroonosc       — aroon_down/aroon_up are 0–100 oscillator components
  //   stochrsi       — rsi is 0–100
  //   roc            — mom (momentum) is a delta value
};

/**
 * Returns `true` when `optionalOutputName` for the given oscillator indicator
 * is a price-scale value that should be rendered as an overlay on the price
 * chart rather than in the oscillator pane.
 */
export function isPriceScaleOptional(
  indicatorName: string,
  optionalOutputName: string,
): boolean {
  const set = PRICE_SCALE_OPTIONAL_OUTPUTS[indicatorName];
  return set !== undefined && set.has(optionalOutputName);
}
