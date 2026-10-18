import type { PostCardColor } from '@workspace/api-client-react';

// Status (words) post cards: five brand colours (owner, October 2026). Text is
// ink on the light ones and white on blue and black, so every pair passes
// contrast for the big display type these cards use.
export const CARD_COLORS: ReadonlyArray<{ id: PostCardColor; label: string }> = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'red', label: 'Red' },
  { id: 'blue', label: 'Blue' },
  { id: 'peach', label: 'Peach' },
  { id: 'black', label: 'Black' },
];

const CLASS: Record<PostCardColor, string> = {
  yellow: 'bg-yellow text-ink',
  red: 'bg-red text-ink',
  blue: 'bg-blue text-white',
  peach: 'bg-peach text-ink',
  black: 'bg-ink text-white',
};

// Hashtags (CaptionText draws them blue-ink) take the card's text colour, still bold, so they show on blue and black too.
const HASHTAGS = '[&_.text-blue-ink]:text-current';

/** Background and text classes for a status card (yellow when unknown). */
export function cardColorClass(color: PostCardColor | null | undefined): string {
  return `${CLASS[color ?? 'yellow'] ?? CLASS.yellow} ${HASHTAGS}`;
}
