import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setCatalogLink, useGetCatalogEntry, useListCatalog, type CatalogEntry } from '@workspace/api-client-react';
import { ExternalLink, Link2, Loader2, Plus, Search } from 'lucide-react';
import { Link } from 'wouter';
import { catalogPath, errorText, NewEntryForm } from '@/components/catalog/parts';
import { Sheet } from '@/components/social/Sheet';

type ItemKind = 'pattern' | 'fabric' | 'thread';

/** Best guess at a pattern page category from a garment type typed in the studio. */
function guessCategory(kind: ItemKind, garmentType?: string): string {
  if (kind === 'fabric') return 'fabric';
  if (kind === 'thread') return 'thread';
  const g = (garmentType ?? '').toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/dress/, 'dresses'], [/top|shirt|blouse|tee/, 'tops'], [/trouser|pant|jean|short/, 'trousers'], [/skirt/, 'skirts'],
    [/jumpsuit|overall|dungaree/, 'jumpsuits'], [/coat|jacket/, 'outerwear'], [/bag|tote/, 'bags'],
  ];
  return pairs.find(([re]) => re.test(g))?.[1] ?? 'other';
}

/**
 * "On SewSpace: Willa Dress" under a studio item, or a button to link it to a
 * shared page (search, or add a new page). Linking never shares the item itself.
 */
export function CatalogLink({ kind, itemId, catalogId, name, maker, garmentType }: {
  kind: ItemKind; itemId: number; catalogId: number | null | undefined; name: string; maker?: string | null; garmentType?: string;
}) {
  const linked = useGetCatalogEntry(catalogId ?? 0, { query: { enabled: Boolean(catalogId) } });
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 text-xs">
      {catalogId && linked.data
        ? <>
            <span className="text-subtle">On SewSpace:</span>
            <Link href={catalogPath(linked.data)} className="inline-flex min-h-[32px] items-center gap-1 font-bold text-blue-ink"><ExternalLink size={12} aria-hidden="true" />{linked.data.name}</Link>
            <button type="button" onClick={() => setOpen(true)} className="min-h-[32px] font-semibold text-subtle underline">Change</button>
          </>
        : <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line px-3 font-semibold hover:bg-canvas">
            <Link2 size={13} aria-hidden="true" />Link to a SewSpace page
          </button>}
      {open && (
        <Sheet label="Link to a SewSpace page" onClose={() => setOpen(false)}>
          <LinkPicker kind={kind} itemId={itemId} current={catalogId ?? null} name={name} maker={maker ?? ''} category={guessCategory(kind, garmentType)} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </div>
  );
}

function LinkPicker({ kind, itemId, current, name, maker, category, onDone }: {
  kind: ItemKind; itemId: number; current: number | null; name: string; maker: string; category: string; onDone: () => void;
}) {
  const client = useQueryClient();
  const pageKind = kind === 'pattern' ? 'pattern' : 'product';
  const [q, setQ] = useState(name);
  const [debounced, setDebounced] = useState(name);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | 'unlink' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const results = useListCatalog({ kind: pageKind, q: debounced.trim() || undefined });

  const link = async (catalogId: number | null) => {
    setBusy(catalogId ?? 'unlink');
    setError(null);
    try {
      await setCatalogLink(kind, itemId, { catalogId });
      await client.invalidateQueries();
      onDone();
    } catch (e) {
      setError(errorText(e, "That didn't link. Try again."));
    } finally {
      setBusy(null);
    }
  };

  if (adding) {
    return <NewEntryForm kind={pageKind} initial={{ name, maker, category }} onCancel={() => setAdding(false)} onCreated={(entry: CatalogEntry) => link(entry.id)} />;
  }
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Link to a SewSpace page</h2>
      <p className="text-sm text-subtle">Your makes using this {kind} will show on that page, for the people who can already see them. The item itself stays as private as you set it.</p>
      <label className="relative block">
        <span className="sr-only">Search pages</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input value={q} onChange={e => setQ(e.target.value)} className="field min-h-[48px] pl-9" placeholder={kind === 'pattern' ? 'Pattern name or designer' : 'Product name or brand'} />
      </label>
      <ul className="max-h-[40vh] space-y-1 overflow-y-auto" aria-live="polite">
        {results.isLoading && <li className="py-3"><Loader2 className="animate-spin" aria-label="Searching" /></li>}
        {results.data?.items.map(entry => (
          <li key={entry.id}>
            <button type="button" disabled={busy !== null} onClick={() => link(entry.id)}
              className={`flex min-h-[52px] w-full items-center gap-3 rounded-[16px] px-3 text-left hover:bg-canvas ${entry.id === current ? 'bg-yellow' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{entry.name}</span>
                <span className="block truncate text-xs text-subtle">{[entry.maker, entry.category].filter(Boolean).join(' · ')} · {entry.stats.reviews} review{entry.stats.reviews === 1 ? '' : 's'}</span>
              </span>
              {busy === entry.id ? <Loader2 size={16} className="animate-spin" /> : entry.id === current ? <span className="text-xs font-bold">Linked</span> : <span className="text-xs font-bold text-blue-ink">Link</span>}
            </button>
          </li>
        ))}
        {results.data && !results.data.items.length && <li className="py-2 text-sm text-subtle">No pages match yet.</li>}
      </ul>
      {error && <p role="alert" className="text-sm font-semibold text-red-ink">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAdding(true)} className="btn btn-primary"><Plus size={15} aria-hidden="true" />Add a new page</button>
        {current && <button type="button" disabled={busy !== null} onClick={() => link(null)} className="btn btn-line">{busy === 'unlink' && <Loader2 size={15} className="animate-spin" />}Unlink</button>}
        <button type="button" onClick={onDone} className="btn btn-line ml-auto">Close</button>
      </div>
    </div>
  );
}
