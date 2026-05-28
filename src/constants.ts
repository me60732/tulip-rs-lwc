/** Default color palette for indicator output series. */
export const SERIES_COLORS: readonly string[] = [
  '#2196F3', // blue       — primary
  '#ef5350', // red        — secondary (upper / lower bands)
  '#4CAF50', // green
  '#FF9800', // orange
  '#9C27B0', // purple
  '#00BCD4', // cyan
  '#FF5722', // deep orange
  '#607D8B', // blue grey
];

/** Default line width (px) for line series. */
export const DEFAULT_LINE_WIDTH = 1;

/**
 * Default band-fill opacity (0–1).
 * Applied via `ctx.globalAlpha` inside the background renderer.
 */
export const BAND_FILL_ALPHA = 0.1;
