/** Canvas twins of the CSS tokens in src/styles.css. Do not add hues. */
export const palette = {
  paper: "#efe4cf",
  ink: "#1c1916",
  bone: "#f7f2e8",
  signal: "#e23b28",
} as const;

export const VW = 960;
export const VH = 540;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
