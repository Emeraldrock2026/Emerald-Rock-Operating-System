/** Relative luminance of a #RRGGBB colour (WCAG 2.x). */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text colour (white or near-black) with the better contrast on a brand colour. */
export function readableTextOn(hex: string): "#FFFFFF" | "#1A1F1D" {
  return contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#1A1F1D") ? "#FFFFFF" : "#1A1F1D";
}

export const HEX = /^#[0-9a-f]{6}$/i;
export type Appearance = "light" | "dark" | "system";
export type Mode = "light" | "dark";

/** Emerald Rock OS defaults (from emeraldrockgroup.com: emerald #2F8C6C, deep green #0B2B22). */
export const DEFAULT_BRANDING = { primary: "#2F8C6C", accent: "#0B2B22", appearance: "system" as Appearance };

/** Page backgrounds the brand colour must stand out against. */
export const SURFACE = { light: "#FFFFFF", dark: "#161B19" } as const;

function mix(hex: string, toward: string, t: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * Brand colour adjusted so buttons, links and focus rings stay visible (3:1)
 * on the page background for that mode. The business's colour is used as-is
 * when it already passes; otherwise it is lightened (dark mode) or darkened.
 */
export function brandFor(hex: string, mode: Mode): string {
  const bg = SURFACE[mode];
  const toward = mode === "dark" ? "#FFFFFF" : "#000000";
  let c = hex.toUpperCase();
  for (let t = 0.1; contrastRatio(c, bg) < 3 && t <= 1; t += 0.1) c = mix(hex, toward, t);
  return c;
}

/** Personal choice wins; otherwise the business default; otherwise follow the device. */
export function resolveAppearance(personal: Appearance | null, business: Appearance | null, deviceDark: boolean): Mode {
  const a = personal ?? business ?? "system";
  return a === "system" ? (deviceDark ? "dark" : "light") : a;
}

/** Readability advice shown before saving branding. Empty = fine. */
export function brandingWarnings(primary: string, accent: string): string[] {
  const w: string[] = [];
  if (!HEX.test(primary) || !HEX.test(accent)) return ["Colours must be hex values like #2F8C6C."];
  if (contrastRatio(primary, SURFACE.light) < 3)
    w.push("The primary colour is very light: buttons and links will be adjusted darker in light mode to stay readable.");
  if (contrastRatio(primary, SURFACE.dark) < 3)
    w.push("The primary colour is very dark: it will be lightened in dark mode to stay readable.");
  if (contrastRatio(accent, readableTextOn(accent)) < 7)
    w.push("Menu text on the accent colour is below the recommended 7:1 contrast. A darker or lighter accent reads better.");
  return w;
}

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Upload checks for a logo file. Returns an error message or null. */
export function logoFileError(file: { type: string; size: number }, dims?: { width: number; height: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size > LOGO_MAX_BYTES) return "The logo must be 2 MB or smaller.";
  if (dims && (dims.width < 64 || dims.height < 32)) return "The logo is too small. Use an image at least 64 × 32 pixels.";
  return null;
}
