import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  removeForumUpvote,
  upvoteForum,
  voteForumPoll,
  type ForumBoard,
  type ForumKind,
  type ForumPoll,
  type ForumTopicSummary,
} from '@workspace/api-client-react';
import { ArrowBigUp, BarChart3, Camera, Check, HelpCircle, Info, Lock, MessageCircle, Pin, Star, Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { timeAgo } from '@/lib/time';

export const BOARDS: Record<ForumBoard, string> = {
  fitting: 'Fitting & alterations',
  fabric: 'Fabric & cutting',
  machines: 'Machines & tools',
  patterns: 'Patterns & hacks',
  beginners: "Beginners' corner",
  mending: 'Mending & upcycling',
  meetups: 'Meetups & events',
};

export const KINDS: Record<ForumKind, { label: string; plural: string; icon: typeof Camera; badge: string; desc: string }> = {
  show_tell: { label: 'Show & tell', plural: 'Show & tell', icon: Camera, badge: 'border border-ink bg-white text-ink', desc: 'Share something you made or mended.' },
  question: { label: 'Question', plural: 'Questions', icon: HelpCircle, badge: 'bg-blue text-white', desc: 'Ask for help. Mark the answer that worked.' },
  recommendation: { label: 'Recommendation', plural: 'Recommendations', icon: Star, badge: 'bg-peach text-ink', desc: 'Ask for (or give) a pattern, fabric or tool tip.' },
  info: { label: 'Info & guides', plural: 'Info & guides', icon: Info, badge: 'bg-ink text-white', desc: 'Teach something: a technique, a guide, a fix.' },
  poll: { label: 'Poll', plural: 'Polls', icon: BarChart3, badge: 'bg-yellow text-ink', desc: 'Ask the community to vote.' },
};

export function errorText(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? fallback;
}

export function KindBadge({ kind }: { kind: ForumKind }) {
  const k = KINDS[kind];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${k.badge}`}><k.icon size={12} aria-hidden="true" />{k.label}</span>;
}

export function StateBadges({ topic }: { topic: Pick<ForumTopicSummary, 'solved' | 'pinned' | 'locked'> }) {
  return <>
    {topic.solved && <span className="inline-flex items-center gap-1 rounded-full bg-yellow px-2.5 py-0.5 text-xs font-bold"><Check size={12} aria-hidden="true" />Solved</span>}
    {topic.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold"><Pin size={12} aria-hidden="true" />Pinned</span>}
    {topic.locked && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold"><Lock size={12} aria-hidden="true" />Locked</span>}
  </>;
}

/** Upvote a topic or reply. Signed-out visitors are asked to sign in. */
export function Upvote({ kind, id, votes, voted, own, vertical = false }: { kind: 'topic' | 'reply'; id: number; votes: number; voted: boolean; own: boolean; vertical?: boolean }) {
  const ask = useRequireSignIn();
  const [state, setState] = useState({ votes, voted });
  useEffect(() => setState({ votes, voted }), [votes, voted]);
  const toggle = async () => {
    if (own || !ask({ title: 'Sign in to upvote', body: "You'll come straight back here." })) return;
    const next = !state.voted;
    setState(s => ({ voted: next, votes: s.votes + (next ? 1 : -1) }));
    try {
      const r = next ? await upvoteForum(kind, id) : await removeForumUpvote(kind, id);
      setState({ voted: r.voted, votes: r.votes });
    } catch {
      setState(s => ({ voted: !next, votes: s.votes + (next ? -1 : 1) }));
    }
  };
  return (
    <button type="button" onClick={toggle} disabled={own} aria-pressed={state.voted}
      aria-label={own ? `${state.votes} upvotes` : state.voted ? `Remove upvote (${state.votes})` : `Upvote (${state.votes})`}
      className={`inline-flex shrink-0 items-center justify-center gap-0.5 rounded-[16px] font-bold disabled:cursor-default ${vertical ? 'min-h-[60px] w-12 flex-col self-start' : 'min-h-[40px] px-3'} ${state.voted ? 'bg-yellow' : 'bg-canvas'}`}>
      <ArrowBigUp size={20} aria-hidden="true" className={state.voted ? 'fill-ink' : ''} /><span className="text-sm">{state.votes}</span>
    </button>
  );
}

function closesIn(date: string) {
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return 'closed';
  const days = Math.floor(ms / 86400000), hours = Math.floor(ms / 3600000);
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'} left` : hours >= 1 ? `${hours} hour${hours === 1 ? '' : 's'} left` : 'closes soon';
}

/** "3 days" / "1 week" for a poll that hasn't started yet (the flow's preview). */
function pollLength(closesAt: string) {
  const days = Math.max(1, Math.round((new Date(closesAt).getTime() - Date.now()) / 86400000));
  return days === 7 ? '1 week' : `${days} day${days === 1 ? '' : 's'}`;
}

/** Inline poll: choose an option to see results; change your vote while it's open. */
export function Poll({ topicId, poll: initial }: { topicId: number; poll: ForumPoll }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPoll(initial), [initial]);
  const vote = async (optionId: number) => {
    if (!poll.open || !ask({ title: 'Sign in to vote', body: 'Results show once you vote.' })) return;
    setBusy(optionId);
    setError(null);
    try {
      setPoll(await voteForumPoll(topicId, { optionId }));
      client.invalidateQueries({ queryKey: ['/api/public/forum/topics'] });
    } catch (e) {
      setError(errorText(e, "That vote didn't count. Try again."));
    } finally {
      setBusy(null);
    }
  };
  const max = Math.max(1, ...poll.options.map(o => o.votes ?? 0));
  return (
    <div className="space-y-2" role="group" aria-label="Poll">
      {poll.options.map(o => {
        const pct = poll.revealed && poll.total ? Math.round(((o.votes ?? 0) / poll.total) * 100) : 0;
        const mine = poll.myOptionId === o.id;
        return (
          <button key={o.id} type="button" onClick={() => vote(o.id)} disabled={!poll.open || busy !== null} aria-pressed={mine}
            className={`relative flex min-h-[48px] w-full items-center overflow-hidden rounded-[16px] border px-4 text-left text-sm font-semibold disabled:cursor-default ${mine ? 'border-ink' : 'border-line'} bg-white`}>
            {poll.revealed && <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${(o.votes ?? 0) === max ? 'bg-yellow' : 'bg-canvas'}`} style={{ width: `${pct}%` }} />}
            <span className="relative flex-1">{o.label}{mine && <Check size={14} className="ml-1.5 inline" aria-label="your vote" />}</span>
            {poll.revealed && <span className="relative font-bold">{pct}%</span>}
          </button>
        );
      })}
      <p className="text-xs text-subtle">
        {poll.total} vote{poll.total === 1 ? '' : 's'} · {closesIn(poll.closesAt)}
        {!poll.revealed && poll.open && ' · results show once you vote'}
        {poll.myOptionId && poll.open && ' · tap another option to change your vote'}
      </p>
      {error && <p role="alert" className="text-sm font-semibold text-red-ink">{error}</p>}
    </div>
  );
}

/** Show & tell photos: up to three thumbnails, the rest as "+n". */
export function TopicPhotos({ photos, preview = false }: { photos: ForumTopicSummary['photos']; preview?: boolean }) {
  if (!photos.length) return null;
  const shown = photos.slice(0, 3);
  return (
    <div className={`mt-3 grid gap-1.5 ${shown.length === 1 ? 'grid-cols-1' : shown.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {shown.map((p, i) => (
        <span key={p.id} className="relative block overflow-hidden rounded-[14px] bg-canvas" style={{ aspectRatio: shown.length === 1 ? '4 / 3' : '4 / 5', backgroundColor: p.color ?? undefined }}>
          <img src={p.thumbUrl} alt={p.altText} loading={preview ? undefined : 'lazy'} className="h-full w-full object-cover" />
          {i === 2 && photos.length > 3 && <span className="absolute inset-0 grid place-items-center bg-ink/55 font-display text-xl text-white">+{photos.length - 3}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * A topic in a list, as in the design: votes, badges, title, excerpt, photos,
 * poll, accepted answer. `preview` shows it as it will appear, without links or
 * voting (the forum flow's Preview step).
 */
export function TopicCard({ topic: t, preview = false }: { topic: ForumTopicSummary; preview?: boolean }) {
  return (
    <article className="flex gap-3 rounded-[30px] bg-white p-4 sm:p-5">
      <Upvote kind="topic" id={t.id} votes={t.votes} voted={t.votedByMe} own={preview} vertical />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><KindBadge kind={t.kind} /><StateBadges topic={t} /></div>
        <p className="mt-1.5 text-xs text-subtle">{BOARDS[t.board]} · @{t.author.handle} · {timeAgo(t.createdAt)}</p>
        <h3 className="mt-1 font-display text-[19px] leading-snug tracking-[-.03em]">
          {preview ? t.title : <Link href={`/forum/topics/${t.id}`} className="text-ink no-underline hover:underline">{t.title}</Link>}
        </h3>
        {t.excerpt && t.kind !== 'poll' && <p className="mt-1 line-clamp-2 text-sm text-subtle">{t.excerpt}</p>}
        <TopicPhotos photos={t.photos} preview={preview} />
        {t.poll && (preview
          ? <div className="mt-3 space-y-2">{t.poll.options.map(o => <p key={o.id} className="flex min-h-[44px] items-center rounded-[16px] border-2 border-ink px-4 text-sm font-semibold">{o.label}</p>)}<p className="text-xs text-subtle">{pollLength(t.poll.closesAt)} to vote · results show once people vote</p></div>
          : <div className="mt-3"><Poll topicId={t.id} poll={t.poll} /></div>)}
        {t.acceptedAnswer && (
          <div className="mt-3 rounded-[16px] bg-canvas p-3 text-sm">
            <p className="text-xs font-bold"><Check size={12} className="mr-1 inline" aria-hidden="true" />Accepted answer from @{t.acceptedAnswer.author}</p>
            <p className="mt-1 line-clamp-2">{t.acceptedAnswer.excerpt}</p>
          </div>
        )}
        {t.topRecommendations.length > 0 && (
          <p className="mt-2 text-sm"><Trophy size={13} className="mr-1 inline" aria-hidden="true" />Most recommended: {t.topRecommendations.map((r, i) => (
            <span key={r.catalog.slug}>{i > 0 && ', '}<Link href={`/catalog/${r.catalog.kind}/${r.catalog.slug}`} className="font-semibold text-blue-ink">{r.catalog.name}</Link> ×{r.count}</span>
          ))}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {!preview && <Link href={`/forum/topics/${t.id}#replies`} className="inline-flex items-center gap-1 font-semibold text-ink no-underline">
            <MessageCircle size={14} aria-hidden="true" />
            {t.replies ? `${t.replies} ${t.kind === 'question' ? (t.replies === 1 ? 'answer' : 'answers') : (t.replies === 1 ? 'reply' : 'replies')}` : t.kind === 'question' ? 'Be the first to answer' : 'No replies yet'}
          </Link>}
          {t.tags.map(tag => preview ? <span key={tag} className="text-subtle">#{tag}</span> : <Link key={tag} href={`/forum?q=${encodeURIComponent(tag)}`} className="text-subtle">#{tag}</Link>)}
        </div>
      </div>
    </article>
  );
}
