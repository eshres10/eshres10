import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createIdea,
  deleteIdea,
  getListIdeasQueryKey,
  updateIdea,
  useListFabrics,
  useListIdeas,
  useListPatterns,
  useListProjects,
  type Idea,
} from '@workspace/api-client-react';
import { BookOpen, Grid3x3, Loader2, MoreHorizontal, Plus, Spool } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Sheet, useSheetDirty } from '@/components/social/Sheet';

const NOTE_MAX = 80;
const errorText = (e: unknown, fallback: string) => (e as { data?: { error?: string } })?.data?.error ?? fallback;

/** A photo, or a soft placeholder when there is none. */
function Thumb({ src, className = '', icon }: { src: string | null | undefined; className?: string; icon: ReactNode }) {
  return src
    ? <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />
    : <span className={`grid place-items-center bg-canvas text-subtle ${className}`} aria-hidden="true">{icon}</span>;
}

/** Tiles to pick one of your own patterns or fabrics (a radiogroup). */
function PickRow<T extends { id: number; name: string }>({ label, items, value, onChange, image, icon, emptyHref, emptyLabel }: {
  label: string; items: T[]; value: number | null; onChange: (id: number) => void; image: (item: T) => string | null | undefined;
  icon: ReactNode; emptyHref: string; emptyLabel: string;
}) {
  return (
    <div>
      <p id={`pick-${label}`} className="mb-2 font-bold">{label}</p>
      {items.length === 0
        ? <Link href={emptyHref} className="inline-flex min-h-[44px] items-center rounded-full border-2 border-ink px-4 text-sm font-bold text-ink no-underline">{emptyLabel}</Link>
        : (
          <div role="radiogroup" aria-labelledby={`pick-${label}`} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {items.map(item => (
              <button key={item.id} type="button" role="radio" aria-checked={value === item.id} onClick={() => onChange(item.id)}
                className={`w-[86px] shrink-0 overflow-hidden rounded-[16px] border-[3px] text-left ${value === item.id ? 'border-ink' : 'border-line'}`}>
                <Thumb src={image(item)} icon={icon} className="block h-[86px] w-full" />
                <span className="line-clamp-2 block px-2 py-1.5 text-[13px] font-bold leading-tight">{item.name}</span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

/** Add or edit an idea. Follows the sheet rules: asks before discarding, Escape closes, focus stays inside. */
function IdeaForm({ editing, onDone }: { editing: Idea | null; onDone: () => void }) {
  const client = useQueryClient();
  const patterns = useListPatterns();
  const fabrics = useListFabrics();
  const [patternId, setPatternId] = useState<number | null>(editing?.pattern.id ?? null);
  const [fabricId, setFabricId] = useState<number | null>(editing?.fabric.id ?? null);
  const [note, setNote] = useState(editing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSheetDirty(editing
    ? patternId !== editing.pattern.id || fabricId !== editing.fabric.id || note !== editing.note
    : Boolean(patternId || fabricId || note.trim()));
  const save = async () => {
    if (!patternId || !fabricId) { setError('Pick a pattern and a fabric.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateIdea(editing.id, { patternId, fabricId, note });
      else await createIdea({ patternId, fabricId, note });
      await client.invalidateQueries({ queryKey: getListIdeasQueryKey() });
      onDone();
    } catch (e) {
      setError(errorText(e, "That didn't save. Try again."));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <h2 className="font-display text-[26px] tracking-[-.04em]">{editing ? 'Edit idea' : 'Add an idea'}</h2>
      {(patterns.isLoading || fabrics.isLoading) ? <Loader2 className="animate-spin" aria-label="Loading" /> : <>
        <PickRow label="Pattern" items={patterns.data ?? []} value={patternId} onChange={id => { setPatternId(id); setError(null); }}
          image={p => p.coverImageUrl} icon={<BookOpen size={22} />} emptyHref="/stash/new?kind=pattern" emptyLabel="Add a pattern first" />
        <PickRow label="Fabric" items={fabrics.data ?? []} value={fabricId} onChange={id => { setFabricId(id); setError(null); }}
          image={f => f.imageUrl} icon={<Grid3x3 size={22} />} emptyHref="/stash/new?kind=fabric" emptyLabel="Add fabric first" />
      </>}
      <label className="block">
        <span className="mb-1.5 flex justify-between font-bold">Note <span className="font-normal text-subtle">(optional) · {note.length} / {NOTE_MAX}</span></span>
        <input value={note} onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))} placeholder="e.g. For summer" className="field" />
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-red-ink">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-yellow text-lg font-bold text-ink">
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{editing ? 'Save changes' : 'Save idea'}
      </button>
    </div>
  );
}

/** One idea: pattern and fabric side by side, Start project, and a … menu (also on long-press). */
function IdeaCard({ idea, onEdit }: { idea: Idea; onEdit: () => void }) {
  const client = useQueryClient();
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed');
  const [busy, setBusy] = useState(false);
  const hold = useRef<number | undefined>(undefined);
  const startHold = () => { hold.current = window.setTimeout(() => setMenu('open'), 550); };
  const endHold = () => window.clearTimeout(hold.current);
  const remove = async () => {
    setBusy(true);
    await deleteIdea(idea.id).catch(() => undefined);
    await client.invalidateQueries({ queryKey: getListIdeasQueryKey() });
  };
  return (
    <article className="relative flex min-h-[248px] w-[176px] shrink-0 flex-col overflow-hidden rounded-[26px] bg-white"
      onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
      onContextMenu={e => { e.preventDefault(); setMenu('open'); }}>
      <div className="grid h-[120px] grid-cols-2">
        <Thumb src={idea.pattern.imageUrl} icon={<BookOpen size={20} />} className="h-full w-full" />
        <Thumb src={idea.fabric.imageUrl} icon={<Grid3x3 size={20} />} className="h-full w-full" />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="truncate font-bold">{idea.pattern.name}</h3>
        <p className="truncate text-sm text-subtle">in {idea.fabric.name}</p>
        {idea.note && <p className="mt-1 line-clamp-2 text-sm italic text-subtle">“{idea.note}”</p>}
        <Link href={`/projects/new?pattern=${idea.pattern.id}&fabric=${idea.fabric.id}&idea=${idea.id}`}
          className="mt-3 inline-flex min-h-[44px] w-fit items-center rounded-full bg-yellow px-4 text-sm font-bold text-ink no-underline">Start project</Link>
      </div>
      <button type="button" onClick={() => setMenu(m => (m === 'closed' ? 'open' : 'closed'))} aria-haspopup="menu" aria-expanded={menu !== 'closed'}
        aria-label={`More for ${idea.pattern.name} in ${idea.fabric.name}`} className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90"><MoreHorizontal size={16} aria-hidden="true" /></span>
      </button>
      {menu !== 'closed' && (
        <div role="menu" className="absolute inset-x-2 top-12 z-10 overflow-hidden rounded-[18px] border border-line bg-white shadow-float">
          {menu === 'open' ? <>
            <button type="button" role="menuitem" onClick={() => { setMenu('closed'); onEdit(); }} className="block min-h-[44px] w-full px-4 text-left text-sm font-bold">Edit</button>
            <button type="button" role="menuitem" onClick={() => setMenu('confirm')} className="block min-h-[44px] w-full px-4 text-left text-sm font-bold text-red-ink">Delete</button>
          </> : <div className="p-3">
            <p className="text-sm font-bold">Delete this idea?</p>
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={remove} disabled={busy} className="min-h-[40px] flex-1 rounded-full bg-red text-sm font-bold text-white">Delete</button>
              <button type="button" onClick={() => setMenu('closed')} className="min-h-[40px] flex-1 rounded-full border border-line text-sm font-bold">Keep</button>
            </div>
          </div>}
        </div>
      )}
    </article>
  );
}

const ACTIVE = new Set(['planning', 'cutting', 'sewing', 'fitting']);

/**
 * My studio overview on phones (Phase S2): My ideas, On your table, and
 * Add to your studio. Desktop keeps the existing overview.
 */
export function MobileOverview() {
  const [, setLocation] = useLocation();
  const ideas = useListIdeas();
  const projects = useListProjects();
  const patterns = useListPatterns();
  const fabrics = useListFabrics();
  const [sheet, setSheet] = useState<{ editing: Idea | null } | null>(null);
  const onTable = (projects.data ?? []).filter(p => ACTIVE.has(p.status));
  const patternName = (id: number | null) => patterns.data?.find(p => p.id === id)?.name;
  const fabricName = (id: number | null) => fabrics.data?.find(f => f.id === id)?.name;
  const count = ideas.data?.length ?? 0;
  return (
    <div className="space-y-7">
      <section aria-labelledby="ideas-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="ideas-title" className="font-display text-[22px] tracking-[-.04em]">My ideas</h2>
          <span className="text-sm text-subtle">{count} idea{count === 1 ? '' : 's'}</span>
        </div>
        <p className="text-sm text-subtle">Things you want to make, from patterns and fabric you already have.</p>
        <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
          <button type="button" onClick={() => setSheet({ editing: null })} aria-label="Add an idea"
            className="flex min-h-[248px] w-[130px] shrink-0 flex-col items-center justify-center gap-2 rounded-[26px] border-2 border-dashed border-subtle/40 font-bold">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white" aria-hidden="true"><Plus size={22} /></span>Add idea
          </button>
          {ideas.isLoading && <Loader2 className="m-auto animate-spin" aria-label="Loading ideas" />}
          {ideas.data?.map(idea => <IdeaCard key={idea.id} idea={idea} onEdit={() => setSheet({ editing: idea })} />)}
        </div>
      </section>

      <section aria-labelledby="table-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="table-title" className="font-display text-[22px] tracking-[-.04em]">On your table</h2>
          <Link href="/projects/new" className="text-sm font-bold text-ink underline">New project</Link>
        </div>
        {onTable.length === 0
          ? <p className="mt-2 rounded-[26px] bg-white p-5 text-sm text-subtle">Nothing on the go. Start a project from an idea, or with New project.</p>
          : (
            <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
              {onTable.map(p => {
                const total = p.stepsTotal ?? 0, done = p.stepsDone ?? 0;
                const meta = [patternName(p.patternId), fabricName(p.fabricId)].filter(Boolean).join(' · ');
                return (
                  <Link key={p.id} href={`/projects/${p.id}`} className="w-[230px] shrink-0 overflow-hidden rounded-[26px] bg-white text-ink no-underline">
                    <Thumb src={p.coverImageUrl} icon={<Spool size={24} />} className="block h-[150px] w-full" />
                    <div className="p-3.5">
                      <h3 className="truncate font-bold">{p.name}</h3>
                      <p className="truncate text-sm text-subtle">{meta || 'No pattern or fabric yet'}</p>
                      <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                        <span className="block h-full rounded-full bg-ink" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                      </span>
                      <p className="mt-1.5 text-xs font-bold">{total ? `${done} of ${total} steps` : 'No steps yet'}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
      </section>

      <section aria-labelledby="add-title">
        <h2 id="add-title" className="font-display text-[22px] tracking-[-.04em]">Add to your studio</h2>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {([['fabric', 'Fabric', 'bg-yellow text-ink'], ['thread', 'Thread', 'bg-blue text-white'], ['pattern', 'Pattern', 'bg-peach text-ink']] as const).map(([kind, label, tone]) => (
            <button key={kind} type="button" onClick={() => setLocation(`/stash/new?kind=${kind}`)}
              className={`flex min-h-[96px] flex-col justify-between rounded-[24px] p-3.5 text-left font-display text-[17px] tracking-[-.03em] ${tone}`}>
              <Plus size={20} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </section>

      {sheet && (
        <Sheet label={sheet.editing ? 'Edit idea' : 'Add an idea'} onClose={() => setSheet(null)}>
          <IdeaForm editing={sheet.editing} onDone={() => setSheet(null)} />
        </Sheet>
      )}
    </div>
  );
}
