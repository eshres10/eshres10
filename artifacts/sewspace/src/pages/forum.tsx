import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listForumTopics, useGetForumHelpers, useGetForumOverview, type ForumBoard, type ListForumTopicsFilter, type ListForumTopicsSort } from '@workspace/api-client-react';
import { Loader2, MessagesSquare, Plus, Search } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { ErrorState } from '@/components/common';
import { Composer } from '@/components/forum/Composer';
import { BOARDS, KINDS, TopicCard } from '@/components/forum/parts';
import { Sheet } from '@/components/social/Sheet';

const SORTS: Array<{ id: ListForumTopicsSort; label: string }> = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'New' },
  { id: 'unanswered', label: 'Unanswered' },
];

/** The forum: filters with counts, Hot/New/Unanswered, search, boards. Works signed out. */
export function ForumPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const filter = (params.get('filter') ?? 'all') as ListForumTopicsFilter;
  const board = (params.get('board') || undefined) as ForumBoard | undefined;
  const sort = (params.get('sort') ?? 'hot') as ListForumTopicsSort;
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [composing, setComposing] = useState(false);
  const ask = useRequireSignIn();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { document.title = 'Forum · SewSpace'; }, []);

  const go = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (p.get('filter') === 'all') p.delete('filter');
    if (p.get('sort') === 'hot') p.delete('sort');
    setLocation(`/forum${p.toString() ? `?${p}` : ''}`, { replace: true });
  };

  const overview = useGetForumOverview();
  const helpers = useGetForumHelpers();
  const topics = useInfiniteQuery({
    queryKey: ['/api/public/forum/topics', { filter, board, sort, q: debounced }],
    queryFn: ({ pageParam }) => listForumTopics({ filter, sort, ...(board ? { board } : {}), ...(debounced.trim() ? { q: debounced.trim() } : {}), ...(pageParam ? { cursor: pageParam } : {}) }),
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

  return (
    <div className="mx-auto max-w-[1232px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Forum{board && ` · ${BOARDS[board]}`}</p>
          <h1 className="mt-1 font-display text-[34px] leading-tight tracking-[-.05em]">Ask, share, help</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { if (ask({ title: 'Sign in to start a discussion', body: "You'll come straight back to the forum." })) setComposing(true); }}>
          <Plus size={16} aria-hidden="true" />Start a discussion
        </button>
      </div>

      <label className="relative mt-4 block max-w-xl">
        <span className="sr-only">Search the forum</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input type="search" value={q} onChange={e => { setQ(e.target.value); go({ q: e.target.value || undefined }); }} className="field min-h-[48px] pl-9" placeholder="Search the forum" />
      </label>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter">
        {chips.map(c => (
          <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => go({ filter: c.id })}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${filter === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>
            {c.label}{c.count !== undefined && <span className={filter === c.id ? 'text-white/70' : 'text-subtle'}>{c.count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section aria-label="Topics">
          <div role="tablist" aria-label="Sort" className="mb-3 flex w-fit gap-1 rounded-full bg-white p-1">
            {SORTS.map(s => (
              <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} onClick={() => go({ sort: s.id })}
                className={`min-h-[40px] rounded-full px-4 text-sm font-bold ${sort === s.id ? 'bg-ink text-white' : 'text-ink'}`}>{s.label}</button>
            ))}
          </div>
          {topics.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
            : topics.isError ? <ErrorState retry={() => topics.refetch()} />
            : !items.length
              ? (
                <div className="grid place-items-center rounded-[30px] bg-white px-6 py-14 text-center">
                  <MessagesSquare size={28} aria-hidden="true" />
                  <p className="mt-3 font-display text-xl">{debounced ? 'Nothing matches that search' : 'Nothing here yet'}</p>
                  <p className="mt-1 text-sm text-subtle">Be the first to start one.</p>
                </div>
              )
              : <div className="space-y-3">{items.map(t => <TopicCard key={t.id} topic={t} />)}</div>}
          {topics.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => topics.fetchNextPage()} disabled={topics.isFetchingNextPage} className="btn btn-line">{topics.isFetchingNextPage && <Loader2 size={15} className="animate-spin" />}Load more</button>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[30px] bg-white p-5" aria-labelledby="boards-title">
            <h2 id="boards-title" className="eyebrow">Boards</h2>
            <ul className="mt-2">
              <li><button type="button" onClick={() => go({ board: undefined })} aria-pressed={!board} className={`flex min-h-[44px] w-full items-center justify-between rounded-[14px] px-2 text-left text-sm font-semibold ${!board ? 'bg-canvas' : ''}`}>All boards<span className="text-subtle">{o?.total ?? ''}</span></button></li>
              {(Object.keys(BOARDS) as ForumBoard[]).map(b => (
                <li key={b}><button type="button" onClick={() => go({ board: b })} aria-pressed={board === b} className={`flex min-h-[44px] w-full items-center justify-between rounded-[14px] px-2 text-left text-sm font-semibold ${board === b ? 'bg-canvas' : ''}`}>
                  {BOARDS[b]}<span className="text-subtle">{o?.boards.find(x => x.board === b)?.count ?? ''}</span>
                </button></li>
              ))}
            </ul>
          </section>
          <section className="rounded-[30px] bg-white p-5" aria-labelledby="tips-title">
            <h2 id="tips-title" className="eyebrow">Asking a good question</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Say the fabric, pattern and size.</li>
              <li>Add a photo of the problem area (share it as Show &amp; tell, or link your make).</li>
              <li>Mark the answer that worked so others find it.</li>
            </ul>
          </section>
          {helpers.data && helpers.data.length > 0 && (
            <section className="rounded-[30px] bg-white p-5" aria-labelledby="helpers-title">
              <h2 id="helpers-title" className="eyebrow">Top helpers this month</h2>
              <ul className="mt-3 space-y-2.5">
                {helpers.data.map(h => (
                  <li key={h.person.handle} className="flex items-center gap-3 text-sm">
                    <UserAvatar name={h.person.name} avatarUrl={h.person.avatarUrl} size={34} />
                    <span className="min-w-0 flex-1"><Link href={`/@${h.person.handle}`} className="block truncate font-bold text-ink">{h.person.handle}</Link><span className="text-xs text-subtle">{h.accepted} accepted answer{h.accepted === 1 ? '' : 's'}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {composing && (
        <Sheet label="Start a discussion" onClose={() => setComposing(false)}>
          <Composer initialBoard={board} initialKind={filter !== 'all' && filter !== 'solved' ? filter : 'question'} onCancel={() => setComposing(false)} onCreated={t => { setComposing(false); setLocation(`/forum/topics/${t.id}`); }} />
        </Sheet>
      )}
    </div>
  );
}
