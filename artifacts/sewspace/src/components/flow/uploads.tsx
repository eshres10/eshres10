import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import type { UploadOptions } from '@/lib/upload';

export type UploadStatus = 'uploading' | 'done' | 'error';

export interface UploadItem<R> {
  key: string;
  /** Shown right away: an object URL for a new file, or the stored URL for one already uploaded. */
  preview: string;
  file?: File;
  status: UploadStatus;
  /** 0..1 */
  progress: number;
  result?: R;
  error?: string;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function message(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "That didn't upload. Check your connection and try again.";
}

/**
 * Files that upload in the background while the person carries on. Each one
 * shows a preview straight away, a progress bar, and on failure an error with
 * Retry. Only the final submit waits for them (`waitAll`).
 */
export function useUploads<R>(process: (file: File, options: UploadOptions) => Promise<R>, { max = 10, accept = IMAGE_TYPES }: { max?: number; accept?: readonly string[] } = {}) {
  const [items, setItems] = useState<Array<UploadItem<R>>>([]);
  const ref = useRef(items);
  ref.current = items;
  const controllers = useRef(new Map<string, AbortController>());
  const waiters = useRef<Array<() => void>>([]);
  const processRef = useRef(process);
  processRef.current = process;

  const patch = useCallback((key: string, next: Partial<UploadItem<R>>) => {
    setItems(list => list.map(i => (i.key === key ? { ...i, ...next } : i)));
  }, []);

  const start = useCallback((key: string, file: File) => {
    const controller = new AbortController();
    controllers.current.set(key, controller);
    patch(key, { status: 'uploading', progress: 0, error: undefined });
    // Bytes going up are most of the wait; server processing is the last 10%.
    processRef.current(file, { signal: controller.signal, onProgress: f => patch(key, { progress: Math.min(0.9, f * 0.9) }) })
      .then(result => { if (!controller.signal.aborted) patch(key, { status: 'done', progress: 1, result }); })
      .catch(e => { if (!controller.signal.aborted) patch(key, { status: 'error', error: message(e) }); })
      .finally(() => controllers.current.delete(key));
  }, [patch]);

  /** Add files. Returns a message about any that were left out (wrong type, over the limit). */
  const add = useCallback((files: Iterable<File>): string | null => {
    const room = max - ref.current.length;
    const list = Array.from(files);
    const usable = list.filter(f => accept.includes(f.type));
    const taken = usable.slice(0, Math.max(0, room));
    const added = taken.map(file => ({ key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '', file, status: 'uploading' as const, progress: 0 }));
    setItems(current => [...current, ...added]);
    added.forEach(i => start(i.key, i.file));
    if (usable.length < list.length) return 'Some files were left out: use JPG, PNG, WebP or GIF.';
    if (taken.length < usable.length) return `You can add up to ${max}.`;
    return null;
  }, [accept, max, start]);

  /** Already-uploaded items (a resumed draft, or editing). */
  const seed = useCallback((done: Array<{ key: string; preview: string; result: R }>) => {
    setItems(done.map(d => ({ ...d, status: 'done' as const, progress: 1 })));
  }, []);

  const retry = useCallback((key: string) => {
    const item = ref.current.find(i => i.key === key);
    if (item?.file) start(key, item.file);
  }, [start]);

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    const item = ref.current.find(i => i.key === key);
    if (item?.file && item.preview) URL.revokeObjectURL(item.preview);
    setItems(list => list.filter(i => i.key !== key));
  }, []);

  const move = useCallback((key: string, by: number) => {
    setItems(list => {
      const from = list.findIndex(i => i.key === key);
      const to = from + by;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);

  const pending = items.some(i => i.status === 'uploading');
  const failed = items.filter(i => i.status === 'error').length;

  useEffect(() => {
    if (pending) return;
    const ready = waiters.current;
    waiters.current = [];
    ready.forEach(r => r());
  }, [pending]);

  // Abort anything still going up when the flow closes.
  useEffect(() => () => { controllers.current.forEach(c => c.abort()); }, []);

  /** Resolves once nothing is uploading. Then check `failed` before submitting. */
  const waitAll = useCallback(() => new Promise<Array<UploadItem<R>>>(resolve => {
    const done = () => resolve(ref.current);
    if (!ref.current.some(i => i.status === 'uploading')) done();
    else waiters.current.push(() => setTimeout(done, 0));
  }), []);

  return { items, add, seed, retry, remove, move, pending, failed, waitAll, results: items.filter(i => i.status === 'done').map(i => i.result as R) };
}

/** One upload: preview, progress bar, remove, and an inline error with Retry. */
export function UploadTile<R>({ item, onRemove, onRetry, label = 'photo', className = 'h-24 w-20' }: {
  item: UploadItem<R>;
  onRemove: () => void;
  onRetry: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-[16px] bg-line ${className}`}>
      {item.preview && <img src={item.preview} alt="" className={`h-full w-full object-cover ${item.status === 'done' ? '' : 'opacity-60'}`} />}
      {item.status === 'uploading' && (
        <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-label={`Uploading ${label}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
          <div className="h-full rounded-full bg-yellow transition-[width]" style={{ width: `${Math.max(6, item.progress * 100)}%` }} />
        </div>
      )}
      {item.status === 'error' && (
        <button type="button" onClick={onRetry} className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/85 px-1 text-center text-[11px] font-bold leading-tight text-red-ink">
          <RotateCw size={16} aria-hidden="true" />Didn't upload<span className="underline">Retry</span>
          <span className="sr-only">{`: ${item.error}`}</span>
        </button>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="absolute right-0 top-0 grid h-11 w-11 place-items-start justify-items-end p-1.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink/75 text-white"><X size={13} aria-hidden="true" /></span>
      </button>
    </div>
  );
}
