import sharp from "sharp";

export class UnreadableColourImageError extends Error {}

const hex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The main colours of an image, most common first. No AI: the image is shrunk
 * to 64 px with sharp and its pixels grouped with a small k-means (deterministic
 * farthest-point start, 12 rounds). Near-duplicate colours and groups under 3%
 * of the pixels are dropped, so fewer
 * than `k` may come back for flat images.
 */
export async function dominantColours(image: Buffer, k = 4): Promise<string[]> {
  let data: Buffer;
  try {
    ({ data } = await sharp(image).rotate().resize(64, 64, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  } catch {
    throw new UnreadableColourImageError();
  }
  const pixels: number[][] = [];
  for (let i = 0; i + 2 < data.length; i += 3) pixels.push([data[i], data[i + 1], data[i + 2]]);
  if (!pixels.length) throw new UnreadableColourImageError();

  // Start: the mean, then repeatedly the pixel farthest from every centre so far.
  const mean = [0, 1, 2].map((c) => pixels.reduce((s, p) => s + p[c], 0) / pixels.length);
  const centres: number[][] = [mean];
  while (centres.length < k) {
    let best = pixels[0], bestD = -1;
    for (const p of pixels) {
      const d = Math.min(...centres.map((c) => dist(p, c)));
      if (d > bestD) { bestD = d; best = p; }
    }
    if (bestD <= 0) break;
    centres.push([...best]);
  }
  let counts = new Array(centres.length).fill(0);
  for (let round = 0; round < 12; round++) {
    const sums = centres.map(() => [0, 0, 0]);
    counts = new Array(centres.length).fill(0);
    for (const p of pixels) {
      let at = 0, atD = Infinity;
      centres.forEach((c, i) => { const d = dist(p, c); if (d < atD) { atD = d; at = i; } });
      counts[at]++;
      for (let c = 0; c < 3; c++) sums[at][c] += p[c];
    }
    centres.forEach((c, i) => { if (counts[i]) for (let ch = 0; ch < 3; ch++) c[ch] = sums[i][ch] / counts[i]; });
  }
  // Tiny groups are mostly blended edge pixels, not colours anyone would pick.
  const ordered = centres.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n >= pixels.length * 0.03).sort((a, b) => b.n - a.n);
  const out: number[][] = [];
  for (const { c } of ordered) if (!out.some((o) => dist(o, c) < 18 ** 2)) out.push(c);
  return out.map(hex);
}
