/**
 * offset-resolver — helpers for time-shifted overlay series.
 *
 * Used by OscillatorHandle to implement:
 *   - `"Overlay"` groups with a non-zero `offset` (e.g. Ichimoku leading spans)
 *   - `"Price"` groups that render a raw OHLCV price field shifted in time
 *     (e.g. Ichimoku lagging span / Chikou Span)
 */
import type { Time } from "lightweight-charts";
import type { OhlcvBar } from "../types.js";

// ── resolveOffset ─────────────────────────────────────────────────────────────

/**
 * Parse an offset string like `"+long_period"` or `"-long_period"` and resolve
 * the numeric value using the indicator's option names and values.
 *
 * @returns The signed integer bar count (e.g. +26 or -26), or 0 if unresolvable.
 */
export function resolveOffset(
  offsetStr: string | null | undefined,
  optionNames: string[],
  optionValues: number[],
): number {
  if (!offsetStr) return 0;
  const match = /^([+-])(\w+)$/.exec(offsetStr);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const name = match[2];
  const idx = optionNames.indexOf(name);
  if (idx === -1 || optionValues[idx] === undefined) return 0;
  const val = optionValues[idx];
  if (isNaN(val)) return 0;
  return sign * Math.round(val);
}

// ── Date helpers (ISO string timestamps) ─────────────────────────────────────

function parseIsoDate(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function nextTradingDay(date: Date): Date {
  const next = new Date(date.getTime() + 86_400_000);
  // Skip Saturday (6) and Sunday (0)
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── generateFutureTimes ───────────────────────────────────────────────────────

/**
 * Generate `count` future timestamps after the last bar in `data`.
 * For string ISO dates (YYYY-MM-DD), advances calendar days skipping weekends.
 * For numeric timestamps, uses the average interval of the last 5 bars.
 */
export function generateFutureTimes(data: OhlcvBar[], count: number): Time[] {
  if (count <= 0 || data.length === 0) return [];

  const lastTime = data[data.length - 1].time;

  if (typeof lastTime === "string") {
    const result: Time[] = [];
    let current = parseIsoDate(lastTime);
    for (let i = 0; i < count; i++) {
      current = nextTradingDay(current);
      result.push(formatIsoDate(current) as Time);
    }
    return result;
  } else {
    // Numeric timestamps — use average interval of the last few bars
    const n = Math.min(5, data.length);
    let avgInterval = 86_400; // default: 1 day in seconds
    if (n >= 2) {
      const first = data[data.length - n].time as number;
      const last = lastTime as number;
      avgInterval = (last - first) / (n - 1);
    }
    const result: Time[] = [];
    let current = lastTime as number;
    for (let i = 0; i < count; i++) {
      current = current + avgInterval;
      result.push(current as Time);
    }
    return result;
  }
}

// ── buildOffsetSeries ─────────────────────────────────────────────────────────

/**
 * Build a time-offset series from a Float64Array output.
 *
 * - `lookback`: `data.length - out.length` (natural alignment offset)
 * - `shift`: signed bar count from resolveOffset (positive = forward, negative = backward)
 *
 * Natural alignment maps `out[j]` to `data[lookback + j]`.
 * With shift, `out[j]` is placed at `data[lookback + j + shift]`.
 *
 * For positive shifts that extend beyond the last bar, generates future timestamps
 * via generateFutureTimes.  Entries that would map before `data[0]` are dropped.
 */
export function buildOffsetSeries(
  data: OhlcvBar[],
  out: Float64Array,
  lookback: number,
  shift: number,
): { time: Time; value: number }[] {
  if (out.length === 0) return [];

  // The last output index naturally maps to data[data.length - 1].
  // With a positive shift it maps further into the future.
  const futureCount = Math.max(0, shift); // shift > 0 means that many future timestamps needed
  const futureTimes =
    futureCount > 0 ? generateFutureTimes(data, futureCount) : [];

  const result: { time: Time; value: number }[] = [];
  for (let j = 0; j < out.length; j++) {
    const targetIdx = lookback + j + shift;
    let time: Time;

    if (targetIdx < 0) {
      // Before the start of the data — drop
      continue;
    } else if (targetIdx < data.length) {
      time = data[targetIdx].time;
    } else {
      // Beyond the last bar — use a generated future timestamp
      const futureOffset = targetIdx - data.length;
      if (futureOffset >= futureTimes.length) continue;
      time = futureTimes[futureOffset];
    }

    result.push({ time, value: out[j] });
  }
  return result;
}

// ── buildPriceSeries ──────────────────────────────────────────────────────────

/**
 * Build a price-field series shifted in time.
 * The price field is identified by `field` (e.g. "close").
 * `shift` is typically negative (display close[i] at time data[i+shift]).
 * Values that would map to before the data start are silently dropped.
 *
 * For positive shifts that produce future timestamps, generateFutureTimes is
 * used automatically (rare in practice — most price groups shift backward).
 */
export function buildPriceSeries(
  data: OhlcvBar[],
  field: "open" | "high" | "low" | "close",
  shift: number,
): { time: Time; value: number }[] {
  const futureCount = Math.max(0, shift);
  const futureTimes =
    futureCount > 0 ? generateFutureTimes(data, futureCount) : [];

  const result: { time: Time; value: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const targetIdx = i + shift;
    let time: Time;

    if (targetIdx < 0) {
      continue; // before data start — skip
    } else if (targetIdx < data.length) {
      time = data[targetIdx].time;
    } else {
      const futureOffset = targetIdx - data.length;
      if (futureOffset >= futureTimes.length) continue;
      time = futureTimes[futureOffset];
    }

    result.push({ time, value: data[i][field] });
  }
  return result;
}
