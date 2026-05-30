/**
 * Helpers to classify indicator outputs using `displayGroups` metadata
 * introduced in tulip_rs v0.1.10.
 *
 * Each `DisplayGroup` declares which outputs belong together on the same
 * rendering target and what that target is:
 *
 *   - `"Overlay"`   — line overlay on the **price chart**
 *   - `"Indicator"` — line series in its own **oscillator pane**
 *   - `"Volume"`    — line overlay on the **volume bars panel**
 *
 * These helpers replace the old per-indicator hard-coded whitelist.
 */
import type { IndicatorInfo } from "tulip-rs-wasm";

/**
 * Get the `displayType` for a specific output name by scanning the
 * indicator's `displayGroups` metadata.  Falls back to the first group's
 * `displayType` when the output is not explicitly listed.
 *
 * Possible return values: `"Overlay"` | `"Indicator"` | `"Volume"`
 */
export function getOutputDisplayType(
  info: IndicatorInfo,
  outputName: string,
): string {
  for (const group of info.displayGroups) {
    if (group.outputs.includes(outputName)) {
      return group.displayType;
    }
  }
  // Fall back to the primary group's display type.
  return info.displayGroups[0]?.displayType ?? "Indicator";
}

/**
 * Returns `true` when `outputName` belongs to a display group with
 * `displayType === "Overlay"` — i.e. it should render on the **price chart**
 * rather than in the oscillator pane.
 *
 * Replaces the previous hard-coded per-indicator whitelist.
 */
export function isPriceScaleOptional(
  info: IndicatorInfo,
  outputName: string,
): boolean {
  return getOutputDisplayType(info, outputName) === "Overlay";
}

/**
 * Returns `true` when `outputName` belongs to a display group with
 * `displayType === "Volume"` — i.e. it should render as an overlay on the
 * **volume bars panel** rather than in the oscillator pane.
 */
export function isVolumeOptional(
  info: IndicatorInfo,
  outputName: string,
): boolean {
  return getOutputDisplayType(info, outputName) === "Volume";
}
