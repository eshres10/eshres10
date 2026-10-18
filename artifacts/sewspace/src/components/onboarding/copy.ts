import type { OnboardingExperience, OnboardingGoal, OnboardingStashSize, OnboardingTool, Visibility } from '@workspace/api-client-react';
import type { PipPose } from './Pip';

// Pip's questions: copy, options and Pip's lines, from the mockup's
// renderVals() (docs/design/onboarding/source/MOnboard00.dc.html). Option ids
// are the API's enums (migration 0015 CHECKs the same values).

export type Tone = 'yellow' | 'blue' | 'peach' | 'mist';
export const TONE: Record<Tone, string> = { yellow: 'bg-yellow', blue: 'bg-blue-soft', peach: 'bg-peach-soft', mist: 'bg-mist' };

/** 24×24 line icons (stroke paths) for the option tiles. */
export const GLYPH = {
  box: 'M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5V21h16',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  store: 'M3 9l1.5-5h15L21 9 M3 9v11h18V9 M3 9h18 M9 20v-6h6v6',
  seed: 'M12 22V12 M12 12C12 7 8 4 3 4c0 5 4 8 9 8z M12 12c0-4 3-7 8-7 0 4-3 7-8 7z',
  spool: 'M6 3h12 M6 21h12 M8 3v18 M16 3v18 M8 8h8 M8 12h8 M8 16h8',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  cap: 'M22 10 12 5 2 10l10 5 10-5z M6 12v5c3 2 9 2 12 0v-5',
  machine: 'M3 20h18 M5 20V8a3 3 0 0 1 3-3h10a2 2 0 0 1 2 2v3h-6v10 M14 10v3',
  loops: 'M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0',
  dashes: 'M3 9h4 M10 9h4 M17 9h4 M3 15h4 M10 15h4 M17 15h4',
  hoop: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  needle: 'M19 5 5 19 M15.5 4.5a2.5 2.5 0 1 1 4 4',
  small: 'M7 13h10v7H7z',
  drawer: 'M3 4h18v16H3z M3 12h18 M10 8h4 M10 16h4',
  cupboard: 'M4 2h16v20H4z M12 2v20 M9 11v2 M15 11v2',
  mountain: 'M2 20 9 6l4 7 3-4 6 11z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  lock: 'M5 11h14v10H5z M7 11V7a5 5 0 0 1 10 0v4',
} as const;
export type GlyphName = keyof typeof GLYPH;

export type Option<V extends string> = { value: V; label: string; sub?: string; glyph: GlyphName };

// Tile colours follow the mockup: yellow, blue, peach, grey, then round again.
const TONES: Tone[] = ['yellow', 'blue', 'peach', 'mist'];
export const toneAt = (index: number) => TONES[index % TONES.length];

export const GOALS: Option<OnboardingGoal>[] = [
  { value: 'stash', label: 'Keep track of my stash', sub: 'Fabric, thread and patterns in one place', glyph: 'box' },
  { value: 'idea', label: 'Find my next project', glyph: 'sparkle' },
  { value: 'learn', label: 'Learn to sew', glyph: 'book' },
  { value: 'share', label: 'Share what I make', glyph: 'camera' },
  { value: 'challenges', label: 'Join sewing challenges', glyph: 'trophy' },
  { value: 'sell', label: 'Sell my own patterns', glyph: 'store' },
];
export const EXPERIENCE: Option<OnboardingExperience>[] = [
  { value: 'start', label: 'Just starting out', sub: 'Threading the machine is still an adventure', glyph: 'seed' },
  { value: 'couple', label: 'A year or two', sub: 'I can follow most patterns', glyph: 'spool' },
  { value: 'years', label: 'Five years or more', sub: 'I alter patterns to fit me', glyph: 'star' },
  { value: 'pro', label: 'I teach or sew for a living', glyph: 'cap' },
];
/**
 * Question 4's illustrations (owner's call: no photos; the mockup's are not
 * ours). 48×48 line drawings, stroked in ink on the tile colour.
 */
export const MAKE_ART: Record<string, string> = {
  Dresses: 'M19 5v7 M29 5v7 M17 12h14l-2 8H19z M19 20 11 42h26L29 20 M15 34h18',
  Tops: 'M18 8 9 13l3 7 5-2v22h14V18l5 2 3-7-9-5c-2 4-10 4-12 0z',
  Skirts: 'M15 8h18v5H15z M15 13 9 40h30l-6-27 M19 20l-3 18 M24 20v18 M29 20l3 18',
  Trousers: 'M14 7h20v6H14z M14 13l-2 29h9l3-21 3 21h9l-2-29',
  Outerwear: 'M18 6l6 8 6-8 8 4 3 30h-8v2H15v-2H7l3-30z M24 14v28 M28 23h.5 M28 31h.5',
  Knits: 'M18 8 9 12 6 34h6l2-12v20h20V22l2 12h6l-3-22-9-4c-2 4-10 4-12 0z M14 36h20 M18 36v6 M24 36v6 M30 36v6',
  Bags: 'M10 18h28l-3 24H13z M18 18v-4a6 6 0 0 1 12 0v4 M17 26h14',
  Costume: 'M8 36 10 14l8 9 6-13 6 13 8-9 2 22z M8 41h32 M24 26v.5',
  // Not Q4 options: covers for directory pages in Home (quilts, cushions, aprons) and Other (toys, pets…).
  Home: 'M9 9h30v30H9z M9 24h30 M24 9v30 M9 9l15 15 M24 24l15 15 M39 9 24 24',
  Other: 'M12 8h24v5H12z M12 35h24v5H12z M16 13v22 M32 13v22 M16 19h16 M16 24h16 M16 29h16',
  Mending: 'M8 14h22v22H8z M12 18h2 M18 18h2 M24 18h2 M12 32h2 M18 32h2 M24 32h2 M34 34 44 8 M41.5 11.5a2 2 0 1 1 2.5-3',
};

/** Question 4: saved as the profile's "favourite things to make" (favoriteGarments), so the values are the labels. */
export const MAKES = ['Dresses', 'Tops', 'Skirts', 'Trousers', 'Outerwear', 'Knits', 'Bags', 'Costume', 'Mending'] as const;
export const TOOLS: Option<OnboardingTool>[] = [
  { value: 'machine', label: 'Sewing machine', glyph: 'machine' },
  { value: 'overlocker', label: 'Overlocker or serger', glyph: 'loops' },
  { value: 'cover', label: 'Coverstitch machine', glyph: 'dashes' },
  { value: 'embroidery', label: 'Embroidery machine', glyph: 'hoop' },
  { value: 'hand', label: 'Needle and thread', sub: 'Hand sewing counts!', glyph: 'needle' },
];
export const STASH: Option<OnboardingStashSize>[] = [
  { value: 'start', label: 'Just getting started', glyph: 'small' },
  { value: 'drawer', label: 'A tidy drawer', glyph: 'drawer' },
  { value: 'cupboard', label: 'A whole cupboard', glyph: 'cupboard' },
  { value: 'secret', label: 'We don’t talk about it', glyph: 'mountain' },
];
export const AUDIENCE: Option<Visibility>[] = [
  { value: 'public', label: 'Everyone', sub: 'Anyone can see and be inspired', glyph: 'globe' },
  { value: 'followers', label: 'My followers', sub: 'People who follow you', glyph: 'users' },
  { value: 'private', label: 'Only me', sub: 'A private sewing diary', glyph: 'lock' },
];

/** Question 3 onto the profile's experience field (same mapping as the API's EXPERIENCE_LEVEL). */
export const EXPERIENCE_LEVEL: Record<OnboardingExperience, 'beginner' | 'intermediate' | 'advanced'> = {
  start: 'beginner', couple: 'intermediate', years: 'advanced', pro: 'advanced',
};

/** Everything Pip's lines react to. */
export type Answers = {
  name: string;
  goals: OnboardingGoal[];
  experience: OnboardingExperience | null;
  makes: string[];
  tools: OnboardingTool[];
  stashSize: OnboardingStashSize | null;
  audience: Visibility | null;
};

const GOAL_LEAD: Record<OnboardingGoal, string> = {
  learn: 'Learning to sew? You’re in good hands.', stash: 'A stash organiser! My favourite kind of sewist.', sell: 'A pattern designer? Ooh, fancy.',
  share: 'I can’t wait to see what you make.', challenges: 'Challenges are the best motivation.', idea: 'Let’s find your next make.',
};
const EXPERIENCE_LEAD: Record<OnboardingExperience, string> = {
  start: 'Everyone starts with a wonky seam. Even me.', couple: 'Just enough to be dangerous. The fun part!',
  years: 'A seasoned sewist. I’ll try to keep up.', pro: 'A pro! I’ll stay out of your way.',
};
const STASH_LEAD: Record<OnboardingStashSize, string> = {
  start: 'A fresh start. Love it.', drawer: 'Neat and tidy. Respect.', cupboard: 'A whole cupboard! Fabric dreams.', secret: 'Ha! Your secret’s safe with me.',
};
function makesLead(makes: string[]) {
  if (!makes.length) return 'Keeping your options open. Smart.';
  if (makes.length === 1) return `${makes[0]}? Great choice.`;
  return `${makes[0]} and ${makes[1].toLowerCase()}? Great taste.`;
}

export type Question = { title: string; help?: string; optional: boolean; lead: (a: Answers) => string; pose: (a: Answers) => PipPose };

/** Questions 1–7. Pip's line reacts to the answer before it. */
export const QUESTIONS: Record<number, Question> = {
  1: { title: 'First, what should I call you?', optional: false, lead: () => 'Every sewist needs a name tag.', pose: () => 'curious' },
  2: { title: 'What brings you to Seams Club?', help: 'Pick as many as you like.', optional: true, lead: a => (a.name ? `Nice to meet you, ${a.name}!` : 'Nice to meet you!'), pose: () => 'wave' },
  3: { title: 'How long have you been sewing?', optional: true, lead: a => (a.goals.length ? GOAL_LEAD[a.goals[0]] : 'No worries. Let’s keep going.'), pose: () => 'thinking' },
  4: { title: 'What do you love to make?', help: 'Pick a few and I’ll find patterns to match.', optional: true, lead: a => (a.experience ? EXPERIENCE_LEAD[a.experience] : 'Okay!'), pose: () => 'happy' },
  5: { title: 'What do you sew with?', help: 'So I only suggest things you can make.', optional: true, lead: a => makesLead(a.makes), pose: () => 'curious' },
  6: { title: 'How big is your fabric stash?', optional: true, lead: () => 'Okay, a personal question…', pose: a => (a.stashSize === 'secret' ? 'laugh' : 'curious') },
  7: {
    title: 'Who should see your posts?', help: 'Your stash, patterns and measurements are always private. This is only for things you post.',
    optional: false, lead: a => (a.stashSize ? STASH_LEAD[a.stashSize] : 'Last one, promise.'), pose: () => 'wink',
  },
};
export const QUESTION_COUNT = 7;
