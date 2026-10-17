// Colour swatches for the stash flow (Phase F3). People pick the closest
// swatch (or Custom); nobody types hex codes. colourName labels swatches.

export const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['Black', '#1b1b1b'], ['White', '#f5f3ee'], ['Cream', '#ece3cf'], ['Grey', '#8a8d91'],
  ['Navy', '#1f2a44'], ['Chambray blue', '#7f9cc4'], ['Blue', '#3f63b5'], ['Green', '#4e7a55'],
  ['Olive', '#76784a'], ['Mustard', '#d1a43b'], ['Red', '#b33a3a'], ['Pink', '#e4a3b4'],
  ['Rust', '#b5653a'], ['Brown', '#6b4a32'], ['Lavender', '#a99bc9'], ['Teal', '#2f7a78'],
];

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** The palette name nearest to a #rrggbb colour. */
export function colourName(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '';
  const [r, g, b] = rgb(hex.toLowerCase());
  let best = PALETTE[0][0], bestD = Infinity;
  for (const [name, h] of PALETTE) {
    const [r2, g2, b2] = rgb(h);
    // Weighted RGB distance, closer to how people see colour than plain RGB.
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}
