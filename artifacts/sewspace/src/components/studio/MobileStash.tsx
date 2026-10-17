import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListFabricsQueryKey,
  getListThreadsQueryKey,
  useDeleteFabric,
  useDeleteThread,
  useGetProfile,
  useListFabrics,
  useListThreads,
  type Fabric,
  type Thread,
} from '@workspace/api-client-react';
import { Grid2x2, List, Loader2, MoreHorizontal } from 'lucide-react';
import { Link } from 'wouter';
import { CatalogLink } from '@/components/catalog/CatalogLink';
import { ErrorState } from '@/components/common';
import { toMetres } from '@/components/projects/setup';
import { useStudioQuery } from '@/components/shell/StudioMobile';
import { FilterChips, ItemActions, PrivacyBadge, Toggle } from './parts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Types in a sensible order: the usual ones first, then anything else the person uses. */
function typeOptions(types: string[], usual: string[]) {
  const present = [...new Set(types.filter(Boolean).map(t => t.toLowerCase()))];
  return [...usual.filter(t => present.includes(t)), ...present.filter(t => !usual.includes(t)).sort()];
}

// ---------------------------------------------------------------- fabric

const FABRIC_ORDER = ['linen', 'cotton', 'silk', 'knit', 'denim', 'wool', 'other'];

/** Fabric stash on phones: total in m or yd, type chips, a 2-column photo grid. */
export function MobileFabricStash() {
  const [q] = useStudioQuery();
  const list = useListFabrics(q ? { search: q } : undefined);
  const profile = useGetProfile();
  const client = useQueryClient();
  const remove = useDeleteFabric();
  const [unit, setUnit] = useState<'m' | 'yd'>('m');
  useEffect(() => { if (profile.data?.units === 'imperial') setUnit('yd'); }, [profile.data?.units]);
  const [type, setType] = useState('all');
  const [acting, setActing] = useState<Fabric | null>(null);

  const fabrics = list.data ?? [];
  const shown = type === 'all' ? fabrics : fabrics.filter(f => (f.type ?? '').toLowerCase() === type);
  const amount = (f: Fabric) => (f.quantity == null ? null : unit === 'm' ? toMetres(f.quantity, f.unit) : toMetres(f.quantity, f.unit) / 0.9144);
  const total = round1(shown.reduce((sum, f) => sum + (amount(f) ?? 0), 0));
  const types = typeOptions(fabrics.map(f => f.type ?? ''), FABRIC_ORDER);

  if (list.isLoading) return <div className="grid place-items-center py-16"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  if (list.isError) return <ErrorState retry={() => list.refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px]" aria-live="polite"><b>{shown.length} fabric{shown.length === 1 ? '' : 's'}</b> <span className="text-subtle">· {total} {unit} in total</span></p>
        <Toggle<'m' | 'yd'> label="Units" value={unit} onChange={setUnit} options={[{ value: 'm', label: 'm', name: 'Metres' }, { value: 'yd', label: 'yd', name: 'Yards' }]} />
      </div>
      {types.length > 0 && <FilterChips label="Filter by type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, ...types.map(t => ({ value: t, label: cap(t) }))]} />}
      {fabrics.length === 0
        ? <Empty text={q ? `No fabric matches "${q}".` : 'Your fabric stash is empty.'} href="/stash/new?kind=fabric" action="Add fabric" />
        : shown.length === 0
          ? <Empty text={`No ${cap(type).toLowerCase()} fabric yet.`} href="/stash/new?kind=fabric" action="Add fabric" />
          : (
            <ul className="grid grid-cols-2 gap-2.5">
              {shown.map(f => {
                const a = amount(f);
                return (
                  <li key={f.id} className="relative overflow-hidden rounded-[22px] bg-white">
                    <Link href={`/stash/fabric/${f.id}/edit`} className="block text-ink no-underline">
                      <span className="relative block aspect-[6/5] bg-line" style={!f.imageUrl && f.colorHex ? { backgroundColor: f.colorHex } : undefined}>
                        {f.imageUrl && <img src={f.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        <span className="absolute left-2 top-2"><PrivacyBadge value={f.visibility} /></span>
                      </span>
                      <span className="block px-3 pb-3 pt-2.5 pr-10">
                        <span className="block truncate font-bold">{f.name}</span>
                        <span className="block truncate text-sm text-subtle">{[f.type && cap(f.type), a != null ? `${round1(a)} ${unit}` : null].filter(Boolean).join(' · ')}</span>
                      </span>
                    </Link>
                    <button type="button" onClick={() => setActing(f)} aria-label={`More for ${f.name}`} className="absolute bottom-1.5 right-0.5 grid h-11 w-11 place-items-center text-subtle">
                      <MoreHorizontal size={18} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      {acting && (
        <ItemActions title={acting.name} editHref={`/stash/fabric/${acting.id}/edit`} imageUrl={acting.imageUrl} item={acting} fallbackName="fabric"
          catalog={<CatalogLink kind="fabric" itemId={acting.id} catalogId={acting.catalogId} name={acting.name} />}
          deleting={remove.isPending} onClose={() => setActing(null)}
          onDelete={() => remove.mutate({ id: acting.id }, { onSuccess: () => { setActing(null); client.invalidateQueries({ queryKey: getListFabricsQueryKey() }); } })} />
      )}
    </div>
  );
}

function Empty({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="rounded-[26px] bg-white px-5 py-10 text-center">
      <p className="text-[15px] text-subtle">{text}</p>
      <Link href={href} className="btn btn-primary mt-4 inline-flex min-h-[44px]">{action}</Link>
    </div>
  );
}

// ---------------------------------------------------------------- thread

const THREAD_LABELS: Record<string, string> = { 'all-purpose': 'All-purpose', topstitch: 'Topstitch', serger: 'Serger', embroidery: 'Embroidery', other: 'Other' };
const THREAD_ORDER = ['all-purpose', 'topstitch', 'serger', 'embroidery', 'other'];
const threadLabel = (t: string) => THREAD_LABELS[t.toLowerCase()] ?? cap(t);
const threadName = (t: Thread) => t.colorName || [t.brand, t.color].filter(Boolean).join(' ') || 'Thread';
const isHex = (c: string | null | undefined) => /^#[0-9a-f]{3,8}$/i.test(c ?? '');
/** Serger thread comes on cones; everything else on spools. */
const qtyLabel = (t: Thread) => {
  if (t.quantity == null) return '—';
  const cones = (t.type ?? '').toLowerCase() === 'serger';
  return `${t.quantity} ${cones ? (t.quantity === 1 ? 'cone' : 'cones') : (t.quantity === 1 ? 'spool' : 'spools')}`;
};
const isLow = (t: Thread) => t.quantity != null && t.quantity <= 1;

/** Thread drawer on phones: a colour wall or a list, with type chips and running-low dots. */
export function MobileThreadDrawer() {
  const [q] = useStudioQuery();
  const list = useListThreads(q ? { search: q } : undefined);
  const client = useQueryClient();
  const remove = useDeleteThread();
  const [view, setView] = useState<'wall' | 'list'>('wall');
  const [type, setType] = useState('all');
  const [acting, setActing] = useState<Thread | null>(null);

  const threads = list.data ?? [];
  const shown = type === 'all' ? threads : threads.filter(t => (t.type ?? '').toLowerCase() === type);
  const total = shown.reduce((sum, t) => sum + (t.quantity ?? 0), 0);
  const types = typeOptions(threads.map(t => t.type ?? ''), THREAD_ORDER);

  if (list.isLoading) return <div className="grid place-items-center py-16"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  if (list.isError) return <ErrorState retry={() => list.refetch()} />;
  const aria = (t: Thread) => `${threadName(t)}, ${threadLabel(t.type ?? '')}, ${qtyLabel(t)}${isLow(t) ? ', running low' : ''}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px]" aria-live="polite"><b>{shown.length} thread{shown.length === 1 ? '' : 's'}</b> <span className="text-subtle">· {total} spools and cones</span></p>
        <Toggle<'wall' | 'list'> label="View" value={view} onChange={setView} options={[
          { value: 'wall', label: <Grid2x2 size={17} aria-hidden="true" />, name: 'Colour wall' },
          { value: 'list', label: <List size={17} aria-hidden="true" />, name: 'List' },
        ]} />
      </div>
      {types.length > 0 && <FilterChips label="Filter by type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, ...types.map(t => ({ value: t, label: threadLabel(t) }))]} />}
      {threads.length === 0
        ? <Empty text={q ? `No thread matches "${q}".` : 'Your thread drawer is empty.'} href="/stash/new?kind=thread" action="Add thread" />
        : shown.length === 0
          ? <Empty text={`No ${threadLabel(type).toLowerCase()} thread yet.`} href="/stash/new?kind=thread" action="Add thread" />
          : view === 'wall'
            ? <>
                <ul className="grid grid-cols-4 gap-x-2 gap-y-4 rounded-[26px] bg-white p-4">
                  {shown.map(t => (
                    <li key={t.id} className="relative">
                      <Link href={`/stash/thread/${t.id}/edit`} aria-label={aria(t)} className="flex flex-col items-center gap-1.5 text-center text-ink no-underline">
                        <span className="relative block h-14 w-14 rounded-full border-[5px] border-cream" style={{ backgroundColor: isHex(t.color) ? t.color : undefined }} aria-hidden="true">
                          {isLow(t) && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-red" />}
                        </span>
                        <span className="line-clamp-2 text-[13px] font-bold leading-tight">{threadName(t)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {shown.some(isLow) && <p className="flex items-center gap-2 px-1 text-sm text-subtle"><span className="h-2.5 w-2.5 rounded-full bg-red" aria-hidden="true" />Running low: 1 spool or less</p>}
              </>
            : (
              <ul className="divide-y divide-line rounded-[26px] bg-white px-3">
                {shown.map(t => (
                  <li key={t.id} className="flex items-center gap-1">
                    <Link href={`/stash/thread/${t.id}/edit`} aria-label={aria(t)} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2 text-ink no-underline">
                      <span className="h-10 w-10 shrink-0 rounded-full border-[4px] border-cream" style={{ backgroundColor: isHex(t.color) ? t.color : undefined }} aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold">{threadName(t)}</span><span className="block truncate text-sm text-subtle">{threadLabel(t.type ?? '')}</span></span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${isLow(t) ? 'bg-red-ink text-white' : 'bg-canvas'}`}>{qtyLabel(t)}</span>
                    </Link>
                    <button type="button" onClick={() => setActing(t)} aria-label={`More for ${threadName(t)}`} className="grid h-11 w-9 shrink-0 place-items-center text-subtle"><MoreHorizontal size={18} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
      {acting && (
        <ItemActions title={threadName(acting)} editHref={`/stash/thread/${acting.id}/edit`} imageUrl={acting.imageUrl} item={acting} fallbackName="thread"
          catalog={<CatalogLink kind="thread" itemId={acting.id} catalogId={acting.catalogId} name={acting.colorName ? `${acting.brand} ${acting.colorName}`.trim() : acting.brand} maker={acting.brand} />}
          deleting={remove.isPending} onClose={() => setActing(null)}
          onDelete={() => remove.mutate({ id: acting.id }, { onSuccess: () => { setActing(null); client.invalidateQueries({ queryKey: getListThreadsQueryKey() }); } })} />
      )}
    </div>
  );
}
