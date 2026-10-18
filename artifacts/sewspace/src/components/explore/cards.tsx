import type { ExploreCard } from '@workspace/api-client-react';
import { MessageCircle, Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { Garment } from '@/components/brand/Garment';
import { formatPrice } from '@/lib/currency';

// Explore's four card types. Every card opens its existing page. Photos keep
// their real shape (posts) or a fixed 4:5 (pattern and challenge covers,
// which have no stored size), so the grid can hold the space before loading.
// Save / Share / More / Hide sit on top of these (actions.tsx); the first
// text line of each card leaves room (pr-9) for its "…" button.

const ART: Record<string, string> = { dresses: 'Dresses', tops: 'Tops', skirts: 'Skirts', trousers: 'Trousers', outerwear: 'Outerwear', knitwear: 'Knits', bags: 'Bags', jumpsuits: 'Dresses', home: 'Home', other: 'Other' };
const TONES = ['bg-blue-soft', 'bg-peach-soft', 'bg-mist'];
const CARD_LINK = 'group block [-webkit-touch-callout:none] rounded-[20px] text-ink no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const BOARD_LABEL: Record<string, string> = {
  fitting: 'Fitting', patterns: 'Pattern help', fabric: 'Fabric', machines: 'Machines', beginners: 'Beginners', mending: 'Mending', meetups: 'Meetups',
};
const BOARD_TONE: Record<string, string> = {
  fitting: 'bg-yellow/40', patterns: 'bg-peach-soft', fabric: 'bg-blue-soft', machines: 'bg-mist', beginners: 'bg-yellow/25', mending: 'bg-peach/25', meetups: 'bg-blue/15',
};

/** Height of a card relative to its width, for placing it in the shortest column. */
export function cardHeight(card: ExploreCard): number {
  if (card.post) return card.post.photo.height / Math.max(1, card.post.photo.width) + 0.32;
  if (card.thread) return 0.85 + Math.min(card.thread.excerpt.length, 180) / 600 + Math.min(card.thread.title.length, 80) / 300;
  return 1.25 + 0.3;
}

/** Where the card leads. */
export function cardHref(card: ExploreCard): string {
  if (card.post) return `/posts/${card.post.id}`;
  if (card.pattern) return `/catalog/pattern/${card.pattern.slug}`;
  if (card.challenge) return `/challenges/${card.challenge.slug}`;
  if (card.thread) return `/forum/topics/${card.thread.id}`;
  return '/explore';
}

/** A short name for the card (menus, the save sheet, share titles). */
export function cardTitle(card: ExploreCard): string {
  if (card.post) return card.post.caption.trim() || `Post by @${card.post.author.handle}`;
  if (card.pattern) return card.pattern.name;
  if (card.challenge) return card.challenge.title.startsWith('#') ? card.challenge.title : `#${card.challenge.tag}`;
  return card.thread?.title ?? 'Idea';
}

/** The shape of the photo area (top of the card), or null for thread cards (all text). */
export function cardArea(card: ExploreCard): string | null {
  if (card.post) return `${card.post.photo.width} / ${card.post.photo.height}`;
  return card.thread ? null : '4 / 5';
}

/** The card's picture filling its box: for the lifted card and the save sheet. Threads get their tone and title. */
export function CardMedia({ card, index, small = false }: { card: ExploreCard; index: number; small?: boolean }) {
  const fill = 'h-full w-full object-cover';
  if (card.post) return <img src={card.post.photo.thumbUrl} alt="" draggable={false} className={fill} style={{ background: card.post.photo.color ?? undefined }} />;
  if (card.pattern) return card.pattern.coverImageUrl
    ? <img src={card.pattern.coverImageUrl} alt="" draggable={false} className={fill} />
    : <Garment name={ART[card.pattern.category] ?? 'Tops'} tone={TONES[index % TONES.length]} className="h-full w-full" />;
  if (card.challenge) return card.challenge.cover
    ? <img src={card.challenge.cover.thumbUrl} alt="" draggable={false} className={fill} style={{ background: card.challenge.cover.color ?? undefined }} />
    : <span className="grid h-full w-full place-items-center bg-yellow/40"><Trophy size={small ? 20 : 40} aria-hidden="true" /></span>;
  const t = card.thread!;
  const tone = t.kind === 'show_tell' ? 'bg-peach/30' : BOARD_TONE[t.board] ?? 'bg-mist';
  return small
    ? <span className={`grid h-full w-full place-items-center ${tone}`}><MessageCircle size={20} aria-hidden="true" /></span>
    : <span className={`block h-full w-full p-4 font-display text-[16px] leading-tight tracking-[-.03em] ${tone}`}>{t.title}</span>;
}

export function ExploreCardView({ card, index }: { card: ExploreCard; index: number }) {
  if (card.post) return <PostCard post={card.post} />;
  if (card.pattern) return <PatternCard pattern={card.pattern} index={index} />;
  if (card.challenge) return <ChallengeCard challenge={card.challenge} />;
  if (card.thread) return <ThreadCard thread={card.thread} />;
  return null;
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full px-2.5 py-1 text-[12px] font-bold ${className}`}>{children}</span>;
}

function PostCard({ post }: { post: NonNullable<ExploreCard['post']> }) {
  const { photo } = post;
  return (
    <Link href={`/posts/${post.id}`} className={CARD_LINK} draggable={false}>
      <span className="relative block overflow-hidden rounded-[20px]" style={{ aspectRatio: `${photo.width} / ${photo.height}`, background: photo.color ?? undefined }}>
        <img src={photo.thumbUrl} alt={photo.altText} loading="lazy" draggable={false} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" />
        {post.chip && <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-bold">{post.chip}</span>}
      </span>
      {post.caption && <span className="mt-2 line-clamp-2 px-1 pr-9 text-[13px] font-semibold leading-snug">{post.caption}</span>}
      <span className={`mt-1.5 flex items-center gap-1.5 px-1 pb-1 ${post.caption ? '' : 'pr-9'}`}>
        <UserAvatar name={post.author.name} avatarUrl={post.author.avatarUrl} size={20} />
        <span className="truncate text-[12px] text-subtle">@{post.author.handle}</span>
      </span>
    </Link>
  );
}

function PatternCard({ pattern, index }: { pattern: NonNullable<ExploreCard['pattern']>; index: number }) {
  const price = pattern.free ? 'Free' : pattern.priceCents && pattern.currency ? formatPrice(pattern.priceCents, pattern.currency) : null;
  const meta = [pattern.designer, pattern.rating !== null ? `★ ${pattern.rating.toFixed(1)}` : null, `${pattern.makes.toLocaleString()} ${pattern.makes === 1 ? 'make' : 'makes'}`].filter(Boolean).join(' · ');
  return (
    <Link href={`/catalog/pattern/${pattern.slug}`} className={CARD_LINK} draggable={false}>
      <span className="relative block overflow-hidden rounded-[20px]">
        {pattern.coverImageUrl
          ? <img src={pattern.coverImageUrl} alt="" loading="lazy" draggable={false} className="aspect-[4/5] w-full object-cover" />
          : <Garment name={ART[pattern.category] ?? 'Tops'} tone={TONES[index % TONES.length]} className="aspect-[4/5] w-full" />}
        {price && <Chip className={pattern.free ? 'bg-blue text-white' : 'bg-yellow text-ink'}>{price}</Chip>}
      </span>
      <span className="mt-2 block truncate px-1 pr-9 text-[14px] font-bold">{pattern.name}</span>
      <span className="mt-0.5 block truncate px-1 pb-1 text-[12px] text-subtle">{meta}</span>
    </Link>
  );
}

const DAY = 86400_000;
function challengeLine(c: NonNullable<ExploreCard['challenge']>): string {
  const now = Date.now();
  if (c.status === 'upcoming') {
    const days = Math.max(1, Math.ceil((new Date(c.startsAt).getTime() - now) / DAY));
    return `Starts in ${days} ${days === 1 ? 'day' : 'days'}${c.members ? ` · ${c.members.toLocaleString()} interested` : ''}`;
  }
  if (c.status === 'ended') return `Ended · ${c.entries.toLocaleString()} ${c.entries === 1 ? 'make' : 'makes'}`;
  const days = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - now) / DAY));
  return `${days <= 1 ? 'Ends today' : `${days} days left`} · ${c.members.toLocaleString()} joined`;
}
const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'Running now', className: 'bg-yellow text-ink' },
  upcoming: { label: 'Starting soon', className: 'bg-white text-blue-ink ring-2 ring-inset ring-blue-ink' },
  ended: { label: 'Finished', className: 'bg-ink text-white' },
};

function ChallengeCard({ challenge }: { challenge: NonNullable<ExploreCard['challenge']> }) {
  const status = STATUS[challenge.status];
  return (
    <Link href={`/challenges/${challenge.slug}`} className={CARD_LINK} draggable={false}>
      <span className="relative block overflow-hidden rounded-[20px]">
        {challenge.cover
          ? <img src={challenge.cover.thumbUrl} alt="" loading="lazy" draggable={false} className="aspect-[4/5] w-full object-cover" style={{ background: challenge.cover.color ?? undefined }} />
          : <span className="grid aspect-[4/5] w-full place-items-center bg-yellow/40"><Trophy size={40} aria-hidden="true" /></span>}
        <Chip className={status.className}>{status.label}</Chip>
      </span>
      <span className="mt-2 block truncate px-1 pr-9 text-[14px] font-bold">{challenge.title.startsWith('#') ? challenge.title : `#${challenge.tag}`}</span>
      <span className="mt-0.5 block truncate px-1 pb-1 text-[12px] text-subtle">{challengeLine(challenge)}</span>
    </Link>
  );
}

function ThreadCard({ thread }: { thread: NonNullable<ExploreCard['thread']> }) {
  const label = thread.kind === 'show_tell' ? 'Show & tell' : BOARD_LABEL[thread.board] ?? 'Forum';
  const tone = thread.kind === 'show_tell' ? 'bg-peach/30' : BOARD_TONE[thread.board] ?? 'bg-mist';
  return (
    <Link href={`/forum/topics/${thread.id}`} className={`${CARD_LINK} ${tone} p-4`} draggable={false}>
      <span className="inline-block max-w-[calc(100%-2.5rem)] truncate rounded-full bg-white px-2.5 py-1 text-[12px] font-bold">{label}</span>
      <span className="mt-3 block font-display text-[17px] leading-tight tracking-[-.03em]">{thread.title}</span>
      {thread.excerpt && <span className="mt-2 line-clamp-3 text-[13px] leading-snug text-ink/80">{thread.excerpt}</span>}
      <span className="mt-3 flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate font-semibold">@{thread.author.handle}</span>
        <span className="inline-flex shrink-0 items-center gap-1"><MessageCircle size={13} aria-hidden="true" />{thread.replies}<span className="sr-only"> {thread.replies === 1 ? 'reply' : 'replies'}</span></span>
      </span>
    </Link>
  );
}
