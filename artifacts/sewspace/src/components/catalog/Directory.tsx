import { useEffect, useId, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { listCatalog, saveCatalogEntry, unsaveCatalogEntry, type CatalogEntry, type CatalogList, type ListCatalogParams, type ListCatalogSort } from '@workspace/api-client-react';
import { Heart, Loader2, Plus, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { Garment } from '@/components/brand/Garment';
import { capitalise, catalogPath, PATTERN_CATEGORIES } from '@/components/catalog/parts';
import { ErrorState } from '@/components/common';
import { Sheet } from '@/components/social/Sheet';
import { formatPrice } from '@/lib/currency';

// The pattern directory at /catalog (docs/design/patterns, d1–d3, m1–m2).
// Filters, search and sort live in the URL, so results can be shared and Back
// works. Makes and covers come from public makes only (the API decides).

const MAIN_CATEGORIES = ['dresses', 'tops', 'skirts', 'trousers', 'outerwear', 'knitwear', 'bags'] as const;
const CATEGORY_LABEL: Record<string, string> = { knitwear: 'Knits' };
const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? capitalise(c);
const ART: Record<string, string> = { dresses: 'Dresses', tops: 'Tops', skirts: 'Skirts', trousers: 'Trousers', outerwear: 'Outerwear', knitwear: 'Knits', bags: 'Bags', jumpsuits: 'Dresses' };
const TONES = ['bg-blue-soft', 'bg-peach-soft', 'bg-mist'];

const DIFFICULTIES = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']] as const;
// "On Seams Club" joins once pattern sales open.
const SOURCES = [['free', 'Free'], ['designer', "Designer's site"]] as const;
const SORTS: Array<[ListCatalogSort, string]> = [['made', 'Most made'], ['rating', 'Top rated'], ['new', 'New']];

type Filters = { q: string; category: string; difficulty: string[]; source: string[]; rated: boolean; sort: ListCatalogSort };

function useFilters(): [Filters, (next: Partial<Filters>) => void] {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const split = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
  const sort = params.get('sort');
  const filters: Filters = {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    difficulty: split(params.get('difficulty')),
    source: split(params.get('source')),
    rated: params.get('rated') === '1',
    sort: sort === 'rating' || sort === 'new' ? sort : 'made',
  };
  const set = (next: Partial<Filters>) => {
    const f = { ...filters, ...next };
    const p = new URLSearchParams();
    if (f.q.trim()) p.set('q', f.q);
    if (f.category) p.set('category', f.category);
    if (f.difficulty.length) p.set('difficulty', f.difficulty.join(','));
    if (f.source.length) p.set('source', f.source.join(','));
    if (f.rated) p.set('rated', '1');
    if (f.sort !== 'made') p.set('sort', f.sort);
    // Typing replaces the history entry; choosing a filter adds one, so Back undoes it.
    setLocation(`/catalog${p.size ? `?${p}` : ''}`, { replace: next.q !== undefined });
  };
  return [filters, set];
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

function PricePill({ entry }: { entry: CatalogEntry }) {
  if (entry.source === 'free') return <span className="rounded-full bg-blue px-2.5 py-0.5 text-[13px] font-bold text-white">Free</span>;
  if (entry.priceCents === null || !entry.currency) return null;
  const price = formatPrice(entry.priceCents, entry.currency);
  return entry.source === 'seams_club'
    ? <span className="rounded-full bg-yellow px-2.5 py-0.5 text-[13px] font-bold">{price}</span>
    : <span className="rounded-full border border-ink px-2.5 py-0.5 text-[13px] font-bold" title={`On the designer's site, ${entry.currency}`}>{price}<span className="sr-only"> {entry.currency} on the designer's site</span></span>;
}

/** The save heart: private to you; signed out, it asks you to sign in first. */
export function SaveHeart({ entry, className = '' }: { entry: CatalogEntry; className?: string }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [saved, setSaved] = useState(entry.savedByMe);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(entry.savedByMe), [entry.savedByMe]);
  const flip = async () => {
    if (!ask({ title: 'Sign in to save patterns', body: "Saved patterns are private to you. You'll come straight back here." })) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      await (next ? saveCatalogEntry(entry.id) : unsaveCatalogEntry(entry.id));
      client.invalidateQueries({ queryKey: ['/api/public/catalog'] });
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={flip} disabled={busy} aria-pressed={saved} aria-label={saved ? `Saved: ${entry.name}` : `Save ${entry.name}`}
      className={`grid h-11 w-11 place-items-center rounded-full bg-white text-ink ${className}`}>
      <Heart size={19} aria-hidden="true" className={saved ? 'fill-red text-red' : ''} />
    </button>
  );
}

export function PatternCard({ entry, index = 0 }: { entry: CatalogEntry; index?: number }) {
  const s = entry.stats;
  return (
    <article className="relative flex flex-col overflow-hidden rounded-[24px] bg-white">
      <Link href={catalogPath(entry)} className="block text-ink no-underline">
        {entry.coverImageUrl
          ? <img src={entry.coverImageUrl} alt="" loading="lazy" className="aspect-[4/5] w-full bg-line object-cover" />
          : <Garment name={ART[entry.category] ?? 'Tops'} tone={TONES[index % TONES.length]} className="aspect-[4/5] w-full" />}
        <span className="block px-3.5 pb-3.5 pt-3 sm:px-4">
          <span className="block truncate text-[15px] font-bold sm:text-[17px]">{entry.name}</span>
          {entry.maker && <span className="block truncate text-[13px] text-subtle sm:text-sm">{entry.maker}</span>}
          <span className="mt-2 flex items-center gap-2 text-[13px] sm:text-sm">
            {s.rating !== null && <span className="inline-flex items-center gap-1 font-bold"><Star size={13} aria-hidden="true" className="fill-ink" />{s.rating.toFixed(1)}<span className="sr-only"> out of 5</span></span>}
            {/* Phones beside a rating: "★ 4.6 · 214", as the design; the word is still read out. */}
            <span className="min-w-0 flex-1 truncate text-subtle">{s.rating !== null && <span aria-hidden="true" className="sm:hidden">· </span>}{s.makes}<span className={s.rating !== null ? 'sr-only sm:not-sr-only' : ''}> {s.makes === 1 ? 'make' : 'makes'}</span></span>
            <PricePill entry={entry} />
          </span>
        </span>
      </Link>
      <span className="pointer-events-none absolute left-2.5 right-14 top-3 flex flex-wrap gap-1 sm:left-3">
        {entry.difficulty && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold">{capitalise(entry.difficulty)}</span>}
        {entry.isNew && <span className="rounded-full bg-red px-2.5 py-0.5 text-xs font-bold text-white">New</span>}
      </span>
      <SaveHeart entry={entry} className="absolute right-2.5 top-2.5" />
    </article>
  );
}

function CheckRow({ label, count, checked, onChange, chip = false }: { label: string; count: number; checked: boolean; onChange: () => void; chip?: boolean }) {
  return (
    <label className={`flex min-h-[44px] cursor-pointer items-center gap-3 text-[15px] ${chip ? 'rounded-full border-2 border-line px-3.5' : ''} ${count === 0 && !checked ? 'text-subtle' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-5 w-5 shrink-0 accent-ink" />
      <span className={chip ? '' : 'flex-1'}>{label}</span>
      <span className="text-[13px] text-subtle">{count}</span>
    </label>
  );
}

function RatedSwitch({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 text-[15px] font-semibold">
      Rated 4.5 and up
      <input type="checkbox" role="switch" checked={on} onChange={e => set(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative h-8 w-14 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink motion-reduce:transition-none">
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all motion-reduce:transition-none ${on ? 'left-7' : 'left-1'}`} />
      </span>
    </label>
  );
}

function FilterGroups({ f, set, facets, chips = false }: { f: Filters; set: (next: Partial<Filters>) => void; facets?: CatalogList['facets']; chips?: boolean }) {
  return (
    <>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-subtle">Difficulty</legend>
        <div className={chips ? 'flex flex-wrap gap-2' : ''}>
          {DIFFICULTIES.map(([id, label]) => <CheckRow key={id} chip={chips} label={label} count={facets?.difficulty[id] ?? 0} checked={f.difficulty.includes(id)} onChange={() => set({ difficulty: toggle(f.difficulty, id) })} />)}
        </div>
      </fieldset>
      <fieldset className={chips ? 'mt-5' : 'mt-4 border-t border-line pt-4'}>
        <legend className={`mb-1 text-sm font-semibold text-subtle ${chips ? '' : 'float-left w-full'}`}>Where to get it</legend>
        <div className={chips ? 'flex flex-wrap gap-2' : 'clear-left'}>
          {SOURCES.map(([id, label]) => <CheckRow key={id} chip={chips} label={label} count={facets?.source[id] ?? 0} checked={f.source.includes(id)} onChange={() => set({ source: toggle(f.source, id) })} />)}
        </div>
      </fieldset>
      <div className={chips ? 'mt-4' : 'mt-4 border-t border-line pt-3'}><RatedSwitch on={f.rated} set={rated => set({ rated })} /></div>
    </>
  );
}

function SortControl({ f, set, wide = false }: { f: Filters; set: (next: Partial<Filters>) => void; wide?: boolean }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label="Sort by" className={`flex gap-1 rounded-full p-1 ${wide ? 'bg-canvas' : 'bg-white'}`}>
      {SORTS.map(([id, label]) => (
        <label key={id} className={`flex min-h-[44px] cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-3 text-[15px] font-bold sm:px-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${wide ? 'flex-1' : ''} ${f.sort === id ? 'bg-ink text-white' : 'text-ink'}`}>
          <input type="radio" name={name} value={id} checked={f.sort === id} onChange={() => set({ sort: id })} className="sr-only" />{label}
        </label>
      ))}
    </div>
  );
}

/** The pattern directory: search, category pills, filters (panel on desktop, sheet on phones), sort, 24 at a time. */
export function PatternDirectory({ onAdd }: { onAdd: () => void }) {
  const { isSignedIn } = useAuth();
  const [f, set] = useFilters();
  const [q, setQ] = useState(f.q);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { const t = setTimeout(() => { if (q !== f.q) set({ q }); }, 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const params: ListCatalogParams = {
    kind: 'pattern', sort: f.sort,
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.difficulty.length ? { difficulty: f.difficulty.join(',') } : {}),
    ...(f.source.length ? { source: f.source.join(',') } : {}),
    ...(f.rated ? { minRating: 4.5 } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: ['/api/public/catalog', params],
    queryFn: ({ pageParam }) => listCatalog({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    placeholderData: previous => previous,
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap(p => p.items) ?? [];
  const active = f.difficulty.length + f.source.length + (f.rated ? 1 : 0);
  const clear = () => set({ difficulty: [], source: [], rated: false, category: '' });
  const total = first?.total ?? 0;
  const countText = `${total} ${total === 1 ? 'pattern' : 'patterns'}`;

  return (
    <div>
      {/* Signed in, the top bar already names the page: categories and search in one row, no big heading (owner). */}
      {isSignedIn ? (
        <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-center">
        <nav aria-label="Categories" className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {[['', 'All'] as const, ...MAIN_CATEGORIES.map(c => [c, categoryLabel(c)] as const), ...PATTERN_CATEGORIES.filter(c => !(MAIN_CATEGORIES as readonly string[]).includes(c)).map(c => [c, categoryLabel(c)] as const)].map(([id, label]) => (
            <button key={id || 'all'} type="button" aria-pressed={f.category === id} onClick={() => set({ category: id })}
              className={`min-h-[44px] shrink-0 rounded-full px-5 text-[15px] font-bold ${f.category === id ? 'bg-ink text-white' : 'bg-white text-ink'}`}>{label}</button>
          ))}
        </nav>
          <label className="relative block lg:w-[360px] lg:shrink-0">
            <span className="sr-only">Search patterns</span>
            <Search size={19} aria-hidden="true" className="absolute left-5 top-1/2 -translate-y-1/2" />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, designer or garment"
              className="min-h-[52px] w-full rounded-full border-2 border-ink bg-white pl-12 pr-5 text-[16px] outline-none focus:ring-4 focus:ring-yellow" />
          </label>
        </div>
      ) : (
        <>
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-end">
        <div>
          <p className="eyebrow eyebrow-red">Pattern directory</p>
          <h1 className="mt-1 font-display text-[40px] leading-none tracking-[-.06em] sm:text-[64px]">Patterns</h1>
          <p className="mt-3 hidden text-[17px] text-subtle sm:block">Every pattern the club has sewn, with real makes, fit notes and reviews.</p>
        </div>
        <label className="relative block">
          <span className="sr-only">Search patterns</span>
          <Search size={19} aria-hidden="true" className="absolute left-5 top-1/2 -translate-y-1/2" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, designer or garment"
            className="min-h-[52px] w-full rounded-full border-2 border-ink bg-white pl-12 pr-5 text-[16px] outline-none focus:ring-4 focus:ring-yellow lg:min-h-[60px]" />
        </label>
      </header>

      <nav aria-label="Categories" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {[['', 'All'] as const, ...MAIN_CATEGORIES.map(c => [c, categoryLabel(c)] as const), ...PATTERN_CATEGORIES.filter(c => !(MAIN_CATEGORIES as readonly string[]).includes(c)).map(c => [c, categoryLabel(c)] as const)].map(([id, label]) => (
          <button key={id || 'all'} type="button" aria-pressed={f.category === id} onClick={() => set({ category: id })}
            className={`min-h-[44px] shrink-0 rounded-full px-5 text-[15px] font-bold ${f.category === id ? 'bg-ink text-white' : 'bg-white text-ink'}`}>{label}</button>
        ))}
      </nav>
        </>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="Filters" className="hidden rounded-[28px] bg-white p-6 lg:block">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[22px] tracking-[-.04em]">Filters</h2>
            {(active > 0 || f.category) && <button type="button" onClick={clear} className="min-h-[44px] text-sm font-semibold underline underline-offset-4">Clear all</button>}
          </div>
          <div className="mt-3"><FilterGroups f={f} set={set} facets={first?.facets} /></div>
          <p className="mt-4 rounded-[16px] bg-canvas p-3.5 text-[13px] text-subtle">Patterns link to the designer's site. Seams Club never stores pattern files.</p>
          <button type="button" onClick={onAdd} className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold"><Plus size={16} aria-hidden="true" />Add a pattern page</button>
        </aside>

        <section aria-labelledby="results-count">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="results-count" role="status" className="text-[17px] font-bold">{first ? countText : ' '}</p>
            <div className="hidden lg:block"><SortControl f={f} set={set} /></div>
            <button type="button" onClick={() => setSheet(true)} className="inline-flex min-h-[48px] items-center gap-2 rounded-full border-2 border-ink bg-white px-5 text-[15px] font-bold lg:hidden">
              <SlidersHorizontal size={17} aria-hidden="true" />Filters{active ? ` · ${active}` : ''}
            </button>
          </div>
          <div className="mt-4">
            {list.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
              : list.isError ? <ErrorState retry={() => list.refetch()} />
              : !items.length
                ? (
                  <div className="grid place-items-center rounded-[28px] bg-white px-6 py-16 text-center">
                    <Search size={28} aria-hidden="true" />
                    <p className="mt-3 font-display text-[22px] tracking-[-.04em]">No patterns match those filters</p>
                    <p className="mt-1 text-sm text-subtle">Try fewer filters, or add the pattern so others can find it.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={() => { setQ(''); set({ q: '', difficulty: [], source: [], rated: false, category: '' }); }} className="btn btn-primary">Clear filters</button>
                      <button type="button" onClick={onAdd} className="btn btn-line"><Plus size={16} aria-hidden="true" />Add a pattern page</button>
                    </div>
                  </div>
                )
                : <div className={`grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 ${list.isPlaceholderData ? 'opacity-60' : ''}`}>{items.map((e, i) => <PatternCard key={e.id} entry={e} index={i} />)}</div>}
            {list.hasNextPage && (
              <div className="mt-5 flex justify-center">
                <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} className="btn btn-line">{list.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more</button>
              </div>
            )}
          </div>
          <button type="button" onClick={onAdd} className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold lg:hidden"><Plus size={16} aria-hidden="true" />Add a pattern page</button>
        </section>
      </div>

      {sheet && (
        <Sheet label="Filter and sort" onClose={() => setSheet(false)}>
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-display text-[26px] tracking-[-.05em]">Filter and sort</h2>
            {active > 0 && <button type="button" onClick={clear} className="min-h-[44px] text-[15px] font-semibold underline underline-offset-4">Clear</button>}
            <button type="button" onClick={() => setSheet(false)} aria-label="Close filters" className="grid h-11 w-11 place-items-center rounded-full bg-canvas"><X size={20} aria-hidden="true" /></button>
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold text-subtle">Sort by</p>
          <SortControl f={f} set={set} wide />
          <div className="mt-5"><FilterGroups f={f} set={set} facets={first?.facets} chips /></div>
          <button type="button" onClick={() => setSheet(false)} className="mt-5 min-h-[56px] w-full rounded-full bg-ink text-[17px] font-bold text-white">Show {countText}</button>
        </Sheet>
      )}
    </div>
  );
}
