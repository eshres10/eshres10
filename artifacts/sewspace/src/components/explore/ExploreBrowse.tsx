import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getExploreCards, type ExploreCard, type GetExploreCardsTab } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { ErrorState } from '@/components/common';
import { GuestBanner } from '@/pages/explore';
import { useChrome } from '@/components/shell/useHideOnScroll';
import { ExploreActionCard, ExploreActionsProvider, ExplorePostOverlay } from './actions';
import { overlaySearch } from './overlay';
import { cardHeight } from './cards';

// Explore (owner: one page, named Explore): makes, fabric, pattern pages,
// challenges and forum threads in one masonry grid. Tab and filter live in the
// URL (?tab=&sub=), replaced as you switch so Back leaves the page.

type Tab = GetExploreCardsTab;
const GARMENTS = [
  { id: 'for-you', label: 'For you' }, { id: 'dresses', label: 'Dresses' }, { id: 'tops', label: 'Tops' }, { id: 'bottoms', label: 'Bottoms' },
  { id: 'outerwear', label: 'Outerwear' }, { id: 'bags', label: 'Bags' }, { id: 'upcycle', label: 'Upcycle' },
];
const TABS: Array<{ id: Tab; label: string; subs: Array<{ id: string; label: string }>; noun: [string, string] }> = [
  { id: 'explore', label: 'Explore', subs: [...GARMENTS, { id: 'words', label: 'Words' }], noun: ['idea', 'ideas'] },
  { id: 'forum', label: 'Forum', noun: ['thread', 'threads'], subs: [
    { id: 'all', label: 'All' }, { id: 'fitting', label: 'Fitting' }, { id: 'pattern-help', label: 'Pattern help' },
    { id: 'fabric', label: 'Fabric' }, { id: 'machines', label: 'Machines' }, { id: 'show-tell', label: 'Show & tell' },
  ] },
  { id: 'challenges', label: 'Challenges', noun: ['challenge', 'challenges'], subs: [
    { id: 'all', label: 'All' }, { id: 'running', label: 'Running now' }, { id: 'soon', label: 'Starting soon' }, { id: 'finished', label: 'Finished' },
  ] },
  { id: 'patterns', label: 'Patterns', subs: GARMENTS, noun: ['pattern', 'patterns'] },
  { id: 'fabric', label: 'Fabric', noun: ['idea', 'ideas'], subs: [
    { id: 'all', label: 'All fabric' }, { id: 'linen', label: 'Linen' }, { id: 'cotton', label: 'Cotton' }, { id: 'satin', label: 'Satin' },
    { id: 'viscose', label: 'Viscose' }, { id: 'crepe', label: 'Crepe' }, { id: 'hauls', label: 'Hauls' },
  ] },
];
const SHARES_GARMENTS = new Set<Tab>(['explore', 'patterns']);

/**
 * Where the filters stick: just under the top bar, and up to the very top
 * when the bar slides away (same 280 ms, instant with reduced motion).
 * Signed in: the phone header is 4rem; the desktop bar sits at 18 px and is
 * 64 px tall. Signed out: the phone header is 63 px; on desktop the website
 * header scrolls with the page, so the filters stick to the top.
 */
const STICKY = {
  app: { base: 'top-[calc(4rem+env(safe-area-inset-top))] md:top-[94px]', hidden: '-translate-y-[4rem] md:-translate-y-[76px]' },
  public: { base: 'top-[calc(63px+env(safe-area-inset-top))] md:top-0', hidden: '-translate-y-[63px] md:translate-y-0' },
} as const;

/** 2 columns on phones, 5 beside the sidebar on desktop (by the grid's own width). */
function useColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [cols, setCols] = useState(2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pick = (w: number) => setCols(w < 560 ? 2 : w < 760 ? 3 : w < 960 ? 4 : 5);
    pick(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => pick(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

/**
 * Each card goes into the shortest column, in order. Cards already placed
 * keep their column when more load (the same cards always land the same way).
 */
export function placeInColumns(cards: ExploreCard[], columns: number): ExploreCard[][] {
  const out: ExploreCard[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  for (const card of cards) {
    const k = heights.indexOf(Math.min(...heights));
    out[k].push(card);
    heights[k] += cardHeight(card);
  }
  return out;
}

/** `postId`: a post is open over the page (/posts/:id, see overlay.ts); the filters come from the history entry. */
export function ExploreBrowsePage({ postId }: { postId?: number } = {}) {
  const { isLoaded, isSignedIn } = useAuth();
  const chrome = useChrome();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(postId ? overlaySearch() : search);
  const tab = TABS.find(t => t.id === params.get('tab')) ?? TABS[0];
  const sub = tab.subs.find(s => s.id === params.get('sub')) ?? tab.subs[0];
  useEffect(() => { if (!postId) document.title = 'Explore · Seams Club'; }, [postId]);

  const go = (nextTab: Tab, nextSub?: string) => {
    const q = new URLSearchParams();
    if (nextTab !== 'explore') q.set('tab', nextTab);
    if (nextSub && nextSub !== TABS.find(t => t.id === nextTab)!.subs[0].id) q.set('sub', nextSub);
    setLocation(`/explore${q.size ? `?${q}` : ''}`, { replace: true });
    window.scrollTo({ top: 0 });
  };
  // Explore and Patterns share the garment filters: switching between them keeps the one chosen.
  const pickTab = (next: Tab) => go(next, SHARES_GARMENTS.has(next) && SHARES_GARMENTS.has(tab.id) ? sub.id : undefined);

  const feed = useInfiniteQuery({
    queryKey: ['explore-cards', tab.id, sub.id, Boolean(isSignedIn)],
    queryFn: ({ pageParam }) => getExploreCards({ tab: tab.id, sub: sub.id, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: isLoaded,
  });
  const cards = useMemo(() => feed.data?.pages.flatMap(p => p.items) ?? [], [feed.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const loadMore = useCallback(() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const total = feed.data?.pages[0]?.total;

  const grid = useRef<HTMLDivElement>(null);
  const columns = useColumns(grid);
  const placed = useMemo(() => placeInColumns(cards, columns), [cards, columns]);

  // Infinite scroll: load the next page well before the end.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  // Pinned (the 1 px marker above the filters has scrolled under the bar): square corners, so nothing shows past them.
  const marker = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = marker.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 200), { rootMargin: '-100px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const countText = total === undefined ? '' : `${total.toLocaleString()} ${total === 1 ? tab.noun[0] : tab.noun[1]}`;
  return (
    <ExploreActionsProvider>
      <div className="mx-auto w-full max-w-[1400px]">
        {isLoaded && !isSignedIn && <GuestBanner />}
        <div className="md:rounded-[30px] md:bg-white md:p-5">
          <div ref={marker} aria-hidden="true" className="h-px" />
          <div className={`explore-sticky sticky z-30 -mx-4 bg-canvas px-4 pb-3 transition-transform duration-[280ms] ease-out motion-reduce:transition-none md:-mx-5 md:-mt-5 md:bg-white md:px-5 md:pt-5 ${pinned ? '' : 'md:rounded-t-[30px]'} ${STICKY[chrome.shell].base} ${chrome.hidden ? `${STICKY[chrome.shell].hidden} shadow-[0_8px_18px_-10px_rgb(0_0_0/0.18)]` : 'translate-y-0'}`}>
          <div role="group" aria-label="Show" className="-mx-4 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-line px-4 md:hidden">
            {TABS.map(t => {
              const on = t.id === tab.id;
              return (
                <button key={t.id} type="button" aria-pressed={on} onClick={() => pickTab(t.id)}
                  className={`min-h-[44px] shrink-0 px-3 text-[15px] ${on ? 'font-bold shadow-[inset_0_-3px_0_var(--color-ink)]' : 'font-semibold text-subtle'}`}>
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 md:mt-0">
            <div role="group" aria-label={`Filter ${tab.label}`} className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 md:mx-0 md:flex-wrap md:px-0">
              {tab.subs.map(s => {
                const on = s.id === sub.id;
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => go(tab.id, s.id)}
                    className={`min-h-[44px] shrink-0 rounded-full border px-4 text-[14px] font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink'}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p role="status" className="hidden shrink-0 text-sm font-semibold text-subtle md:block">{countText}</p>
          </div>
          <p role="status" className="sr-only md:hidden">{countText}</p>
          </div>

          <div ref={grid} className="mt-1">
            {feed.isLoading || !isLoaded ? (
              <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" aria-hidden="true" /></div>
            ) : feed.isError ? (
              <ErrorState retry={() => feed.refetch()} />
            ) : !cards.length ? (
              <div className="rounded-[24px] bg-white px-6 py-14 text-center text-sm text-subtle md:bg-canvas">
                {tab.id === 'explore' && sub.id === 'upcycle' ? 'Nothing yet. Tag a post #upcycle, #refashion or #thrifted and it shows here.'
                  : tab.id === 'explore' && sub.id === 'words' ? 'No words posts yet. Write a status and it shows here.'
                : tab.id === 'patterns' && sub.id === 'upcycle' ? 'Patterns aren’t sorted for upcycling yet. Try another filter.'
                  : 'Nothing here yet.'}
              </div>
            ) : (
              <div className="flex items-start gap-2.5 md:gap-3.5" aria-label={`${tab.label}: ${sub.label}`} role="region">
                {placed.map((column, c) => (
                  <div key={c} className="flex min-w-0 flex-1 flex-col gap-3.5 md:gap-4">
                    {column.map(card => <ExploreActionCard key={card.key} card={card} index={cards.indexOf(card)} />)}
                  </div>
                ))}
              </div>
            )}
            <div ref={sentinel} aria-hidden="true" />
            {feed.isFetchingNextPage && <div className="grid place-items-center py-6" role="status" aria-label="Loading more"><Loader2 className="animate-spin" aria-hidden="true" /></div>}
          </div>
        </div>
      </div>
      {postId !== undefined && <ExplorePostOverlay postId={postId} cards={cards} hasMore={Boolean(feed.hasNextPage)} loadMore={loadMore} />}
    </ExploreActionsProvider>
  );
}
