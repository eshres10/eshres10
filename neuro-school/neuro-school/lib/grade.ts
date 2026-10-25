import type { ExplainCard } from '@/content/types';

export type ExplainFeedback = {
  got: string[];
  missing: string[];
  source: 'ai' | 'keywords';
};

/** Offline fallback: checks which rubric ideas the answer mentions. */
export function gradeWithKeywords(card: ExplainCard, text: string): ExplainFeedback {
  const t = text.toLowerCase();
  const got: string[] = [];
  const missing: string[] = [];
  for (const point of card.rubric) {
    if (point.keywords.some((k) => t.includes(k))) got.push(point.praise);
    else missing.push(point.hint);
  }
  return { got, missing, source: 'keywords' };
}
