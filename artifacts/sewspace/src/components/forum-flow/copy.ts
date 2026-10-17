import type { ForumBoard, ForumKind } from '@workspace/api-client-react';

// Copy and simple suggestions for the forum flow (docs/design/flows, FlowForum).

export const KIND_ORDER: ForumKind[] = ['show_tell', 'question', 'recommendation', 'info', 'poll'];

export const FLOW_KINDS: Record<ForumKind, {
  label: string; note: string; card: string; iconWrap: string;
  titleLabel: string; titlePh: string; bodyLabel: string; bodyPh: string; tip: string; post: string;
}> = {
  show_tell: {
    label: 'Show & tell', note: 'Share a make, ask for feedback, celebrate a finish.', card: 'bg-yellow text-ink', iconWrap: 'bg-white/70',
    titleLabel: 'Title', titlePh: 'e.g. My first Willa Dress', bodyLabel: 'Tell the story', bodyPh: 'Pattern, fabric, what you changed…',
    tip: 'Show & tell needs at least one photo.', post: 'Post',
  },
  question: {
    label: 'Question', note: 'Get answers. Mark the one that worked so it shows as Solved.', card: 'bg-blue text-white', iconWrap: 'bg-white/20',
    titleLabel: "What's your question?", titlePh: 'e.g. Which interfacing for a linen collar?', bodyLabel: 'Details', bodyPh: 'Your pattern, fabric, and what you’ve tried so far',
    tip: 'Tip: questions with the pattern and fabric get answered faster.', post: 'Ask',
  },
  recommendation: {
    label: 'Recommendation', note: 'Ask for or suggest a pattern, fabric, tool or shop.', card: 'bg-peach text-ink', iconWrap: 'bg-white/60',
    titleLabel: 'What are you looking for?', titlePh: 'e.g. A beginner-friendly jumpsuit pattern', bodyLabel: 'What matters to you', bodyPh: 'Budget, size range, fabric you have…',
    tip: 'Replies can link a pattern or product page.', post: 'Post',
  },
  info: {
    label: 'Info & guide', note: 'Tutorials, tips and things you’ve learned.', card: 'bg-ink text-white', iconWrap: 'bg-white/20',
    titleLabel: 'Title', titlePh: 'e.g. How I grade between sizes', bodyLabel: 'Your guide', bodyPh: 'Steps, photos, sources…',
    tip: 'Guides can be long. Take your time.', post: 'Post',
  },
  poll: {
    label: 'Poll', note: 'Let people vote between 2 to 6 options.', card: 'border-2 border-ink bg-white text-ink', iconWrap: 'bg-canvas',
    titleLabel: 'Poll question', titlePh: 'e.g. Which collar for the sailor top?', bodyLabel: 'Context', bodyPh: 'Why you’re asking',
    tip: 'Results stay hidden until someone votes.', post: 'Post poll',
  },
};

export const BOARD_ORDER: ForumBoard[] = ['fitting', 'fabric', 'patterns', 'machines', 'beginners', 'mending', 'meetups'];
export const BOARD_SHORT: Record<ForumBoard, string> = {
  fitting: 'Fitting', fabric: 'Fabric', patterns: 'Patterns', machines: 'Machines', beginners: 'Beginners', mending: 'Mending', meetups: 'Meetups',
};

// Word stems that point at a board. The board with the most hits wins; ties
// keep BOARD_ORDER. With no hits, each type has a usual board.
const BOARD_WORDS: Record<ForumBoard, string[]> = {
  fitting: ['fit', 'fba', 'sba', 'bust', 'waist', 'hip', 'alter', 'adjust', 'grad', 'muslin', 'toile', 'dart', 'collar', 'sleeve', 'shoulder', 'gap', 'pull', 'size', 'length', 'swayback'],
  fabric: ['fabric', 'linen', 'cotton', 'wool', 'silk', 'knit', 'jersey', 'denim', 'viscose', 'rayon', 'interfac', 'cut', 'prewash', 'pre-wash', 'shrink', 'drape', 'yardage', 'lining'],
  patterns: ['pattern', 'hack', 'pdf', 'print', 'trac', 'dress', 'top', 'trouser', 'pants', 'skirt', 'jacket', 'coat', 'shirt', 'jumpsuit'],
  machines: ['machine', 'serger', 'overlock', 'needle', 'tension', 'bobbin', 'presser', 'foot', 'iron', 'press', 'stitch', 'coverstitch', 'scissors', 'tool'],
  beginners: ['beginner', 'first', 'start', 'learn', 'easy', 'new to', 'basic'],
  mending: ['mend', 'repair', 'patch', 'darn', 'upcycl', 'refashion', 'visible', 'hole', 'tear', 'sashiko'],
  meetups: ['meetup', 'meet up', 'event', 'class', 'workshop', 'swap', 'group', 'near me'],
};
const USUAL_BOARD: Record<ForumKind, ForumBoard> = { show_tell: 'patterns', question: 'fitting', recommendation: 'fabric', info: 'beginners', poll: 'fabric' };

export function suggestBoard(kind: ForumKind | null, text: string): ForumBoard {
  const t = text.toLowerCase();
  let best: ForumBoard | null = null, bestHits = 0;
  for (const b of BOARD_ORDER) {
    const hits = BOARD_WORDS[b].filter(w => t.includes(w)).length;
    if (hits > bestHits) { best = b; bestHits = hits; }
  }
  return best ?? USUAL_BOARD[kind ?? 'question'];
}

/** Same rule as the API (normaliseTags): lower case, spaces become dashes, a-z 0-9 and dashes, at most 30. */
export function normaliseTag(raw: string): string {
  return raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}

const TAG_WORDS = ['linen', 'cotton', 'wool', 'silk', 'knit', 'jersey', 'denim', 'viscose', 'interfacing', 'collar', 'sleeves', 'fit', 'fba', 'grading', 'muslin',
  'darts', 'zips', 'buttonholes', 'hems', 'lining', 'serger', 'overlocker', 'mending', 'visible-mending', 'sashiko', 'pdf-patterns', 'pattern-hacks', 'dress', 'trousers', 'skirt', 'jacket', 'coat', 'shirt', 'jumpsuit'];

/** Tag ideas from words in the title and body, the linked page and the board. */
export function suggestTags(text: string, pageName: string | undefined, board: ForumBoard | null): string[] {
  const words = new Set((text.toLowerCase().match(/[a-z0-9-]+/g) ?? []));
  const out = TAG_WORDS.filter(w => words.has(w) || words.has(`${w}s`) || words.has(w.replace(/s$/, '')));
  if (pageName) out.push(normaliseTag(pageName));
  if (board === 'beginners') out.push('beginner');
  if (board === 'fitting' && !out.includes('fit')) out.push('fit');
  return [...new Set(out)].filter(Boolean);
}
