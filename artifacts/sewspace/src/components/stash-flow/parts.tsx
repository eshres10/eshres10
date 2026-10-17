import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpen, Camera, Check, ChevronRight, FileDown, FileText, Grid3x3, Image as ImageIcon, Loader2, Minus, PenLine, Plus, Spool } from 'lucide-react';
import { colourName, PALETTE } from '@/lib/colours';

export type StashKind = 'fabric' | 'thread' | 'pattern';
export type Source = 'camera' | 'photo' | 'hand' | 'pdf' | 'envelope' | 'label';

export const KIND_LABEL: Record<StashKind, string> = { fabric: 'Fabric', thread: 'Thread', pattern: 'Pattern' };
export const KIND_TITLE: Record<StashKind, string> = { fabric: 'Add fabric', thread: 'Add thread', pattern: 'Add a pattern' };
const KIND_ICON: Record<StashKind, typeof Grid3x3> = { fabric: Grid3x3, thread: Spool, pattern: FileText };
const KIND_FILL: Record<StashKind, string> = { fabric: 'bg-yellow', thread: 'bg-blue text-white', pattern: 'bg-peach' };

/** Fabric, Thread or Pattern as three big radio cards. */
export function KindCards({ value, onChange }: { value: StashKind | null; onChange: (k: StashKind) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const kinds: StashKind[] = ['fabric', 'thread', 'pattern'];
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + kinds.length) % kinds.length;
    refs.current[next]?.focus();
    onChange(kinds[next]);
  };
  return (
    <div role="radiogroup" aria-label="What are you adding?" className="grid grid-cols-3 gap-2.5">
      {kinds.map((k, i) => {
        const Icon = KIND_ICON[k];
        const on = value === k;
        return (
          <button key={k} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(k)} onKeyDown={e => onKey(e, i)}
            className={`flex min-h-[112px] flex-col justify-between rounded-[30px] border-[3px] p-4 text-left lg:min-h-[100px] ${on ? `border-ink ${KIND_FILL[k]}` : 'border-transparent bg-white hover:border-line'}`}>
            <Icon size={26} aria-hidden="true" />
            <span className="font-display text-[19px] tracking-[-.04em] lg:text-[17px]">{KIND_LABEL[k]}</span>
          </button>
        );
      })}
    </div>
  );
}

const SOURCES: Record<StashKind, Array<{ id: Source; icon: typeof Camera; title: string; help: string }>> = {
  fabric: [
    { id: 'camera', icon: Camera, title: 'Take a photo', help: 'We pick out the colours' },
    { id: 'photo', icon: ImageIcon, title: 'Choose a photo', help: 'From your camera roll' },
    { id: 'hand', icon: PenLine, title: 'Fill in by hand', help: 'No photo needed' },
  ],
  thread: [
    { id: 'label', icon: Camera, title: 'Photo of the spool label', help: 'We pick out the colour' },
    { id: 'hand', icon: PenLine, title: 'Fill in by hand', help: 'Type it in yourself' },
  ],
  pattern: [
    { id: 'pdf', icon: FileDown, title: 'Upload the pattern PDF', help: 'We fill in name, sizes and fabric needed' },
    { id: 'envelope', icon: Camera, title: 'Photo of the envelope', help: 'For paper patterns; used as the cover' },
    { id: 'hand', icon: PenLine, title: 'Fill in by hand', help: 'Type it in yourself' },
  ],
};

/** Where to start from: the first choice is the main (black) one. */
export function SourceList({ kind, onPick }: { kind: StashKind; onPick: (s: Source) => void }) {
  return (
    <div className="rounded-[30px] bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-subtle">Start from</p>
      <div className="space-y-2">
        {SOURCES[kind].map((s, i) => (
          <button key={s.id} type="button" onClick={() => onPick(s.id)}
            className={`flex min-h-[64px] w-full items-center gap-4 rounded-[24px] p-3 text-left ${i === 0 ? 'bg-ink text-white' : 'border-2 border-line hover:border-ink'}`}>
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] ${i === 0 ? 'bg-yellow text-ink' : 'bg-canvas'}`} aria-hidden="true"><s.icon size={22} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold">{s.title}</span><span className={`block text-sm ${i === 0 ? 'text-white/75' : 'text-subtle'}`}>{s.help}</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Colour as swatches: from the photo when there is one, otherwise a common
 * palette, plus Custom (the browser's colour picker). No hex text field.
 */
export function ColourField({ value, onChange, fromPhoto, labelledBy, highlight }: {
  value: string | null;
  onChange: (hex: string) => void;
  fromPhoto: string[];
  labelledBy: string;
  highlight?: boolean;
}) {
  const custom = useId();
  const swatches = fromPhoto.length ? fromPhoto : PALETTE.slice(0, 8).map(([, h]) => h);
  const isCustom = Boolean(value && !swatches.includes(value));
  return (
    <div>
      <div className="flex items-center gap-3">
        <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-1 flex-wrap gap-2.5">
          {swatches.map(h => (
            <button key={h} type="button" role="radio" aria-checked={value === h} aria-label={colourName(h)} onClick={() => onChange(h)}
              className={`h-11 w-11 rounded-full border-2 ${value === h ? 'border-ink ring-4 ring-yellow' : 'border-line'}`} style={{ backgroundColor: h }} />
          ))}
          <label htmlFor={custom} className={`relative grid h-11 min-w-[44px] cursor-pointer place-items-center rounded-full border-2 px-3 text-sm font-bold ${isCustom ? 'border-ink ring-4 ring-yellow' : 'border-dashed border-subtle/50'}`}
            style={isCustom ? { backgroundColor: value! } : undefined}>
            <span className={isCustom ? 'sr-only' : ''}>Custom</span>
            <input id={custom} type="color" value={value ?? '#7f9cc4'} onChange={e => onChange(e.target.value.toLowerCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Custom colour" />
          </label>
        </div>
        <span className={`shrink-0 text-right text-[15px] font-bold ${highlight ? 'rounded-full bg-yellow/30 px-2' : ''}`}>{value ? colourName(value) : 'No colour yet'}</span>
      </div>
      <p className="mt-2 text-sm text-subtle">{fromPhoto.length ? 'Picked out of your photo.' : 'Common colours, or Custom for an exact match.'}</p>
    </div>
  );
}

/** A number with − and + buttons (fabric length, spools). */
export function Stepper({ label, value, onChange, step, min = 0, unit, labelledBy }: {
  label: string; value: number | null; onChange: (v: number | null) => void; step: number; min?: number; unit?: string; labelledBy?: string;
}) {
  const id = useId();
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="sr-only" id={labelledBy}>{label}</label>
      <div className="flex flex-1 items-baseline gap-1.5">
        <input id={id} inputMode="decimal" value={value ?? ''} placeholder="0"
          onChange={e => { const v = e.target.value.replace(',', '.'); onChange(v === '' ? null : Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : value); }}
          className="w-[5ch] min-w-0 bg-transparent font-display text-[30px] tracking-[-.04em] outline-none" />
        {unit && <span className="font-display text-[22px]">{unit}</span>}
      </div>
      <button type="button" onClick={() => onChange(Math.max(min, round((value ?? 0) - step)))} aria-label={`Less (${label})`} className="grid h-12 w-12 place-items-center rounded-full border-2 border-ink"><Minus size={18} /></button>
      <button type="button" onClick={() => onChange(round((value ?? 0) + step))} aria-label={`More (${label})`} className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white"><Plus size={18} /></button>
    </div>
  );
}

/** One "Here's what we found" row. */
export function FoundRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 rounded-[18px] bg-yellow/15 px-4 py-2">
      <span className="w-[96px] shrink-0 text-subtle">{label}</span>
      <span className="min-w-0 flex-1 font-bold">{value}</span>
    </div>
  );
}

export function ReadingCard({ status, title, children }: { status: 'working' | 'done' | 'failed'; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[30px] bg-white p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full ${status === 'failed' ? 'bg-canvas' : 'bg-yellow'}`} aria-hidden="true">
          {status === 'working' ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
        </span>
        <h2 className="font-display text-xl tracking-[-.04em]">{title}</h2>
      </div>
      {children && <div className="mt-3 space-y-2">{children}</div>}
      {status === 'done' && <p className="mt-3 text-sm text-subtle">Suggestions are highlighted. You can change any of them next.</p>}
    </div>
  );
}

/** "How it will look": the stash card as it will appear (desktop pane). */
export function StashPreview({ kind, name, meta, image, colour, visibility }: {
  kind: StashKind | null; name: string; meta: string; image?: string | null; colour?: string | null; visibility: string;
}) {
  const label = visibility === 'public' ? 'Public' : visibility === 'followers' ? 'Followers' : 'Only me';
  return (
    <div>
      <div className="overflow-hidden rounded-[24px] border border-line bg-white">
        <div className="relative h-[220px] bg-canvas" style={!image && colour ? { backgroundColor: colour } : undefined}>
          {image && <img src={image} alt="" className="h-full w-full object-cover" />}
          {!image && !colour && kind === 'pattern' && <span className="grid h-full place-items-center text-subtle" aria-hidden="true"><BookOpen size={34} /></span>}
          {kind && <span className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-bold ${KIND_FILL[kind]}`}>{KIND_LABEL[kind]}</span>}
          <span className="absolute right-3 top-3 rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{label}</span>
        </div>
        <div className="p-4">
          <p className="truncate font-display text-xl tracking-[-.04em]">{name || 'Untitled'}</p>
          {meta && <p className="mt-0.5 truncate text-sm text-subtle">{meta}</p>}
        </div>
      </div>
      <p className="mt-3 text-sm text-subtle">Drop a photo or a pattern PDF on the Start step to begin from it.</p>
    </div>
  );
}
