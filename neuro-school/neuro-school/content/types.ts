// Content model: course > units > lessons > cards.
// Add new lessons by adding data here. Components never hard-code lesson text.

export type IllustrationId =
  | 'keys-thought'
  | 'camera'
  | 'shutter'
  | 'hippocampus'
  | 'brain-side'
  | 'question'
  | 'flame';

type Base = { id: string };

export type ChoiceQuestion = {
  kind: 'choice';
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type TypedQuestion = {
  kind: 'type';
  prompt: string;
  /** Lower-case accepted answers. A response matches if it contains any of them. */
  answers: string[];
  explanation: string;
};

export type ReviewCard = Base & { type: 'review'; fromDay: number } & (ChoiceQuestion | TypedQuestion);
export type RecallCard = Base & { type: 'recall' } & (ChoiceQuestion | TypedQuestion);

export type MysteryCard = Base & {
  type: 'mystery';
  prompt: string;
  options: string[];
  correct: number;
  /** The wrong answer most people choose, used for the "Most people guess that one" line. */
  commonGuess: number;
  explanation: string;
};

export type StoryCard = Base & {
  type: 'story';
  title: string;
  body: string;
  illustration: IllustrationId;
  illustrationBg: 'coral' | 'lavender' | 'mint' | 'butter';
  chips?: { label: string; sub: string; tone: 'butter' | 'mint' | 'lavender' }[];
  /** Show the "Go deeper" button that opens the lesson's med school layer. */
  deeper?: boolean;
};

export type RubricPoint = {
  /** Phrases that count as covering this idea (lower case). */
  keywords: string[];
  praise: string;
  hint: string;
};

export type ExplainCard = Base & {
  type: 'explain';
  friendSays: string;
  rubric: RubricPoint[];
  modelAnswer: string;
};

export type MissionCard = Base & { type: 'mission'; title: string; body: string };

export type Card = ReviewCard | RecallCard | MysteryCard | StoryCard | ExplainCard | MissionCard;

export type DeeperLayer = {
  title: string;
  intro: string;
  terms: { term: string; definition: string }[];
};

export type Lesson = {
  day: number;
  unitId: string;
  title: string;
  minutes: number;
  heroIllustration: IllustrationId;
  cards: Card[];
  deeper?: DeeperLayer;
  mission: string;
  tomorrow?: { title: string; teaser: string };
};

export type Unit = { id: string; title: string; lessonCount: number };

export type Course = {
  id: string;
  title: string;
  units: Unit[];
  lessons: Lesson[];
};
