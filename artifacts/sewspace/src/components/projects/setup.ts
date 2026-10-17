// Helpers for "Finish setting up" (Phase F2). Pure functions, no React.

const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];

/**
 * Size chips from a pattern's sizes text: "6–24" (even steps when both ends
 * are even), "XS–XL", or a list ("S, M, L", "0 / 2 / 4"). Null when it can't
 * be read, so the question falls back to a text field.
 */
export function parseSizes(text: string | null | undefined): string[] | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;
  const range = /^(?:sizes?\s*)?(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})$/i.exec(raw);
  if (range) {
    const a = Number(range[1]), b = Number(range[2]);
    if (b <= a || b - a > 40) return null;
    const step = a % 2 === 0 && b % 2 === 0 ? 2 : 1;
    const out: string[] = [];
    for (let n = a; n <= b; n += step) out.push(String(n));
    return out.length <= 24 ? out : null;
  }
  const letters = /^(?:sizes?\s*)?([0-9]?X{0,3}[SML]|[0-9]XL)\s*(?:-|–|—|to)\s*([0-9]?X{0,3}[SML]|[0-9]XL)$/i.exec(raw);
  if (letters) {
    const norm = (s: string) => s.toUpperCase().replace(/^XXXL$/, '3XL');
    const i = LETTERS.indexOf(norm(letters[1])), j = LETTERS.indexOf(norm(letters[2]));
    return i >= 0 && j > i ? LETTERS.slice(i, j + 1) : null;
  }
  const parts = raw.split(/\s*[,/;|]\s*|\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 24 && parts.every(p => /^(\d{1,2}(\.5)?|[0-9]?X{0,3}[SML]|[0-9]XL|OS)$/i.test(p))) return parts.map(p => p.toUpperCase());
  return null;
}

/** Metres in an amount, reading the unit loosely ("m", "meters", "yd", "yards"). */
export function toMetres(quantity: number, unit: string | null | undefined): number {
  return /^y/i.test(unit ?? '') ? quantity * 0.9144 : quantity;
}

/** "2.5 m" / "2.7 yd", one decimal, in the person's units. */
export function formatLength(metres: number, units: 'metric' | 'imperial'): string {
  const value = units === 'imperial' ? metres / 0.9144 : metres;
  return `${Math.round(value * 10) / 10} ${units === 'imperial' ? 'yd' : 'm'}`;
}

/**
 * Whether a fabric covers a pattern. The pattern's yardage is in yards (as
 * the pattern library labels it). Null when either amount is missing.
 */
export function fabricFit(fabric: { quantity?: number | null; unit?: string | null }, patternYards: number | null | undefined, units: 'metric' | 'imperial') {
  if (!fabric.quantity || !patternYards) return null;
  const have = toMetres(fabric.quantity, fabric.unit), need = patternYards * 0.9144;
  const short = need - have;
  return short <= 0.05 ? { enough: true as const, label: 'Enough' } : { enough: false as const, label: `Short ${formatLength(short, units)}` };
}
