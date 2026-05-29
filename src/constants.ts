/** Default color palette for indicator output series. */
export const SERIES_COLORS: readonly string[] = [
  "#2196F3", // blue       — primary
  "#ef5350", // red        — secondary (upper / lower bands)
  "#4CAF50", // green
  "#FF9800", // orange
  "#9C27B0", // purple
  "#00BCD4", // cyan
  "#FF5722", // deep orange
  "#607D8B", // blue grey
];

/** Default line width (px) for line series. */
export const DEFAULT_LINE_WIDTH = 1;

/**
 * Default band-fill opacity (0–1).
 * Applied via `ctx.globalAlpha` inside the background renderer.
 */
export const BAND_FILL_ALPHA = 0.1;

/** Default dot radius (px) for scatter/dot overlay indicators (e.g. PSAR). */
export const DEFAULT_DOT_RADIUS = 3;

/**
 * Indicators that should be rendered as isolated dots instead of a
 * connected line.  PSAR is the canonical example — its stop-and-reverse
 * points are displayed as a scatter of dots above/below price bars.
 */
export const DOT_RENDER_INDICATORS: ReadonlySet<string> = new Set(["psar"]);

/**
 * Indicators whose outputs represent fixed horizontal price levels (support /
 * resistance / pivot) rather than a time series.  Each output is drawn as a
 * full-width dashed horizontal line on the price pane.
 *
 * Both spellings of pivot point are listed to handle the npm-package version
 * ("pivotpoint") and the typo present in the current Rust source ("pivitpoint").
 */
export const HORIZONTAL_LINE_INDICATORS: ReadonlySet<string> = new Set([
  "pivotpoint",
  "pivitpoint",
]);

/**
 * Per-output colours for the Pivot Point indicator.
 * Order matches the indicator outputs: s3, s2, s1, pp, r1, r2, r3.
 *
 * - Supports (s1–s3) use red tones — deepening away from price.
 * - Pivot Point (pp) uses steel blue.
 * - Resistances (r1–r3) use green tones — deepening away from price.
 */
export const PIVOT_POINT_COLORS: readonly string[] = [
  "#FF1744", // s3 — deepest support
  "#FF5252", // s2
  "#FF8A80", // s1 — nearest support
  "#82B1FF", // pp — pivot point
  "#B9F6CA", // r1 — nearest resistance
  "#69F0AE", // r2
  "#00E676", // r3 — deepest resistance
];

/**
 * Colour used for PSAR dots when SAR is **below** price (uptrend).
 * Matches the conventional green = bullish palette.
 */
export const PSAR_UP_COLOR = "#4CAF50";

/**
 * Colour used for PSAR dots when SAR is **above** price (downtrend).
 * Matches the conventional red = bearish palette.
 */
export const PSAR_DOWN_COLOR = "#ef5350";
