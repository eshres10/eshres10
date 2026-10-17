import { useEffect, useState } from 'react';
import { useListCatalog, type CatalogEntry } from '@workspace/api-client-react';
import { BookOpen, Layers, Loader2, Plus, Search } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { capitalise, catalogPath, NewEntryForm, Stars } from '@/components/catalog/parts';
import { ErrorState } from '@/components/common';
import { Sheet } from '@/components/social/Sheet';
import { CommunityTabs } from '@/components/shell/CommunityTabs';

const KINDS = [
  { id: 'pattern', label: 'Patterns', icon: BookOpen },
  { id: 'product', label: 'Fabrics & supplies', icon: Layers },
] as const;
type Kind = (typeof KINDS)[number]['id'];

function EntryCard({ entry }: { entry: CatalogEntry }) {
  const s = entry.stats;
  return (
    <Link href={catalogPath(entry)} className="flex flex-col rounded-[30px] bg-white p-5 text-ink no-underline hover:outline hover:outline-2 hover:outline-ink">
      <span className="eyebrow text-subtle">{capitalise(entry.category)}</span>
      <span className="mt-1.5 font-display text-[22px] leading-tight tracking-[-.04em]">{entry.name}</span>
      {entry.maker && <span className="text-sm text-subtle">by {entry.maker}</span>}
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-sm">
        <span className="inline-flex items-center gap-1.5"><Stars value={s.rating} size={14} />{s.rating !== null && <b>{s.rating.toFixed(1)}</b>}</span>
        <span className="text-subtle">{s.reviews} review{s.reviews === 1 ? '' : 's'}</span>
        <span className="text-subtle">{s.makes} make{s.makes === 1 ? '' : 's'}</span>
      </span>
    </Link>
  );
}

/** Browse and search shared pattern and product pages. Works signed out. */
export function CatalogPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const kind: Kind = params.get('kind') === 'product' ? 'product' : 'pattern';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [adding, setAdding] = useState(false);
  const ask = useRequireSignIn();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { document.title = 'Sewing patterns and supplies · Seams Club'; }, []);
  const list = useListCatalog({ kind, q: debounced.trim() || undefined });
  const setKind = (next: Kind) => setLocation(next === 'pattern' ? '/catalog' : '/catalog?kind=product', { replace: true });

  return (
    <div className="mx-auto max-w-[1232px]">
      <CommunityTabs />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Kind" className="flex gap-1 rounded-full bg-white p-1">
          {KINDS.map(k => (
            <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold ${kind === k.id ? 'bg-ink text-white' : 'text-ink'}`}><k.icon size={15} aria-hidden="true" />{k.label}</button>
          ))}
        </div>
        <label className="relative min-w-[180px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} type="search" className="field min-h-[48px] pl-9" placeholder={kind === 'pattern' ? 'Pattern or designer' : 'Product or brand'} />
        </label>
        <button type="button" className="btn btn-primary ml-auto min-h-[48px] shrink-0 whitespace-nowrap" onClick={() => { if (ask({ title: 'Sign in to add a page', body: "Add a pattern or product so people can review it. You'll come straight back here." })) setAdding(true); }}>
          <Plus size={16} aria-hidden="true" />Add a page
        </button>
      </div>
      <div className="mt-5">
        {list.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
          : list.isError ? <ErrorState retry={() => list.refetch()} />
          : !list.data?.items.length
            ? <div className="rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle">{debounced ? 'Nothing matches yet. Add the page so others can find it.' : 'No pages yet. Be the first to add one.'}</div>
            : <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3">{list.data.items.map(e => <EntryCard key={e.id} entry={e} />)}</div>}
      </div>
      {adding && (
        <Sheet label="Add a page" onClose={() => setAdding(false)}>
          <NewEntryForm kind={kind} initial={{ name: q }} onCancel={() => setAdding(false)} onCreated={entry => { setAdding(false); setLocation(catalogPath(entry)); }} />
        </Sheet>
      )}
    </div>
  );
}
