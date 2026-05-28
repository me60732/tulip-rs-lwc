import type { OhlcvBar, AlignedPoint } from '../types.js';

/**
 * Zip tulip-rs-wasm Float64Array[] outputs with timestamps, accounting for
 * the lookback offset.
 *
 * tulip-rs outputs have length `n - lookback`, where output index 0 corresponds
 * to `data[lookback]`.  This function produces a dense array of AlignedPoints.
 *
 * @param data     Full OHLCV dataset fed to `indicator.indicator()`.
 * @param outputs  Float64Array[] from `indicator.indicator()`.
 * @param lookback `data.length - outputs[0].length`
 */
export function alignOutputs(
  data:     OhlcvBar[],
  outputs:  Float64Array[],
  lookback: number,
): AlignedPoint[] {
  const len    = outputs[0]?.length ?? 0;
  const result = new Array<AlignedPoint>(len);
  for (let i = 0; i < len; i++) {
    result[i] = {
      time:   data[lookback + i].time,
      values: outputs.map(out => out[i]),
    };
  }
  return result;
}

/**
 * Consume `batchIndicator()` output for a single new bar and push a new
 * AlignedPoint onto `existing` when the indicator has left its warmup period.
 *
 * Returns `true` if a new point was appended (i.e. indicator produced output),
 * `false` during the warmup period when no output is generated yet.
 */
export function appendAlignedPoint(
  existing:     AlignedPoint[],
  newTime:      OhlcvBar['time'],
  batchOutputs: Float64Array[],
): boolean {
  if (!batchOutputs[0] || batchOutputs[0].length === 0) {
    // Still accumulating warmup bars — no output produced.
    return false;
  }
  // batchIndicator() for a single input bar returns arrays of length 1.
  const n = batchOutputs[0].length;
  existing.push({
    time:   newTime,
    values: batchOutputs.map(out => out[n - 1]),
  });
  return true;
}
