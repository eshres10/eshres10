import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSuggestHashtags, type Media } from '@workspace/api-client-react';
import { Check, ChevronLeft, ChevronRight, Globe, Lock, Search, Users } from 'lucide-react';
import type { UploadItem } from '@/components/flow';
import { Sheet, useSheetDirty } from '@/components/social/Sheet';
import { aspectRatio, hashtagAtCaret, parseHashtags, shortCount } from '@/lib/hashtags';
import { normaliseLink } from '@/lib/links';

export type Aspect = '4:5' | '1:1' | 'original';
export type Audience = 'public' | 'followers' | 'private';
export type PhotoItem = UploadItem<Media>;

/** Where a photo can be shown from: the processed image once ready, else the local preview. */
export function photoSrc(item: PhotoItem, thumb = false): string {
  return (thumb ? item.result?.thumbUrl : item.result?.url) ?? item.preview;
}

/** Photos at the chosen shape, one at a time, with arrows and "1 / 3". Dark pane on desktop. */
export function PhotoCarousel({ items, aspect, alts, index, onIndex, className = '' }: {
  items: PhotoItem[];
  aspect: Aspect;
  alts: Record<string, string>;
  index: number;
  onIndex: (i: number) => void;
  className?: string;
}) {
  const at = Math.min(index, items.length - 1);
  const item = items[at];
  if (!item) return null;
  const first = items[0]?.result ?? undefined;
  return (
    <div className={`relative mx-auto w-full ${className}`}>
      <div className="relative mx-auto overflow-hidden rounded-[18px] bg-subtle/30" style={{ aspectRatio: String(aspectRatio(aspect, first)), maxHeight: '100%' }}>
        <img src={photoSrc(item)} alt={alts[item.key] || `Photo ${at + 1}`} className="h-full w-full object-cover" />
        {item.status === 'uploading' && <span className="absolute inset-x-4 bottom-12 h-1.5 overflow-hidden rounded-full bg-white/70"><span className="block h-full bg-yellow" style={{ width: `${Math.max(6, item.progress * 100)}%` }} /></span>}
        {items.length > 1 && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/75 px-2.5 py-0.5 text-xs font-bold text-white">{at + 1} / {items.length}</span>}
      </div>
      {items.length > 1 && <>
        <button type="button" onClick={() => onIndex(Math.max(0, at - 1))} disabled={at === 0} aria-label="Previous photo"
          className="absolute left-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-ink disabled:opacity-40"><ChevronLeft size={20} /></button>
        <button type="button" onClick={() => onIndex(Math.min(items.length - 1, at + 1))} disabled={at === items.length - 1} aria-label="Next photo"
          className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-ink disabled:opacity-40"><ChevronRight size={20} /></button>
      </>}
    </div>
  );
}

const AUDIENCES: Array<{ value: Audience; label: string; help: string; icon: typeof Globe }> = [
  { value: 'public', label: 'Public', help: 'Anyone, even without an account. Shows on hashtag pages.', icon: Globe },
  { value: 'followers', label: 'Followers', help: 'Only people who follow you.', icon: Users },
  { value: 'private', label: 'Only me', help: 'A private log. You can share it later.', icon: Lock },
];

/** "Who can see this?" as three big radio cards. */
export function AudienceCards({ value, onChange, labelledBy, helps }: { value: Audience | null; onChange: (v: Audience) => void; labelledBy: string; helps?: Partial<Record<Audience, string>> }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + AUDIENCES.length) % AUDIENCES.length;
    refs.current[next]?.focus();
    onChange(AUDIENCES[next].value);
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="space-y-2">
      {AUDIENCES.map((a, i) => {
        const on = value === a.value;
        return (
          <button key={a.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on || (value === null && i === 0) ? 0 : -1}
            onClick={() => onChange(a.value)} onKeyDown={e => onKey(e, i)}
            className={`flex min-h-[64px] w-full items-center gap-4 rounded-[24px] border-2 px-4 py-2.5 text-left ${on ? 'border-ink bg-yellow' : 'border-line bg-white hover:border-ink'}`}>
            <a.icon size={22} aria-hidden="true" className="shrink-0" />
            <span><span className="block text-[17px] font-bold">{a.label}</span><span className="block text-sm text-subtle">{helps?.[a.value] ?? a.help}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/** An on/off switch (role="switch"). */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-11 w-[72px] shrink-0 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-subtle/50'}`}>
      <span aria-hidden="true" className={`absolute top-1.5 h-8 w-8 rounded-full transition-all ${checked ? 'left-[34px] bg-yellow' : 'left-1.5 bg-white'}`} />
    </button>
  );
}

/** Pick one of your makes, patterns or fabrics in a sheet. */
export function PickerSheet<T extends { id: number; name: string }>({ title, help, items, value, describe, image, onPick, onClose, empty }: {
  title: string;
  help: string;
  items: T[] | undefined;
  value: number | null;
  describe?: (item: T) => string;
  image?: (item: T) => string | null | undefined;
  onPick: (item: T | null) => void;
  onClose: () => void;
  empty: ReactNode;
}) {
  return (
    <Sheet label={title} onClose={onClose}>
      <h2 className="font-display text-[26px] leading-tight tracking-[-.05em]">{title}</h2>
      <p className="mt-1 text-[15px] text-subtle">{help}</p>
      <div className="mt-4 max-h-[50dvh] space-y-2 overflow-y-auto" role="listbox" aria-label={title}>
        {!items?.length && <p className="rounded-[20px] bg-canvas p-4 text-sm text-subtle">{empty}</p>}
        {items?.map(item => {
          const src = image?.(item);
          return (
            <button key={item.id} type="button" role="option" aria-selected={value === item.id} onClick={() => { onPick(item); onClose(); }}
              className={`flex min-h-[64px] w-full items-center gap-3 rounded-[22px] border-2 p-2 text-left ${value === item.id ? 'border-ink bg-yellow' : 'border-line hover:border-ink'}`}>
              {image && (src ? <img src={src} alt="" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-[14px] bg-canvas" aria-hidden="true" />)}
              <span className="min-w-0"><span className="block truncate text-[17px] font-bold">{item.name}</span>{describe && <span className="block truncate text-sm text-subtle">{describe(item)}</span>}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        {value !== null && <button type="button" onClick={() => { onPick(null); onClose(); }} className="btn btn-line min-h-[52px] flex-1 text-base">Remove tag</button>}
        <button type="button" onClick={onClose} className="btn min-h-[52px] flex-1 bg-ink text-base text-white">Done</button>
      </div>
    </Sheet>
  );
}

/** "Add a link": a pattern shop, blog post or tutorial. Checked like the API does; https:// is added when left out. */
export function LinkSheet({ value, onSave, onClose }: { value: string | null; onSave: (url: string | null) => void; onClose: () => void }) {
  const [text, setText] = useState(value ?? '');
  const [error, setError] = useState('');
  useSheetDirty(text.trim() !== (value ?? ''));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const url = normaliseLink(text);
    if (url === false) return setError('Enter a web address, like example.com/pattern.');
    onSave(url);
    onClose();
  };
  return (
    <Sheet label="Add a link" onClose={onClose}>
      <form onSubmit={save} noValidate>
        <h2 className="font-display text-[26px] leading-tight tracking-[-.05em]">{value ? 'Edit link' : 'Add a link'}</h2>
        <p className="mt-1 text-[15px] text-subtle">Your pattern shop, a blog post or a tutorial. It opens in a new tab.</p>
        <label htmlFor="post-link" className="mt-4 block text-sm font-bold">Web address</label>
        <input id="post-link" data-autofocus type="url" inputMode="url" autoComplete="url" autoCapitalize="off" spellCheck={false}
          value={text} onChange={e => { setText(e.target.value.slice(0, 500)); setError(''); }} placeholder="https://"
          aria-invalid={error ? true : undefined} aria-describedby={error ? 'post-link-error' : undefined} className="field mt-1.5" />
        {error && <p id="post-link-error" className="mt-1.5 text-sm font-semibold text-red-ink">{error}</p>}
        <div className="mt-4 flex gap-2">
          {value && <button type="button" onClick={() => { onSave(null); onClose(); }} className="btn btn-line min-h-[52px] flex-1 text-base">Remove link</button>}
          <button type="submit" className="btn min-h-[52px] flex-1 bg-ink text-base text-white">{value ? 'Save' : 'Add link'}</button>
        </div>
      </form>
    </Sheet>
  );
}

export type ChallengeOption = { slug: string; tag: string; title: string; detail: string; joined: boolean };

/**
 * "Enter a challenge": search the running challenges by tag or title and pick
 * one or more (yours first). Entering joins you, so any running one can be picked.
 */
export function ChallengeSheet({ options, loading, value, onDone, onClose }: {
  options: ChallengeOption[];
  loading: boolean;
  value: string[];
  onDone: (slugs: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(value);
  const [q, setQ] = useState('');
  useSheetDirty(picked.join() !== value.join());
  const needle = q.trim().replace(/^#/, '').toLowerCase();
  const shown = options
    .filter(o => !needle || o.tag.toLowerCase().includes(needle) || o.title.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.joined) - Number(a.joined));
  const toggle = (slug: string) => setPicked(list => (list.includes(slug) ? list.filter(s => s !== slug) : [...list, slug]));
  return (
    <Sheet label="Enter a challenge" onClose={onClose}>
      <h2 className="font-display text-[26px] leading-tight tracking-[-.05em]">Enter a challenge</h2>
      <p className="mt-1 text-[15px] text-subtle">Pick a running challenge. Entering joins you, and the post has to be public.</p>
      <label className="relative mt-4 block">
        <span className="sr-only">Search challenges</span>
        <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by #tag or name" className="field pl-9" autoComplete="off" />
      </label>
      <div className="mt-3 max-h-[45dvh] space-y-2 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label="Running challenges">
        {loading && <p role="status" className="p-4 text-sm text-subtle">Loading challenges…</p>}
        {!loading && !shown.length && (
          <p className="rounded-[20px] bg-canvas p-4 text-sm text-subtle">{options.length ? `No running challenge matches “${q.trim()}”.` : 'No challenges are running right now.'}</p>
        )}
        {shown.map(o => {
          const on = picked.includes(o.slug);
          return (
            <button key={o.slug} type="button" role="option" aria-selected={on} onClick={() => toggle(o.slug)}
              className={`flex min-h-[60px] w-full items-center gap-3 rounded-[22px] border-2 px-3 py-2 text-left ${on ? 'border-ink bg-yellow' : 'border-line hover:border-ink'}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold">#{o.tag}</span>
                <span className="block truncate text-sm text-subtle">{[o.title !== o.tag ? o.title : '', o.detail, o.joined ? 'joined' : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-ink bg-ink text-white' : 'border-line'}`}>{on && <Check size={15} />}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} className="btn btn-line min-h-[52px] flex-1 text-base">Cancel</button>
        <button type="button" onClick={() => { onDone(picked); onClose(); }} className="btn min-h-[52px] flex-1 bg-ink text-base text-white">
          {picked.length ? `Enter ${picked.length === 1 ? '1 challenge' : `${picked.length} challenges`}` : 'Done'}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Hashtag help for the caption: while typing "#lin" it offers matching tags
 * (most used public tags); otherwise tags suggested from the tagged make,
 * pattern, fabric, challenge and your recent posts.
 */
export function useHashtagAssist(caption: string, caret: number, context: { projectId: number | null; patternId: number | null; fabricId: number | null; challenge?: string }) {
  const typing = hashtagAtCaret(caption, caret);
  const prefix = typing && typing.prefix.length >= 1 ? typing.prefix : null;
  const [debounced, setDebounced] = useState(prefix);
  useEffect(() => { const t = setTimeout(() => setDebounced(prefix), 150); return () => clearTimeout(t); }, [prefix]);
  const used = parseHashtags(caption);
  const params = debounced
    ? { q: debounced }
    : { ...(context.projectId ? { projectId: context.projectId } : {}), ...(context.patternId ? { patternId: context.patternId } : {}), ...(context.fabricId ? { fabricId: context.fabricId } : {}), ...(context.challenge ? { challenge: context.challenge } : {}) };
  const query = useSuggestHashtags(params, { query: { staleTime: 30_000, placeholderData: prev => prev } });
  const list = debounced ? query.data ?? [] : (query.data ?? []).filter(t => !used.includes(t.tag));
  return { typing: debounced ? typing : null, matching: Boolean(debounced), list, used };
}

/** Insert a tag: replace the word being typed, or add it at the end. Returns the new caption and caret. */
export function insertHashtag(caption: string, caret: number, tag: string): { caption: string; caret: number } {
  const typing = hashtagAtCaret(caption, caret);
  if (typing) {
    const next = `${caption.slice(0, typing.start)}#${tag} ${caption.slice(typing.end).replace(/^ /, '')}`;
    return { caption: next.slice(0, 2200), caret: typing.start + tag.length + 2 };
  }
  const sep = caption && !/\s$/.test(caption) ? ' ' : '';
  const next = `${caption}${sep}#${tag} `.slice(0, 2200);
  return { caption: next, caret: next.length };
}

export function tagLabel(posts: number) {
  return shortCount(posts);
}
