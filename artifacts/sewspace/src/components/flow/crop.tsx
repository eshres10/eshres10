import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Loader2, Minus, Plus } from 'lucide-react';
import { markPrepared } from '@/lib/upload';
import { Segmented } from './choices';
import { useModal } from './modal';

export type CropAspect = '1:1' | '4:5' | 'original';
const ASPECTS: Array<{ value: CropAspect; label: string }> = [
  { value: '1:1', label: 'Square' },
  { value: '4:5', label: '4:5' },
  { value: 'original', label: 'Whole photo' },
];
const MAX_PX = 1600;
const MAX_ZOOM = 4;

type Source = { canvas: HTMLCanvasElement; url: string; width: number; height: number };

/** Decode once, upright (EXIF orientation applied) and at most 1600 px, for both display and output. */
async function loadSource(file: File): Promise<Source> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return { canvas, url: blob ? URL.createObjectURL(blob) : '', width: canvas.width, height: canvas.height };
}

/**
 * Crop a photo before it uploads: drag to move, pinch, scroll or the slider to
 * zoom, arrow keys to nudge. The result is cut and re-encoded here (WebP, at
 * most 1600 px, no EXIF/GPS), so the upload doesn't resize it again.
 */
export function PhotoCropper({ file, initialAspect = '1:1', onDone, onCancel }: {
  file: File;
  initialAspect?: CropAspect;
  onDone: (cropped: File) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useModal(dialog, onCancel);
  const area = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState<CropAspect>(initialAspect);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    let url = '';
    loadSource(file).then(s => { url = s.url; setSource(s); }).catch(() => setFailed(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file]);

  // Space for the frame.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ratio = !source ? 1 : aspect === '1:1' ? 1 : aspect === '4:5' ? 4 / 5 : source.width / source.height;
  const frame = (() => {
    const w = Math.min(box.w, box.h * ratio);
    return { w, h: w / ratio };
  })();
  const scale = source ? Math.max(frame.w / source.width, frame.h / source.height) * zoom : 1;
  const shown = { w: (source?.width ?? 0) * scale, h: (source?.height ?? 0) * scale };
  const clamp = useCallback((x: number, y: number, w = shown.w, h = shown.h) => ({
    x: Math.min(0, Math.max(frame.w - w, x)),
    y: Math.min(0, Math.max(frame.h - h, y)),
  }), [frame.w, frame.h, shown.w, shown.h]);

  // Centre the photo whenever the frame or the photo changes.
  useEffect(() => {
    if (!source) return;
    setZoom(1);
    const s = Math.max(frame.w / source.width, frame.h / source.height);
    setOffset({ x: (frame.w - source.width * s) / 2, y: (frame.h - source.height * s) / 2 });
  }, [source, aspect, frame.w, frame.h]);

  // Zoom around the frame's centre.
  const zoomTo = (next: number) => {
    if (!source) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const base = Math.max(frame.w / source.width, frame.h / source.height);
    const cx = (frame.w / 2 - offset.x) / scale, cy = (frame.h / 2 - offset.y) / scale;
    const s = base * z;
    setZoom(z);
    setOffset(clamp(frame.w / 2 - cx * s, frame.h / 2 - cy * s, source.width * s, source.height * s));
  };

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance));
      return;
    }
    setOffset(o => clamp(o.x + e.clientX - last.x, o.y + e.clientY - last.y));
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); setOffset(o => clamp(o.x + moves[e.key][0], o.y + moves[e.key][1])); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(zoom + 0.25); }
    if (e.key === '-') { e.preventDefault(); zoomTo(zoom - 0.25); }
  };

  const finish = async () => {
    if (!source) return;
    setBusy(true);
    const sx = -offset.x / scale, sy = -offset.y / scale, sw = frame.w / scale, sh = frame.h / scale;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw));
    out.height = Math.max(1, Math.round(sh));
    out.getContext('2d')!.drawImage(source.canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/webp', 0.85));
    setBusy(false);
    if (!blob) { onDone(file); return; }
    const type = blob.type || 'image/webp';
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${type === 'image/webp' ? 'webp' : 'png'}`;
    onDone(markPrepared(new File([blob], name, { type })));
  };

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="crop-title"
      className="fixed inset-0 z-[70] flex flex-col bg-ink text-white lg:items-center lg:justify-center lg:bg-ink/80 lg:p-6">
      <div className="flex min-h-0 flex-1 flex-col lg:max-h-[min(860px,calc(100dvh-48px))] lg:w-full lg:max-w-[640px] lg:flex-none lg:rounded-[34px] lg:bg-ink">
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(.75rem+env(safe-area-inset-top))] lg:pt-3">
          <button type="button" onClick={onCancel} className="min-h-[48px] rounded-full px-4 font-bold">Cancel</button>
          <h2 id="crop-title" className="flex-1 text-center font-display text-xl tracking-[-.04em]">Crop photo</h2>
          <button type="button" onClick={finish} disabled={!source || busy} className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full bg-yellow px-5 font-bold text-ink disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}Use photo
          </button>
        </div>
        <div ref={area} className="relative mx-3 min-h-[240px] flex-1 lg:h-[520px] lg:flex-none">
          {!source && !failed && <p className="absolute inset-0 grid place-items-center text-white/70"><Loader2 className="animate-spin" aria-label="Opening photo" /></p>}
          {failed && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <p>This photo can't be cropped here.<br />
                <button type="button" onClick={() => onDone(file)} className="mt-3 min-h-[48px] rounded-full bg-white px-5 font-bold text-ink">Use it as it is</button>
              </p>
            </div>
          )}
          {source && frame.w > 0 && (
            <div tabIndex={0} role="application" aria-roledescription="crop frame" aria-label="Photo crop. Drag or use the arrow keys to move the photo; plus and minus zoom."
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              onWheel={e => zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))} onKeyDown={onKeyDown}
              className="absolute left-1/2 top-1/2 cursor-grab touch-none overflow-hidden rounded-[18px] outline-none ring-yellow focus-visible:ring-4 active:cursor-grabbing"
              style={{ width: frame.w, height: frame.h, transform: 'translate(-50%, -50%)' }}>
              <img src={source.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
                style={{ width: shown.w, height: shown.h, left: offset.x, top: offset.y }} />
              {/* Thirds, to help frame the shot */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-white/80"
                style={{ backgroundImage: 'linear-gradient(to right, transparent calc(33.33% - .5px), rgb(255 255 255 / .35) calc(33.33% - .5px), rgb(255 255 255 / .35) calc(33.33% + .5px), transparent calc(33.33% + .5px), transparent calc(66.66% - .5px), rgb(255 255 255 / .35) calc(66.66% - .5px), rgb(255 255 255 / .35) calc(66.66% + .5px), transparent calc(66.66% + .5px)), linear-gradient(to bottom, transparent calc(33.33% - .5px), rgb(255 255 255 / .35) calc(33.33% - .5px), rgb(255 255 255 / .35) calc(33.33% + .5px), transparent calc(33.33% + .5px), transparent calc(66.66% - .5px), rgb(255 255 255 / .35) calc(66.66% - .5px), rgb(255 255 255 / .35) calc(66.66% + .5px), transparent calc(66.66% + .5px))' }} />
            </div>
          )}
        </div>
        <div className="shrink-0 space-y-3 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-ink">
          <div className="flex items-center gap-3 text-white">
            <button type="button" onClick={() => zoomTo(zoom - 0.25)} aria-label="Zoom out" className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><Minus size={18} /></button>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => zoomTo(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-yellow" />
            <button type="button" onClick={() => zoomTo(zoom + 0.25)} aria-label="Zoom in" className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><Plus size={18} /></button>
          </div>
          <Segmented aria-label="Shape" options={ASPECTS} value={aspect} onChange={value => setAspect(value as CropAspect)} />
        </div>
      </div>
    </div>
  );
}
