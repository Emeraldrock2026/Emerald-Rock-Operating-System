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
