import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListPatternsQueryKey, useDeletePattern, useListPatterns, useListProjects, type Pattern } from '@workspace/api-client-react';
import { BookOpen, ChevronRight, FileText, Loader2, Lock, MoreHorizontal } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { CatalogLink } from '@/components/catalog/CatalogLink';
import { ErrorState } from '@/components/common';
import { useStudioQuery } from '@/components/shell/StudioMobile';
import { handOverFile } from '@/lib/pending-file';
import { FilterChips, ItemActions } from './parts';

// Stored statuses keep their values; these are the labels from the mockup.
// "Making" isn't stored: a pattern is Making while an unfinished project uses it.
type Filter = 'all' | 'want_to_make' | 'purchased' | 'making' | 'made' | 'favorite';
const LABEL: Record<Exclude<Filter, 'all'>, string> = { want_to_make: 'Want to make', purchased: 'Bought', making: 'Making', made: 'Made it', favorite: 'Favourite' };
const BADGE: Record<Exclude<Filter, 'all'>, string> = { want_to_make: 'bg-white text-ink', purchased: 'bg-white text-ink', making: 'bg-ink text-white', made: 'bg-yellow text-ink', favorite: 'bg-peach text-ink' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Pattern library on phones: PDF import banner, status chips with counts, a 2-column cover grid. */
export function MobilePatternLibrary() {
  const [q] = useStudioQuery();
  const [, setLocation] = useLocation();
  const list = useListPatterns(q ? { search: q } : undefined);
  const projects = useListProjects();
  const client = useQueryClient();
  const remove = useDeletePattern();
  const [filter, setFilter] = useState<Filter>('all');
  const [acting, setActing] = useState<Pattern | null>(null);

  const making = new Set((projects.data ?? []).filter(p => p.status !== 'finished' && p.patternId).map(p => p.patternId!));
  const patterns = list.data ?? [];
  const inFilter = (p: Pattern, f: Filter) => f === 'all' || (f === 'making' ? making.has(p.id) : p.status === f);
  const shown = patterns.filter(p => inFilter(p, filter));
  const count = (f: Filter) => patterns.filter(p => inFilter(p, f)).length;
  const filters: Filter[] = ['all', 'want_to_make', 'purchased', 'making', 'made', ...(count('favorite') ? ['favorite' as const] : [])];

  if (list.isLoading) return <div className="grid place-items-center py-16"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  if (list.isError) return <ErrorState retry={() => list.refetch()} />;
  return (
    <div className="space-y-3">
      <label className="flex min-h-[72px] cursor-pointer items-center gap-3 rounded-[26px] bg-ink p-3.5 text-white focus-within:ring-4 focus-within:ring-yellow">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-peach text-ink" aria-hidden="true"><FileText size={22} /></span>
        <span className="min-w-0 flex-1"><span className="block font-bold">Import a pattern PDF</span><span className="block text-sm text-white/75">We fill in sizes, fabric needed and steps</span></span>
        <ChevronRight size={20} aria-hidden="true" />
        <input type="file" accept="application/pdf,.pdf" className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { handOverFile(f); setLocation('/stash/new?kind=pattern'); } }} />
      </label>
      <FilterChips label="Filter by status" value={filter} onChange={setFilter}
        options={filters.map(f => ({ value: f, label: `${f === 'all' ? 'All' : LABEL[f]} ${count(f)}` }))} />
      {patterns.length === 0
        ? <div className="rounded-[26px] bg-white px-5 py-10 text-center"><p className="text-[15px] text-subtle">{q ? `No pattern matches "${q}".` : 'Your pattern library is empty.'}</p><Link href="/stash/new?kind=pattern" className="btn btn-primary mt-4 inline-flex min-h-[44px]">Add a pattern</Link></div>
        : shown.length === 0
          ? <p className="rounded-[26px] bg-white px-5 py-10 text-center text-[15px] text-subtle">No patterns here yet.</p>
          : (
            <ul className="grid grid-cols-2 gap-2.5">
              {shown.map(p => {
                const status: Exclude<Filter, 'all'> = making.has(p.id) ? 'making' : (p.status as Exclude<Filter, 'all'>) in LABEL ? p.status as Exclude<Filter, 'all'> : 'want_to_make';
                return (
                  <li key={p.id} className="relative overflow-hidden rounded-[22px] bg-white">
                    <Link href={`/stash/pattern/${p.id}/edit`} className="block text-ink no-underline">
                      <span className="relative block aspect-[4/5] bg-line">
                        {p.coverImageUrl
                          ? <img src={p.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="grid h-full place-items-center text-subtle" aria-hidden="true"><BookOpen size={28} /></span>}
                        <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-bold ${BADGE[status]}`}>{LABEL[status]}</span>
                        {p.pdfUrl && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-bold"><Lock size={11} aria-hidden="true" />PDF</span>}
                      </span>
                      <span className="block px-3 pb-3 pt-2.5 pr-10">
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="line-clamp-2 block text-sm text-subtle">{[p.designer || 'Independent', p.difficulty && cap(p.difficulty)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </Link>
                    <button type="button" onClick={() => setActing(p)} aria-label={`More for ${p.name}`} className="absolute bottom-1.5 right-0.5 grid h-11 w-11 place-items-center text-subtle">
                      <MoreHorizontal size={18} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      <p className="flex items-center gap-2 px-1 text-sm text-subtle"><Lock size={14} aria-hidden="true" />Pattern PDFs always stay private, even if you share the pattern.</p>
      {acting && (
        <ItemActions title={acting.name} editHref={`/stash/pattern/${acting.id}/edit`} imageUrl={acting.coverImageUrl} item={acting} fallbackName="pattern"
          pdf={acting.pdfUrl ? { url: acting.pdfUrl, fileName: acting.pdfFileName || `${acting.name}.pdf` } : null}
          catalog={<CatalogLink kind="pattern" itemId={acting.id} catalogId={acting.catalogId} name={acting.name} maker={acting.designer} garmentType={acting.garmentType} />}
          deleting={remove.isPending} onClose={() => setActing(null)}
          onDelete={() => remove.mutate({ id: acting.id }, { onSuccess: () => { setActing(null); client.invalidateQueries({ queryKey: getListPatternsQueryKey() }); } })} />
      )}
    </div>
  );
}
