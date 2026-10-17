import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateForumTopic, useListCatalog, useListProjects, type ForumBoard, type ForumKind, type ForumTopic, type Media } from '@workspace/api-client-react';
import { ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { BOARDS, errorText, KINDS } from '@/components/forum/parts';
import { processPhoto } from '@/lib/photos';
import { useSheetDirty } from '@/components/social/Sheet';

type Photo = { key: string; preview: string; media?: Media; failed?: boolean };

/** Link a shared pattern/product page by searching for it. */
function PagePicker({ value, onChange }: { value: { id: number; name: string } | null; onChange: (v: { id: number; name: string } | null) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'pattern' | 'product'>('pattern');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const results = useListCatalog({ kind, q: debounced.trim() || undefined }, { query: { enabled: debounced.trim().length > 1 } });
  if (value) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-canvas px-3 py-1.5 font-semibold">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Remove linked page" className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas"><X size={14} /></button>
      </p>
    );
  }
  return (
    <div>
      <div className="flex gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as 'pattern' | 'product')} className="field w-auto" aria-label="Page kind">
          <option value="pattern">Pattern</option><option value="product">Product</option>
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} className="field flex-1" placeholder="Search patterns and products" aria-label="Search pages to link" />
      </div>
      {results.data && debounced.trim().length > 1 && (
        <ul className="mt-1.5 max-h-40 overflow-y-auto rounded-[16px] border border-line">
          {results.data.items.slice(0, 8).map(e => (
            <li key={e.id}><button type="button" onClick={() => onChange({ id: e.id, name: e.name })} className="block min-h-[44px] w-full px-3 text-left text-sm hover:bg-canvas"><b>{e.name}</b>{e.maker && <span className="text-subtle"> · {e.maker}</span>}</button></li>
          ))}
          {!results.data.items.length && <li className="px-3 py-2 text-sm text-subtle">No pages match. You can add one from Patterns & supplies.</li>}
        </ul>
      )}
    </div>
  );
}

/** Start a discussion: type, title, details, board, tags, and type-specific bits (poll, photos). */
export function Composer({ initialKind = 'question', initialBoard, onCreated, onCancel }: {
  initialKind?: ForumKind; initialBoard?: ForumBoard; onCreated: (t: ForumTopic) => void; onCancel: () => void;
}) {
  const client = useQueryClient();
  const create = useCreateForumTopic();
  const projects = useListProjects();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ForumKind>(initialKind);
  const [board, setBoard] = useState<ForumBoard>(initialBoard ?? 'fitting');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [pollDays, setPollDays] = useState<1 | 3 | 7>(3);
  const [page, setPage] = useState<{ id: number; name: string } | null>(null);
  const [makeId, setMakeId] = useState<number | null>(null);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const uploading = photos.some(p => !p.media && !p.failed);
  useSheetDirty(Boolean(title.trim() || body.trim() || tags.trim() || photos.length || options.some(o => o.trim())));

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 10 - photos.length).forEach(file => {
      const key = `${file.name}-${Math.random().toString(36).slice(2)}`;
      setPhotos(c => [...c, { key, preview: URL.createObjectURL(file) }]);
      processPhoto(file)
        .then(media => setPhotos(c => c.map(p => p.key === key ? { ...p, media } : p)))
        .catch(() => setPhotos(c => c.map(p => p.key === key ? { ...p, failed: true } : p)));
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const media = photos.filter(p => p.media).map(p => p.media!.id);
    create.mutate({
      data: {
        kind, board, title, body,
        tags: tags.split(/[,\s]+/).map(t => t.trim()).filter(Boolean),
        catalogId: page?.id ?? null,
        makeId,
        ...(kind === 'poll' ? { pollOptions: options.map(o => o.trim()).filter(Boolean), pollDays } : {}),
        ...(kind === 'show_tell' ? { shareToFeed: shareToFeed || media.length > 0, mediaIds: media } : {}),
      },
    }, {
      onSuccess: topic => { client.invalidateQueries(); onCreated(topic); },
    });
  };

  const k = KINDS[kind];
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-display text-2xl">Start a discussion</h2>
      <fieldset>
        <legend className="text-xs font-semibold">What kind of post?</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(Object.keys(KINDS) as ForumKind[]).map(id => {
            const K = KINDS[id];
            return (
              <label key={id} className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-[16px] border px-3 text-sm font-bold ${kind === id ? 'border-ink bg-yellow' : 'border-line'}`}>
                <input type="radio" name="kind" checked={kind === id} onChange={() => setKind(id)} className="sr-only" /><K.icon size={16} aria-hidden="true" />{K.label}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-subtle">{k.desc}</p>
      </fieldset>
      <label className="block text-xs font-semibold">Title
        <input value={title} onChange={e => setTitle(e.target.value.slice(0, 140))} required minLength={3} className="field mt-1.5"
          placeholder={kind === 'question' ? 'How do I stop linen shifting while I cut?' : kind === 'poll' ? 'Which trouser closure do you trust?' : 'Give it a clear title'} />
      </label>
      <label className="block text-xs font-semibold">Details
        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 10000))} rows={4} className="field mt-1.5 resize-y"
          placeholder={kind === 'question' ? 'Say the fabric, pattern and size, and what you tried.' : ''} />
      </label>

      {kind === 'poll' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Options</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={e => setOptions(c => c.map((x, j) => j === i ? e.target.value.slice(0, 80) : x))} className="field flex-1" placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} />
              {options.length > 2 && <button type="button" onClick={() => setOptions(c => c.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="grid h-12 w-12 place-items-center rounded-full hover:bg-canvas"><X size={16} /></button>}
            </div>
          ))}
          {options.length < 6 && <button type="button" onClick={() => setOptions(c => [...c, ''])} className="btn btn-line"><Plus size={15} aria-hidden="true" />Add option</button>}
          <label className="block text-xs font-semibold">Poll length
            <select value={pollDays} onChange={e => setPollDays(Number(e.target.value) as 1 | 3 | 7)} className="field mt-1.5">
              <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>1 week</option>
            </select>
          </label>
        </fieldset>
      )}

      {kind === 'show_tell' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Photos <span className="font-normal text-subtle">(optional; resized, location data removed)</span></legend>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map(p => (
              <span key={p.key} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[14px] bg-line">
                <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.media ? '' : 'opacity-60'}`} />
                {!p.media && !p.failed && <Loader2 className="absolute inset-0 m-auto animate-spin" aria-label="Processing" />}
                {p.failed && <span className="absolute inset-x-1 bottom-1 rounded bg-red px-1 text-[10px] font-bold text-white">Failed</span>}
                <button type="button" onClick={() => setPhotos(c => c.filter(x => x.key !== p.key))} aria-label="Remove photo" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-ink/75 text-white"><X size={12} /></button>
              </span>
            ))}
            {photos.length < 10 && <button type="button" onClick={() => fileInput.current?.click()} aria-label="Add photos" className="grid h-24 w-20 shrink-0 place-items-center rounded-[14px] border-2 border-dashed border-subtle/40 bg-canvas"><ImagePlus size={20} /></button>}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={shareToFeed || photos.length > 0} disabled={photos.length > 0} onChange={e => setShareToFeed(e.target.checked)} className="h-5 w-5" />
            Also share it to my feed as a public post{photos.length > 0 && ' (needed for photos)'}
          </label>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold">Board
          <select value={board} onChange={e => setBoard(e.target.value as ForumBoard)} className="field mt-1.5">
            {(Object.keys(BOARDS) as ForumBoard[]).map(b => <option key={b} value={b}>{BOARDS[b]}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold">Tags <span className="font-normal text-subtle">(up to 5)</span>
          <input value={tags} onChange={e => setTags(e.target.value)} className="field mt-1.5" placeholder="linen, cutting" />
        </label>
      </div>
      <div className="text-xs font-semibold">Pattern or product <span className="font-normal text-subtle">(optional; shows under Discussions on its page)</span>
        <div className="mt-1.5"><PagePicker value={page} onChange={setPage} /></div>
      </div>
      {projects.data && projects.data.length > 0 && (
        <label className="block text-xs font-semibold">One of your makes <span className="font-normal text-subtle">(optional; only shown to people who can see it)</span>
          <select value={makeId ?? ''} onChange={e => setMakeId(e.target.value ? Number(e.target.value) : null)} className="field mt-1.5">
            <option value="">None</option>
            {projects.data.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {create.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(create.error, "That didn't post. Try again.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={title.trim().length < 3 || uploading || create.isPending} className="btn btn-primary flex-1 disabled:opacity-50">
          {create.isPending && <Loader2 size={15} className="animate-spin" />}{kind === 'question' ? 'Ask' : 'Post'}
        </button>
      </div>
    </form>
  );
}
