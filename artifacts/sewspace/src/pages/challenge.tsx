import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteChallengeEntry,
  getChallengeEntries,
  getGetChallengePageQueryKey,
  joinChallenge,
  leaveChallenge,
  useGetChallengePage,
  useUpdateChallenge,
  type Challenge,
  type ChallengeEntry,
} from '@workspace/api-client-react';
import { Check, Heart, Loader2, MessageCircle, Pencil, Plus, Share2, Trash2, Trophy, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { dateRange, errorText, StatusPill } from '@/components/challenges/parts';
import { ErrorState, Loading } from '@/components/common';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { shareLink } from '@/components/feed/PostActions';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { Sheet, useSheetDirty } from '@/components/social/Sheet';
import NotFound from '@/pages/not-found';
import { CaptionText } from '@/components/feed/CaptionText';

const SORTS = [
  { id: 'liked', label: 'Most liked' },
  { id: 'newest', label: 'Newest' },
  { id: 'following', label: 'Following' },
] as const;
type Sort = (typeof SORTS)[number]['id'];

/** "12 days 06 hours 41 mins" until a moment; refreshes every minute. */
function Countdown({ to, label }: { to: string; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  const parts: Array<[number, string]> = [[Math.floor(ms / 86400000), 'days'], [Math.floor(ms / 3600000) % 24, 'hours'], [Math.floor(ms / 60000) % 60, 'mins']];
  return (
    <div aria-label={`${label}: ${parts.map(([n, u]) => `${n} ${u}`).join(' ')}`}>
      <p className="eyebrow">{label}</p>
      <div className="mt-1 flex gap-3" aria-hidden="true">
        {parts.map(([n, unit]) => <span key={unit}><b className="font-display text-[30px] tracking-[-.04em]">{String(n).padStart(2, '0')}</b> <span className="text-sm text-subtle">{unit}</span></span>)}
      </div>
    </div>
  );
}

function EntryTile({ entry, onChanged }: { entry: ChallengeEntry; onChanged: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = entry.post;
  const cover = p.media[0];
  const act = async () => {
    setBusy(true);
    try { await deleteChallengeEntry(entry.entryId); onChanged(); } finally { setBusy(false); setConfirm(false); }
  };
  return (
    <div className="relative">
      <Link href={`/posts/${p.id}`} aria-label={`Entry by @${p.author.handle}${p.caption ? `: ${p.caption.slice(0, 80)}` : ''}`}
        className="relative block aspect-square overflow-hidden rounded-[22px] bg-line text-ink no-underline" style={cover?.color ? { backgroundColor: cover.color } : undefined}>
        {cover
          ? <img src={cover.thumbUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          : <span className="absolute inset-0 flex items-center bg-white p-4 font-display text-[clamp(14px,2vw,18px)] font-semibold leading-snug tracking-[-.03em]"><span className="line-clamp-5"><CaptionText text={p.caption} linked={false} /></span></span>}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-ink/70 to-transparent px-3 pb-2.5 pt-8 text-xs font-semibold text-white">
          <span className="min-w-0 flex-1 truncate">@{p.author.handle}</span>
          <span className="inline-flex items-center gap-1"><Heart size={13} aria-hidden="true" />{p.likeCount}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle size={13} aria-hidden="true" />{p.commentCount}</span>
        </span>
      </Link>
      {(entry.canRemove || entry.isMine) && (
        confirm
          ? <span className="absolute inset-x-2 top-2 flex items-center gap-1 rounded-full bg-white p-1 text-xs font-bold shadow-float">
              <button type="button" disabled={busy} onClick={act} className="min-h-[36px] flex-1 rounded-full bg-red px-2 text-white">{busy ? <Loader2 size={13} className="mx-auto animate-spin" /> : entry.isMine ? 'Withdraw' : 'Remove entry'}</button>
              <button type="button" onClick={() => setConfirm(false)} aria-label="Cancel" className="grid h-9 w-9 place-items-center rounded-full"><X size={14} /></button>
            </span>
          : <button type="button" onClick={() => setConfirm(true)} aria-label={entry.isMine ? 'Withdraw your entry' : `Remove entry by @${p.author.handle}`}
              className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Trash2 size={15} /></button>
      )}
    </div>
  );
}

function Entries({ challenge }: { challenge: Challenge }) {
  const { isSignedIn } = useAuth();
  const client = useQueryClient();
  const [sort, setSort] = useState<Sort>('liked');
  const key = [...FEED_KEYS.all, 'challenge', challenge.slug, sort] as const;
  const entries = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => getChallengeEntries(challenge.slug, { sort, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: [...FEED_KEYS.all, 'challenge', challenge.slug] });
    client.invalidateQueries({ queryKey: getGetChallengePageQueryKey(challenge.slug) });
  };
  const items = entries.data?.pages.flatMap(p => p.items) ?? [];
  return (
    <section aria-labelledby="entries-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="entries-title" className="font-display text-[26px] tracking-[-.04em]">Entries</h2>
        <div role="tablist" aria-label="Sort entries" className="flex gap-1 rounded-full bg-white p-1">
          {SORTS.filter(s => s.id !== 'following' || isSignedIn).map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} onClick={() => setSort(s.id)}
              className={`min-h-[40px] rounded-full px-3.5 text-sm font-bold ${sort === s.id ? 'bg-ink text-white' : 'text-ink'}`}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {entries.isLoading ? <div className="grid place-items-center py-12" role="status" aria-label="Loading entries"><Loader2 className="animate-spin" /></div>
          : entries.isError ? <ErrorState retry={() => entries.refetch()} />
          : !items.length
            ? <p className="rounded-[30px] bg-white px-6 py-10 text-center text-sm text-subtle">{sort === 'following' ? "Nobody you follow has entered yet." : 'No entries yet. Be the first!'}</p>
            : <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{items.map(e => <EntryTile key={e.entryId} entry={e} onChanged={refresh} />)}</div>}
        {entries.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => entries.fetchNextPage()} disabled={entries.isFetchingNextPage} className="btn btn-line">{entries.isFetchingNextPage && <Loader2 size={15} className="animate-spin" />}Load more</button>
          </div>
        )}
      </div>
      {challenge.isHost && <p className="mt-3 text-xs text-subtle">You host this challenge: use the bin on an entry to remove it. The entrant isn't told who removed it, and can't enter that post again.</p>}
    </section>
  );
}

function EditChallenge({ challenge, onDone }: { challenge: Challenge; onDone: () => void }) {
  const client = useQueryClient();
  const update = useUpdateChallenge();
  const [form, setForm] = useState({ title: challenge.title, description: challenge.description, rules: challenge.rules });
  useSheetDirty(form.title !== challenge.title || form.description !== challenge.description || form.rules !== challenge.rules);
  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); update.mutate({ slug: challenge.slug, data: form }, { onSuccess: () => { client.invalidateQueries(); onDone(); } }); }}>
      <h2 className="font-display text-2xl">Edit #{challenge.tag}</h2>
      <label className="block text-xs font-semibold">Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value.slice(0, 80) })} required className="field mt-1.5" /></label>
      <label className="block text-xs font-semibold">What to sew<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value.slice(0, 2000) })} rows={3} className="field mt-1.5 resize-y" /></label>
      <label className="block text-xs font-semibold">Rules <span className="font-normal text-subtle">(one per line)</span><textarea value={form.rules} onChange={e => setForm({ ...form, rules: e.target.value.slice(0, 2000) })} rows={4} className="field mt-1.5 resize-y" /></label>
      {update.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(update.error, "That didn't save.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={update.isPending} className="btn btn-primary flex-1">{update.isPending && <Loader2 size={15} className="animate-spin" />}Save</button>
      </div>
    </form>
  );
}

/** One challenge at /challenges/:slug. Works signed out. */
export function ChallengePage({ slug }: { slug: string }) {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const ask = useRequireSignIn();
  const page = useGetChallengePage(slug, { query: { retry: false } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { const c = page.data?.challenge; if (c) document.title = `#${c.tag}: ${c.title} · SewSpace`; }, [page.data]);

  if (page.isLoading) return <Loading />;
  if (!page.data) return <NotFound embedded />;
  const { challenge: c, memberPreview } = page.data;
  const rules = c.rules.split('\n').map(r => r.trim()).filter(Boolean);

  const toggleJoin = async () => {
    if (!ask({ title: `Sign in to join #${c.tag}`, body: "You'll come straight back here." })) return;
    setBusy(true);
    setError(null);
    try {
      await (c.joinedByMe ? leaveChallenge(c.slug) : joinChallenge(c.slug));
      await client.invalidateQueries({ queryKey: getGetChallengePageQueryKey(c.slug) });
    } catch (e) {
      setError(errorText(e, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };
  const enter = () => {
    if (!ask({ title: `Sign in to enter #${c.tag}`, body: "Share a make with the tag. You'll come straight back here." })) return;
    setLocation(`/new?challenge=${c.slug}`);
  };
  const share = async () => {
    if (await shareLink(window.location.href.split('#')[0], `#${c.tag} on SewSpace`)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="mx-auto max-w-[1232px] space-y-5">
      <section className="overflow-hidden rounded-[40px] bg-white">
        <div className="grid gap-6 px-5 pb-8 pt-6 sm:px-10 sm:pt-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ink px-3 py-1 font-display text-sm text-white">#{c.tag}</span>
              <StatusPill status={c.status} />
              <span className="text-sm text-subtle">{dateRange(c.startsAt, c.endsAt)}</span>
            </div>
            <h1 className="mt-3 font-display text-[clamp(32px,4.4vw,56px)] leading-[1.02] tracking-[-.05em]">{c.title}</h1>
            <p className="mt-2 text-sm">Started by <Link href={`/@${c.host.handle}`} className="font-bold">@{c.host.handle}</Link></p>
            {c.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-[16px] leading-relaxed">{c.description}</p>}
          </div>
          <div className="space-y-4">
            {c.status === 'active' && <Countdown to={c.endsAt} label="Ends in" />}
            {c.status === 'upcoming' && <Countdown to={c.startsAt} label="Starts in" />}
            <div className="flex flex-wrap gap-2.5">
              <span className="rounded-[20px] bg-yellow px-[18px] py-3"><b className="font-display text-xl">{c.entries}</b> <span className="text-sm">entries</span></span>
              <span className="inline-flex items-center gap-2 rounded-[20px] bg-canvas px-[18px] py-2.5">
                <span className="flex -space-x-2" aria-hidden="true">{memberPreview.slice(0, 4).map(m => <UserAvatar key={m.handle} name={m.name} avatarUrl={m.avatarUrl} size={28} className="ring-2 ring-canvas" />)}</span>
                <span className="text-sm"><b>{c.members}</b> {c.members === 1 ? 'sewist has' : 'sewists have'} joined</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4 sm:px-10">
          {c.status === 'active' && (
            <button type="button" onClick={enter} className="btn btn-primary"><Plus size={16} aria-hidden="true" />Enter a post</button>
          )}
          {c.status !== 'ended' && !c.isHost && (
            <button type="button" onClick={toggleJoin} disabled={busy} aria-pressed={c.joinedByMe} className={c.joinedByMe ? 'btn btn-line' : c.status === 'active' ? 'btn btn-line' : 'btn btn-primary'}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : c.joinedByMe ? <Check size={16} aria-hidden="true" /> : <Trophy size={16} aria-hidden="true" />}
              {c.joinedByMe ? 'Joined' : 'Join challenge'}
            </button>
          )}
          <button type="button" onClick={share} className="btn bg-ink text-white">{copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}{copied ? 'Link copied' : 'Share'}</button>
          {c.isHost
            ? <button type="button" onClick={() => setEditing(true)} className="btn btn-line"><Pencil size={15} aria-hidden="true" />Edit</button>
            : <span className="grid h-12 w-12 place-items-center rounded-full border border-ink"><SafetyMenu kind="challenge" targetId={c.slug} what="challenge" authorHandle={c.host.handle} label="More: report or block" leaveOnBlock="/challenges" /></span>}
          {error && <p role="alert" className="w-full text-sm font-semibold text-red-ink">{error}</p>}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Entries challenge={c} />
        <aside className="space-y-4">
          <section className="rounded-[30px] bg-white p-6" aria-labelledby="rules-title">
            <h2 id="rules-title" className="eyebrow">Rules</h2>
            {rules.length
              ? <ol className="mt-3 space-y-2.5">{rules.map((r, i) => <li key={i} className="flex gap-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-yellow text-xs font-bold">{i + 1}</span><span>{r}</span></li>)}</ol>
              : <p className="mt-3 text-sm text-subtle">No special rules. Keep it kind and on theme.</p>}
            <p className="mt-4 text-xs text-subtle">The host can remove entries that break these rules. Spotted a problem? Use Report on the entry.</p>
          </section>
          <section className="rounded-[30px] bg-white p-6" aria-labelledby="how-title">
            <h2 id="how-title" className="eyebrow">How to enter</h2>
            <p className="mt-3 text-sm leading-relaxed">Join the challenge, then share a public post: a finished make from your studio or something new. Entries show here, on your profile and in your followers' feeds.</p>
            {c.status === 'active' && <button type="button" onClick={enter} className="btn btn-primary mt-4 w-full"><Plus size={16} aria-hidden="true" />Enter a post</button>}
            {c.status === 'ended' && <p className="mt-3 text-sm font-semibold">This challenge has finished.</p>}
          </section>
        </aside>
      </div>
      {editing && <Sheet label="Edit challenge" onClose={() => setEditing(false)}><EditChallenge challenge={c} onDone={() => setEditing(false)} /></Sheet>}
    </div>
  );
}
