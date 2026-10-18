import { useState, type ReactNode } from 'react';
import { Download, FileText, Globe, Loader2, Lock, Pencil, Trash2, Users } from 'lucide-react';
import { Link } from 'wouter';
import { Sheet } from '@/components/social/Sheet';
import type { AnyRecord } from '@/lib/types';

// Shared pieces for the studio lists on phones (Phase S3/S4). Generic props take
// their type from `value` (NoInfer elsewhere), so JSX never needs <Comp<T>>.

/** "Only me" / "Followers" / "Public" over a photo, as in the mockups. */
export function PrivacyBadge({ value }: { value: string | null | undefined }) {
  const [Icon, label] = value === 'public' ? [Globe, 'Public'] : value === 'followers' ? [Users, 'Followers'] : [Lock, 'Only me'];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-1 text-[11px] font-bold text-white">
      <Icon size={11} aria-hidden="true" />{label}
    </span>
  );
}

/** A plain-text file of an item's details (also used by the desktop lists). */
export function downloadDetails(item: AnyRecord, title: string, fallback: string) {
  const omitted = new Set(['id', 'userId', 'isDemo', 'createdAt', 'updatedAt', 'imageUrl', 'coverImageUrl', 'pdfUrl']);
  const details = Object.entries(item)
    .filter(([key, value]) => !omitted.has(key) && value != null && value !== '')
    .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n');
  const url = URL.createObjectURL(new Blob([`${title}\n${'='.repeat(title.length)}\n\n${details}\n`], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || fallback}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

const row = 'flex min-h-[52px] w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-bold text-ink no-underline hover:bg-canvas';

/**
 * Everything the desktop card menu offers, as a sheet: edit (the Add to stash
 * flow, which also holds who can see it), downloads, the shared page link and
 * delete (asks twice).
 */
export function ItemActions({ title, editHref, imageUrl, pdf, item, fallbackName, catalog, onDelete, deleting, onClose }: {
  title: string; editHref: string; imageUrl?: string | null; pdf?: { url: string; fileName: string } | null; item: AnyRecord; fallbackName: string;
  catalog?: ReactNode; onDelete: () => void; deleting: boolean; onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet label={title} onClose={onClose}>
      <h2 className="mb-2 truncate px-1 font-display text-[22px] tracking-[-.04em]">{title}</h2>
      <Link href={editHref} className={row}><Pencil size={18} aria-hidden="true" />Edit</Link>
      {imageUrl && <a href={imageUrl} download={`${title}-photo`} className={row}><Download size={18} aria-hidden="true" />Download photo</a>}
      {pdf && <a href={pdf.url} download={pdf.fileName} className={row}><Download size={18} aria-hidden="true" />Download PDF</a>}
      <button type="button" onClick={() => downloadDetails(item, title, fallbackName)} className={row}><FileText size={18} aria-hidden="true" />Download details</button>
      {catalog && <div className="px-3 py-2">{catalog}</div>}
      <button type="button" onClick={() => (confirm ? onDelete() : setConfirm(true))} disabled={deleting} aria-live="polite"
        className={`${row} ${confirm ? 'bg-red text-white hover:bg-red' : 'text-red-ink'}`}>
        {deleting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
        {confirm ? 'Tap again to delete' : 'Delete'}
      </button>
    </Sheet>
  );
}

/** A horizontal row of filter chips (aria-pressed). */
export function FilterChips<T extends string>({ label, options, value, onChange }: {
  label: string; options: Array<{ value: NoInfer<T>; label: string }>; value: T; onChange: (v: NoInfer<T>) => void;
}) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-1">
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-[44px] shrink-0 rounded-full px-4 text-[15px] font-bold ${value === o.value ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A two-option pill toggle (m / yd, cm / in, wall / list). */
export function Toggle<T extends string>({ label, options, value, onChange }: {
  label: string; options: Array<{ value: NoInfer<T>; label: ReactNode; name?: string }>; value: T; onChange: (v: NoInfer<T>) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-1 rounded-full bg-white p-1">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.name} onClick={() => onChange(o.value)}
          className={`grid h-9 min-w-[40px] place-items-center rounded-full px-3 text-sm font-bold ${value === o.value ? 'bg-ink text-white' : 'text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
