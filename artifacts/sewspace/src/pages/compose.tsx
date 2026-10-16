import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createMedia, useCreatePost, useListFabrics, useListPatterns, useListProjects, type Media } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, BookOpen, ImagePlus, Layers, Loader2, Scissors, X } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { VisibilityPicker, type Visibility } from '@/components/visibility';
import { uploadFile } from '@/lib/upload';

const MAX_PHOTOS = 10;
const MAX_CAPTION = 2200;

type PhotoItem = { key: string; preview: string; status: 'uploading' | 'ready' | 'error'; media?: Media; error?: string };

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? (error as Error)?.message ?? fallback;
}

/** Upload, then have the server resize it and strip metadata. */
async function processPhoto(file: File): Promise<Media> {
  const { url } = await uploadFile(file, 'image');
  return createMedia({ objectPath: url.replace(/^\/api\/storage/, '') });
}

/** New post: photos with a caption, or a status. Tags and visibility apply to both. */
export function ComposePage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const client = useQueryClient();
  const create = useCreatePost();
  const projects = useListProjects();
  const patterns = useListPatterns();
  const fabrics = useListFabrics();
  const fileInput = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<'photo' | 'status'>(params.get('type') === 'status' ? 'status' : 'photo');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [projectId, setProjectId] = useState<number | null>(Number(params.get('make')) || null);
  const [patternId, setPatternId] = useState<number | null>(null);
  const [fabricId, setFabricId] = useState<number | null>(null);

  // Tagging a make brings its pattern and fabric along, unless already chosen.
  const make = useMemo(() => projects.data?.find(p => p.id === projectId), [projects.data, projectId]);
  useEffect(() => {
    if (!make) return;
    setPatternId(current => current ?? make.patternId ?? null);
    setFabricId(current => current ?? make.fabricId ?? null);
  }, [make]);
  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    Array.from(files).slice(0, room).forEach(file => {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setPhotos(current => [...current, { key, preview: URL.createObjectURL(file), status: 'uploading' }]);
      processPhoto(file)
        .then(media => setPhotos(current => current.map(p => p.key === key ? { ...p, status: 'ready', media } : p)))
        .catch(error => setPhotos(current => current.map(p => p.key === key ? { ...p, status: 'error', error: errorMessage(error, "That photo didn't upload.") } : p)));
    });
  };
  const move = (index: number, by: number) => setPhotos(current => {
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    return next;
  });
  const remove = (key: string) => setPhotos(current => {
    const item = current.find(p => p.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    return current.filter(p => p.key !== key);
  });

  const uploading = photos.some(p => p.status === 'uploading');
  const readyMedia = photos.filter(p => p.status === 'ready' && p.media).map(p => p.media!.id);
  const canPost = !create.isPending && !uploading && (kind === 'photo' ? readyMedia.length > 0 : caption.trim().length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost) return;
    create.mutate({
      data: { kind, caption: caption.trim(), visibility, mediaIds: kind === 'photo' ? readyMedia : [], projectId, patternId, fabricId },
    }, {
      onSuccess: post => {
        client.invalidateQueries({ queryKey: FEED_KEYS.all });
        setLocation(`/posts/${post.id}`);
      },
    });
  };

  const select = (label: string, Icon: typeof Scissors, value: number | null, set: (v: number | null) => void, options: Array<{ id: number; name: string }> | undefined) => (
    <label className="flex min-h-[56px] items-center gap-3 border-b border-line last:border-0">
      <Icon size={18} aria-hidden="true" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <select value={value ?? ''} onChange={e => set(e.target.value ? Number(e.target.value) : null)} className="max-w-[60%] rounded-full border border-ink bg-white px-3 py-1.5 text-sm font-semibold">
        <option value="">None</option>
        {options?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-[620px] space-y-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Post type" className="flex flex-1 gap-1 rounded-full bg-white p-1">
          {(['photo', 'status'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={`min-h-[44px] flex-1 rounded-full text-sm font-bold ${kind === k ? 'bg-ink text-white' : 'text-ink'}`}>{k === 'photo' ? 'Photos' : 'Status'}</button>
          ))}
        </div>
        <button type="submit" disabled={!canPost} className="btn btn-primary min-w-[96px] disabled:opacity-50" data-testid="button-post">
          {create.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Post
        </button>
      </div>

      {kind === 'photo' && (
        <section className="rounded-[24px] bg-white p-3" aria-label="Photos">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <div key={p.key} className="relative h-[130px] w-[104px] shrink-0 overflow-hidden rounded-[16px] bg-line">
                <img src={p.preview} alt={`Photo ${i + 1}`} className={`h-full w-full object-cover ${p.status === 'uploading' ? 'opacity-60' : ''}`} />
                {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-yellow px-2 text-[10px] font-bold">Cover</span>}
                <button type="button" onClick={() => remove(p.key)} aria-label={`Remove photo ${i + 1}`} className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-ink/75 text-white"><X size={14} /></button>
                {p.status === 'uploading' && <span className="absolute inset-0 grid place-items-center" role="status" aria-label="Processing photo"><Loader2 className="animate-spin" /></span>}
                {p.status === 'error' && <span className="absolute inset-x-1 bottom-1 rounded-lg bg-red px-1.5 py-1 text-[10px] font-bold text-white" role="alert">{p.error}</span>}
                {p.status === 'ready' && photos.length > 1 && (
                  <span className="absolute inset-x-1 bottom-1 flex justify-between">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`} className="grid h-8 w-8 place-items-center rounded-full bg-white/90 disabled:invisible"><ArrowLeft size={14} /></button>
                    <button type="button" disabled={i === photos.length - 1} onClick={() => move(i, 1)} aria-label={`Move photo ${i + 1} later`} className="grid h-8 w-8 place-items-center rounded-full bg-white/90 disabled:invisible"><ArrowRight size={14} /></button>
                  </span>
                )}
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => fileInput.current?.click()} aria-label="Add photos" className="grid h-[130px] w-[104px] shrink-0 place-items-center rounded-[16px] border-2 border-dashed border-subtle/40 bg-canvas" data-testid="button-add-photos">
                <ImagePlus size={24} aria-hidden="true" />
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          <p className="mt-2 text-xs text-subtle">{photos.length} of {MAX_PHOTOS} photos · resized automatically, and location data removed</p>
        </section>
      )}

      <label className="block rounded-[24px] bg-white px-3.5 py-3">
        <span className="block text-xs font-bold text-subtle">{kind === 'photo' ? 'Caption' : 'What’s on your table?'}</span>
        <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0, MAX_CAPTION))} rows={kind === 'status' ? 6 : 3}
          placeholder={kind === 'photo' ? 'Tell people about it: fabric, alterations, what you’d change.' : 'A question, a win, a work in progress…'}
          className="mt-1 w-full resize-none border-0 bg-transparent text-[16px] leading-relaxed outline-none" data-testid="input-caption" />
        <span className="block text-right text-xs text-subtle">{caption.length}/{MAX_CAPTION}</span>
      </label>

      <section className="rounded-[24px] bg-white px-3.5 py-1.5" aria-label="Tags">
        {select('Make', Scissors, projectId, setProjectId, projects.data)}
        {select('Pattern', BookOpen, patternId, setPatternId, patterns.data)}
        {select('Fabric', Layers, fabricId, setFabricId, fabrics.data)}
      </section>
      {(projectId || patternId || fabricId) && <p className="px-3 text-xs text-subtle">Tagged items show on the post only for people who can already see them.</p>}

      <section className="rounded-[24px] bg-white p-3.5">
        <VisibilityPicker value={visibility} onChange={setVisibility} legend="Who can see this post" />
      </section>

      {create.isError && <p role="alert" className="px-3 text-sm font-semibold text-red-ink">{errorMessage(create.error, "That didn't post. Try again.")}</p>}
    </form>
  );
}
