// Hashtags in captions. Same rule as the API (access/hashtags.ts): "#" plus
// 1–50 of a-z 0-9 _ (any case), not inside a word, a URL or an HTML entity.
const IN_TEXT = /(^|[^\p{L}\p{N}_#&/])#([a-z0-9_]{1,50})(?![\p{L}\p{N}_])/giu;
export const MAX_HASHTAGS = 30;

/** Distinct lower-case hashtags, in order of first use. */
export function parseHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(IN_TEXT)) seen.add(m[2].toLowerCase());
  return [...seen];
}

export type CaptionPart = string | { tag: string; text: string };

/** Splits a caption into text and hashtags, for rendering links. */
export function splitCaption(text: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(IN_TEXT)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ tag: m[2].toLowerCase(), text: `#${m[2]}` });
    last = start + m[2].length + 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The hashtag being typed at the caret ("#lin|"), if any. */
export function hashtagAtCaret(text: string, caret: number): { start: number; end: number; prefix: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[^\p{L}\p{N}_#&/])#([a-z0-9_]{0,50})$/iu.exec(before);
  if (!m) return null;
  const start = caret - m[2].length - 1;
  const after = /^[a-z0-9_]*/i.exec(text.slice(caret))?.[0] ?? '';
  return { start, end: caret + after.length, prefix: (m[2] + after).toLowerCase() };
}

/** 12400 -> "12.4k", 840 -> "840". */
export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Display ratio for a post's photos: 4:5, 1:1, or the first photo's shape kept between 4:5 and 1.91:1. */
export function aspectRatio(aspect: string | undefined, first?: { width: number; height: number }): number {
  if (aspect === '4:5') return 0.8;
  if (aspect === '1:1') return 1;
  return first ? Math.min(1.91, Math.max(0.8, first.width / first.height)) : 0.8;
}
