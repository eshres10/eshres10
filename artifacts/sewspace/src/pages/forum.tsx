import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listForumTopics, useGetForumOverview, type ForumBoard, type ForumTopicSummary, type ListForumTopicsFilter, type ListForumTopicsSort } from '@workspace/api-client-react';
import { Loader2, MessagesSquare, Plus, Search, X } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { ErrorState } from '@/components/common';
import { BOARDS, KINDS, KindBadge, StateBadges } from '@/components/forum/parts';
import { timeAgo } from '@/lib/time';
import { CommunityTabs } from '@/components/shell/CommunityTabs';

const SORTS: Array<{ id: ListForumTopicsSort; label: string }> = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'New' },
  { id: 'unanswered', label: 'Unanswered' },
];

/** One line about each board and its colour dot (the website design). */
const BOARD_INFO: Record<ForumBoard, { desc: string; dot: string }> = {
  fitting: { desc: 'FBAs, swaybacks, gaping, pooling, all of it.', dot: 'bg-blue' },
  fabric: { desc: 'Fibres, pre-washing, layouts, where to buy.', dot: 'bg-peach' },
  machines: { desc: 'Tension woes, feet, overlockers, needles.', dot: 'bg-ink' },
  patterns: { desc: 'Mods, mash-ups and self-drafting.', dot: 'bg-yellow ring-1 ring-ink' },
  beginners: { desc: 'No question too small. Really.', dot: 'bg-red' },
  mending: { desc: 'Visible mending, refashions, scrap projects.', dot: 'bg-blue-ink' },
  meetups: { desc: 'Sew-ins, swaps and fabric fairs near you.', dot: 'bg-mark' },
};

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** A topic as a table row: badges, title, board · author · tags, then votes, replies and last activity. */
function TopicRow({ topic: t }: { topic: ForumTopicSummary }) {
  return (
    <li className={`grid items-center gap-x-4 gap-y-1 rounded-[18px] px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_90px_90px_80px] ${t.pinned ? 'bg-yellow/20' : 'border-t border-line first:border-0'}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={t.kind} /><StateBadges topic={t} />
          <Link href={`/forum/topics/${t.id}`} className="ml-0.5 text-[16px] font-semibold text-ink no-underline hover:underline">{t.title}</Link>
        </p>
        <p className="mt-1 truncate text-[13px] text-subtle">
          {BOARDS[t.board]} · @{t.author.handle}
          {t.tags.length > 0 && <> {t.tags.map(tag => <span key={tag} className="font-semibold text-blue-ink"> #{tag}</span>)}</>}
        </p>
        <p className="mt-1 text-[13px] text-subtle md:hidden">{t.votes} {t.votes === 1 ? 'vote' : 'votes'} · {t.replies} {t.replies === 1 ? 'reply' : 'replies'} · {timeAgo(t.lastActivityAt)}</p>
      </div>
      <p className="hidden text-center text-[17px] font-bold md:block"><span className="sr-only">Votes: </span>{compact.format(t.votes)}</p>
      <p className="hidden text-center text-[17px] font-bold md:block"><span className="sr-only">Replies: </span>{compact.format(t.replies)}</p>
      <p className="hidden text-right text-[13px] text-subtle md:block"><span className="sr-only">Last activity: </span>{timeAgo(t.lastActivityAt)}</p>
    </li>
  );
}

/** The forum: boards, filters with counts, Hot/New/Unanswered, search. Works signed out. */
export function ForumPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const filter = (params.get('filter') ?? 'all') as ListForumTopicsFilter;
  const board = (params.get('board') || undefined) as ForumBoard | undefined;
  const sort = (params.get('sort') ?? 'hot') as ListForumTopicsSort;
  const tag = params.get('tag') || undefined;
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const ask = useRequireSignIn();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { document.title = 'Forum · Seams Club'; }, []);

  const go = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (p.get('filter') === 'all') p.delete('filter');
    if (p.get('sort') === 'hot') p.delete('sort');
    setLocation(`/forum${p.toString() ? `?${p}` : ''}`, { replace: true });
  };

  const overview = useGetForumOverview();
  const topics = useInfiniteQuery({
    queryKey: ['/api/public/forum/topics', { filter, board, sort, tag, q: debounced }],
    queryFn: ({ pageParam }) => listForumTopics({ filter, sort, ...(board ? { board } : {}), ...(tag ? { tag } : {}), ...(debounced.trim() ? { q: debounced.trim() } : {}), ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  const items = topics.data?.pages.flatMap(p => p.items) ?? [];
  const o = overview.data;
  const chips: Array<{ id: ListForumTopicsFilter; label: string; count?: number }> = [
    { id: 'all', label: 'All', count: o?.total },
    ...o?.kinds.map(k => ({ id: k.kind as ListForumTopicsFilter, label: KINDS[k.kind].plural, count: k.count })) ?? [],
    { id: 'solved', label: 'Solved', count: o?.solved },
  ];
  const start = () => {
    if (!ask({ title: 'Sign in to start a discussion', body: "You'll come straight back to the forum." })) return;
    const p = new URLSearchParams();
    if (board) p.set('board', board);
    if (filter !== 'all' && filter !== 'solved') p.set('kind', filter);
    setLocation(`/forum/new${p.size ? `?${p}` : ''}`);
  };

  return (
    <div className="mx-auto max-w-[1232px]">
      <CommunityTabs />
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,570px)] lg:items-end">
        <div>
          <p className="eyebrow eyebrow-red">The forum</p>
          <h1 className="mt-2 font-display text-[clamp(40px,5.4vw,68px)] leading-[.95] tracking-[-.06em]">Ask anything.<br />Someone's sewn it.</h1>
          {o && <p className="mt-3 text-[17px] text-subtle">{o.total.toLocaleString()} {o.total === 1 ? 'discussion' : 'discussions'} · {o.solved.toLocaleString()} solved {o.solved === 1 ? 'question' : 'questions'}</p>}
        </div>
        <div className="space-y-3 lg:pb-1">
          <label className="relative block">
            <span className="sr-only">Search the forum</span>
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink" aria-hidden="true" />
            <input type="search" value={q} onChange={e => { setQ(e.target.value); go({ q: e.target.value || undefined }); }}
              className="min-h-[54px] w-full rounded-full border-2 border-ink bg-white pl-12 pr-5 text-[16px] outline-none focus:ring-4 focus:ring-yellow" placeholder={'Search before you ask: “gaping neckline”'} />
          </label>
          <button type="button" onClick={start} className="inline-flex min-h-[50px] items-center gap-2 rounded-full bg-yellow px-6 text-[16px] font-bold text-ink">
            <Plus size={17} aria-hidden="true" />Start a discussion
          </button>
        </div>
      </section>

      <section aria-label="Boards" className="-mx-3 mt-6 flex snap-x gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {(Object.keys(BOARDS) as ForumBoard[]).map(b => {
          const info = o?.boards.find(x => x.board === b);
          const on = board === b;
          return (
            <div key={b} className={`flex w-[260px] shrink-0 snap-start flex-col rounded-[24px] bg-white p-5 sm:w-auto ${on ? 'outline outline-2 outline-ink' : ''}`}>
              <button type="button" onClick={() => go({ board: on ? undefined : b })} aria-pressed={on} className="flex items-center gap-2.5 text-left">
                <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full ${BOARD_INFO[b].dot}`} />
                <span className="flex-1 text-[17px] font-semibold">{BOARDS[b]}</span>
                <span className="text-xs text-subtle">{info ? compact.format(info.count) : ''}</span>
              </button>
              <p className="mt-1.5 text-sm text-subtle">{BOARD_INFO[b].desc}</p>
              {info?.latest && (
                <p className="mt-auto border-t border-line pt-3 text-sm [margin-top:max(.75rem,auto)]">
                  <span className="text-subtle">Latest: </span><Link href={`/forum/topics/${info.latest.id}`} className="font-semibold text-ink no-underline hover:underline">{info.latest.title}</Link>
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="all-title" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="all-title" className="font-display text-[30px] tracking-[-.05em] sm:text-[34px]">{board ? BOARDS[board] : 'All discussions'}</h2>
          <div role="tablist" aria-label="Sort" className="flex gap-1 rounded-full bg-white p-1">
            {SORTS.map(s => (
              <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} onClick={() => go({ sort: s.id })}
                className={`min-h-[40px] rounded-full px-4 text-sm font-bold ${sort === s.id ? 'bg-ink text-white' : 'text-ink'}`}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter">
          {tag && (
            <button type="button" onClick={() => go({ tag: undefined })} aria-label={`Remove the #${tag} filter`}
              className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full bg-blue px-4 text-sm font-semibold text-white">#{tag}<X size={14} aria-hidden="true" /></button>
          )}
          {chips.map(c => (
            <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => go({ filter: c.id })}
              className={`inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${filter === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>
              {c.label}{c.count !== undefined && <span className={filter === c.id ? 'text-white/70' : 'text-subtle'}>{c.count}</span>}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-[30px] bg-white p-2 sm:p-3">
          {topics.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
            : topics.isError ? <ErrorState retry={() => topics.refetch()} />
            : !items.length
              ? (
                <div className="grid place-items-center px-6 py-14 text-center">
                  <MessagesSquare size={28} aria-hidden="true" />
                  <p className="mt-3 font-display text-xl">{debounced ? 'Nothing matches that search' : 'Nothing here yet'}</p>
                  <p className="mt-1 text-sm text-subtle">Be the first to start one.</p>
                </div>
              )
              : <>
                  <p aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_90px_90px_80px] gap-x-4 px-4 pb-2 pt-1 text-[13px] font-semibold text-subtle md:grid"><span>Topic</span><span className="text-center">Votes</span><span className="text-center">Replies</span><span className="text-right">Activity</span></p>
                  <ul className="space-y-0.5">{items.map(t => <TopicRow key={t.id} topic={t} />)}</ul>
                </>}
        </div>
        {topics.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => topics.fetchNextPage()} disabled={topics.isFetchingNextPage} className="btn btn-line">{topics.isFetchingNextPage && <Loader2 size={15} className="animate-spin" />}Load more</button>
          </div>
        )}
      </section>
    </div>
  );
}
