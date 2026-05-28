import type { OhlcvBar } from '../types.js';

/**
 * Map tulip-rs indicator input names to arrays of OHLCV values.
 *
 * tulip_rs uses these input names (all lowercase in `info.inputs`):
 *
 * | Name     | Field   | Notes                                     |
 * |----------|---------|-------------------------------------------|
 * | "real"   | close   | Generic single-price input (most common)  |
 * | "close"  | close   |                                           |
 * | "open"   | open    |                                           |
 * | "high"   | high    |                                           |
 * | "low"    | low     |                                           |
 * | "volume" | volume  | Defaults to 0 when volume is not provided |
 * | anything | close   | Fallback                                  |
 *
 * @param data       OHLCV bars (volume optional).
 * @param inputNames `indicator.info.inputs` array, e.g. `["high","low","close"]`.
 * @returns          One `number[]` per input name, in the same order.
 */
export function extractInputs(
  data:       OhlcvBar[],
  inputNames: string[],
): number[][] {
  return inputNames.map(name => {
    switch (name.toLowerCase()) {
      case 'open':   return data.map(d => d.open);
      case 'high':   return data.map(d => d.high);
      case 'low':    return data.map(d => d.low);
      case 'close':  return data.map(d => d.close);
      case 'volume': return data.map(d => d.volume ?? 0);
      default:       return data.map(d => d.close); // "real" and unknowns → close
    }
  });
}
