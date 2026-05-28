/**
 * tulip-rs-lwc — TradingView Lightweight Charts plugin for tulip-rs indicators.
 *
 * Re-exports `init` from `tulip-rs-wasm` for convenience.
 * Call `await init()` once before using `addIndicator()`.
 */
export { init } from "tulip-rs-wasm";
export { addIndicator } from "./src/add-indicator.js";
export { addCandlestickPatterns } from "./src/add-candlestick-patterns.js";
export type {
  OhlcvBar,
  IndicatorHandle,
  AddIndicatorOptions,
  AddCandlestickPatternOptions,
  ForecastFilter,
} from "./src/types.js";
