import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  analyzePatternPdf,
  createFabric,
  createPattern,
  createThread,
  setCatalogLink,
  updateFabric,
  updatePattern,
  updateThread,
  useGetProfile,
  useListCatalog,
  type Fabric,
  type Pattern,
  type Thread,
} from '@workspace/api-client-react';
import { BookOpen, Check, Crop, FileText, ImagePlus } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  ChoiceChips,
  DraftNotice,
  FieldCard,
  FlowShell,
  PhotoCropper,
  UploadTile,
  Segmented,
  draftLabel,
  fieldProps,
  groupProps,
  useDraft,
  useFlowStep,
  useLeaveGuard,
  useUploads,
  useValidation,
} from '@/components/flow';
import { AudienceCards, type Audience } from '@/components/post-flow/parts';
import { GARMENTS } from '@/components/projects/QuickStart';
import { uploadFile } from '@/lib/upload';
import { takeHandedOverFile } from '@/lib/pending-file';
import { ColourField, FoundRow, KIND_LABEL, KIND_TITLE, KindCards, ReadingCard, SourceList, StashPreview, Stepper, type Source, type StashKind } from './parts';

const STEPS = ['start', 'details', 'more', 'save'] as const;
type Step = (typeof STEPS)[number];
const LABELS: Record<Step, string> = { start: 'Start', details: 'Details', more: 'More', save: 'Save' };

const FABRIC_TYPES = ['linen', 'cotton', 'denim', 'silk', 'knit', 'wool', 'other'] as const;
const THREAD_TYPES = [['all-purpose', 'All-purpose'], ['topstitch', 'Topstitch'], ['serger', 'Overlocker'], ['embroidery', 'Embroidery'], ['other', 'Other']] as const;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const STATUSES = [['want_to_make', 'Want to make'], ['purchased', 'Bought'], ['made', 'Made it'], ['favorite', 'Favourite']] as const;
const FORMATS = [['pdf', 'PDF'], ['paper', 'Paper'], ['traced', 'Traced copy']] as const;
const WIDTHS = ['110', '140', '150', 'other'] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Form {
  name: string; type: string | null; colorHex: string | null; colorName: string;
  quantity: number | null; unit: 'm' | 'yd'; width: string | null; widthOther: string;
  weight: string; stretch: string; composition: string; notes: string;
  brand: string; designer: string; garmentType: string | null; difficulty: string | null; sizes: string;
  status: string; format: string | null; catalogId: number | null;
  requiredFabric: string; yardage: number | null; recommendedFabrics: string; seamAllowance: string; instructions: string; steps: string[] | null;
  visibility: Audience;
}

const EMPTY: Form = {
  name: '', type: null, colorHex: null, colorName: '', quantity: null, unit: 'm', width: null, widthOther: '',
  weight: '', stretch: '', composition: '', notes: '', brand: '', designer: '', garmentType: null, difficulty: null, sizes: '',
  status: 'want_to_make', format: null, catalogId: null, requiredFabric: '', yardage: null, recommendedFabrics: '', seamAllowance: '', instructions: '', steps: null,
  visibility: 'private',
};

interface StashDraft extends Record<string, unknown> {
  kind: StashKind | null; source: Source | null; form: Form; photoUrl: string | null; pdfUrl: string | null; pdfFileName: string | null;
  found: string[]; reached: number;
}

export type StashItem = { kind: 'fabric'; item: Fabric } | { kind: 'thread'; item: Thread } | { kind: 'pattern'; item: Pattern };

function fromItem(e: StashItem): Form {
  if (e.kind === 'fabric') {
    const f = e.item;
    const w = f.width ? String(f.width) : null;
    return { ...EMPTY, name: f.name, type: f.type || null, colorHex: f.colorHex ?? null, colorName: f.color, quantity: f.quantity ?? null,
      unit: /^y/i.test(f.unit ?? '') ? 'yd' : 'm', width: w && WIDTHS.includes(w as never) ? w : w ? 'other' : null, widthOther: w && !WIDTHS.includes(w as never) ? w : '',
      weight: f.weight ?? '', stretch: f.stretch ?? '', composition: f.composition ?? '', notes: f.notes ?? '', visibility: f.visibility as Audience };
  }
  if (e.kind === 'thread') {
    const t = e.item;
    return { ...EMPTY, colorName: t.colorName, colorHex: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color.toLowerCase() : null, type: t.type || null, quantity: t.quantity ?? null,
      brand: t.brand, weight: t.weight ?? '', notes: t.notes ?? '', visibility: t.visibility as Audience };
  }
  const p = e.item;
  return { ...EMPTY, name: p.name, designer: p.designer ?? '', garmentType: p.garmentType || null, difficulty: p.difficulty || null, sizes: p.sizes ?? '',
    status: p.status, format: p.format ?? null, catalogId: p.catalogId ?? null, notes: p.notes ?? '', requiredFabric: p.requiredFabric ?? '', yardage: p.yardage ?? null,
    recommendedFabrics: p.recommendedFabrics ?? '', seamAllowance: p.seamAllowance ?? '', instructions: p.instructions ?? '', steps: p.steps ?? null, visibility: p.visibility as Audience };
}

function errorText(e: unknown, fallback: string) {
  return (e as { data?: { error?: string } })?.data?.error ?? fallback;
}

/**
 * Add to stash (/stash/new?kind=fabric|thread|pattern) and edit
 * (/stash/:kind/:id/edit): Start → Details → More → Save, then Done. A photo is
 * cropped first, then uploads in the background while you carry on; a pattern
 * PDF fills empty fields with the existing PDF reader. Everything starts private.
 */
export function StashFlow({ editing, initialKind = null, onRestart }: { editing?: StashItem; initialKind?: StashKind | null; onRestart?: () => void }) {
  const isEdit = Boolean(editing);
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const me = useGetProfile();
  const [kind, setKind] = useState<StashKind | null>(editing?.kind ?? initialKind);
  const [source, setSource] = useState<Source | null>(null);
  const [form, setForm] = useState<Form>(() => (editing ? fromItem(editing) : EMPTY));
  // Photo being cropped, and the last original (for "Adjust crop").
  const [cropping, setCropping] = useState<File | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [reading, setReading] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(editing?.kind === 'pattern' && editing.item.pdfUrl ? { url: editing.item.pdfUrl, name: editing.item.pdfFileName ?? 'Pattern PDF' } : null);
  const [reached, setReached] = useState(isEdit ? STEPS.length - 1 : 0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; kind: StashKind; name: string } | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setFound(list => list.filter(k => k !== key));
  };

  const editImage = editing ? (editing.kind === 'pattern' ? editing.item.coverImageUrl : editing.item.imageUrl) : null;
  const photo = useUploads<string>((file, options) => uploadFile(file, 'image', options).then(r => r.url), { max: 1 });
  const pdfUpload = useUploads<string>((file, options) => uploadFile(file, 'pattern_pdf', options).then(r => r.url), { max: 1, accept: ['application/pdf'] });
  const photoUrl = photo.results[0] ?? null;
  useEffect(() => { if (editImage) photo.seed([{ key: 'existing', preview: editImage, result: editImage }]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft (new items only).
  const dirty = isEdit ? JSON.stringify(form) !== JSON.stringify(fromItem(editing!)) || photoUrl !== (editImage ?? null)
    : Boolean(form.name.trim() || form.colorName.trim() || form.type || photo.items.length || pdf);
  const payload: StashDraft = { kind, source, form, photoUrl, pdfUrl: pdf?.url ?? null, pdfFileName: pdf?.name ?? null, found, reached };
  const [hydrated, setHydrated] = useState(isEdit);
  const draft = useDraft('stash', payload, { enabled: !isEdit, active: hydrated && dirty && !done });
  if (!hydrated && draft.loaded !== undefined) {
    const d = draft.loaded?.payload as StashDraft | undefined;
    if (d && (!initialKind || d.kind === initialKind)) {
      setKind(d.kind ?? initialKind);
      setSource(d.source ?? null);
      setForm({ ...EMPTY, ...d.form });
      setFound(d.found ?? []);
      setReached(Math.min(d.reached ?? 0, STEPS.length - 1));
      if (d.photoUrl) photo.seed([{ key: 'draft', preview: d.photoUrl, result: d.photoUrl }]);
      if (d.pdfUrl) setPdf({ url: d.pdfUrl, name: d.pdfFileName ?? 'Pattern PDF' });
      if (d.pdfUrl) setReading('done');
    }
    setHydrated(true);
  }
  // Fabric amounts start in the person's own units.
  useEffect(() => { if (!isEdit && me.data?.units === 'imperial') setForm(f => (f.quantity === null ? { ...f, unit: 'yd' } : f)); }, [me.data?.units]); // eslint-disable-line react-hooks/exhaustive-deps

  const canOpen = (s: Step) => isEdit || STEPS.indexOf(s) <= reached;
  const flow = useFlowStep(STEPS, { initial: isEdit ? 'details' : 'start', canOpen });
  const step = flow.step;

  const leaveTo = () => setLocation(kind === 'thread' ? '/stash/threads' : kind === 'pattern' ? '/patterns' : '/stash/fabrics');
  const leave = useLeaveGuard({ dirty: dirty && !done, onLeave: leaveTo, draft: isEdit ? undefined : { save: draft.save, discard: () => draft.discard() }, where: 'Add to stash' });

  // Validation: only what each kind truly needs.
  // Edit saves from any step, so it always checks Details.
  const checking: Step = isEdit ? 'details' : step;
  const errors = checking === 'start'
    ? { kind: !kind && 'Pick what you are adding.' }
    : checking === 'details'
      ? kind === 'fabric'
        ? { name: !form.name.trim() && 'Give it a name, like "Chambray linen".', type: !form.type && 'Pick a fabric type.' }
        : kind === 'thread'
          ? { colorName: !form.colorName.trim() && 'Add the colour name or number from the label.', type: !form.type && 'Pick a thread type.' }
          : { name: !form.name.trim() && 'Give the pattern its name.', garmentType: !form.garmentType && 'Pick what it makes.' }
      : {};
  const v = useValidation(errors);
  useEffect(() => { v.reset(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- A photo: crop it, then it uploads while you fill in the details.
  const pickPhoto = (file: File) => { setOriginal(file); setCropping(file); };
  // The new photo replaces the old one: clear first, add once the list is empty.
  const [queued, setQueued] = useState<File | null>(null);
  useEffect(() => {
    if (queued && !photo.items.length) { photo.add([queued]); setQueued(null); }
  }, [queued, photo.items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const acceptCrop = (cropped: File) => {
    setCropping(null);
    photo.seed([]);
    setQueued(cropped);
    if (step === 'start') { setReached(r => Math.max(r, 1)); flow.go('details'); }
  };

  // ---- A pattern PDF: the existing reader fills empty fields.
  const readPdf = (file: File) => {
    setReading('working');
    setPdf(null);
    setForm(f => ({ ...f, format: f.format ?? 'pdf' }));
    pdfUpload.seed([]);
    pdfUpload.add([file]);
  };
  const pdfItem = pdfUpload.items[0];
  useEffect(() => {
    if (pdfItem?.status === 'error') { setReading('failed'); return; }
    if (pdfItem?.status !== 'done' || reading !== 'working') return;
    const url = pdfItem.result!;
    setPdf({ url, name: pdfItem.file?.name ?? 'Pattern PDF' });
    analyzePatternPdf({ pdfUrl: url }).then(d => {
      const filled: string[] = [];
      setForm(f => {
        const next: Form = { ...f };
        const fill = <K extends keyof Form>(key: K, value: Form[K] | null | undefined) => {
          const empty = next[key] === null || next[key] === '';
          if (empty && value !== null && value !== undefined && value !== '') { next[key] = value as Form[K]; filled.push(key); }
        };
        fill('name', d.name); fill('designer', d.designer); fill('sizes', d.sizes); fill('requiredFabric', d.requiredFabric);
        fill('yardage', d.yardage); fill('recommendedFabrics', d.recommendedFabrics); fill('seamAllowance', d.seamAllowance);
        fill('instructions', d.instructions); fill('notes', d.notes); fill('difficulty', d.difficulty);
        const garment = GARMENTS.find(g => (d.garmentType ?? '').toLowerCase().includes(g.toLowerCase()));
        fill('garmentType', garment ?? null);
        if (d.steps?.length && !next.steps?.length) { next.steps = d.steps; filled.push('steps'); }
        return next;
      });
      setFound(filled);
      setReading('done');
    }).catch(() => setReading('failed'));
  }, [pdfItem?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // A PDF chosen on the Pattern library's "Import a pattern PDF" banner.
  useEffect(() => {
    const file = isEdit ? null : takeHandedOverFile();
    if (file) { setKind('pattern'); setSource('pdf'); readPdf(file); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSource = (s: Source) => {
    setSource(s);
    if (s === 'hand') {
      setReached(r => Math.max(r, 1));
      flow.go('details');
      return;
    }
    document.getElementById(s === 'pdf' ? 'stash-pdf' : s === 'camera' || s === 'label' ? 'stash-camera' : 'stash-photo')?.click();
  };
  const onFile = (files: FileList | null, which: 'photo' | 'pdf') => {
    const file = files?.[0];
    if (!file || !kind) return;
    if (which === 'pdf') readPdf(file);
    else pickPhoto(file);
  };

  // ---- Submit
  async function submit() {
    if (!kind) return;
    setBusy(true);
    setSubmitError(null);
    const photos = await photo.waitAll();
    if (photos.some(i => i.status === 'error')) {
      setBusy(false);
      setSubmitError("The photo didn't upload. Retry it or remove it.");
      return;
    }
    const image = photos[0]?.result ?? null;
    const widthValue = form.width === 'other' ? Number(form.widthOther) || null : form.width ? Number(form.width) : null;
    try {
      let id: number;
      if (kind === 'fabric') {
        const data = {
          name: form.name.trim(), type: form.type!, color: form.colorName.trim(), colorHex: form.colorHex,
          quantity: form.quantity, unit: form.unit, width: widthValue, weight: form.weight || null, stretch: form.stretch || null,
          composition: form.composition || null, notes: form.notes || null, imageUrl: image, visibility: form.visibility,
        };
        id = editing?.kind === 'fabric' ? (await updateFabric(editing.item.id, data)).id : (await createFabric(data)).id;
      } else if (kind === 'thread') {
        const data = {
          brand: form.brand.trim(), colorName: form.colorName.trim(), color: form.colorHex ?? '', type: form.type!, quantity: form.quantity,
          weight: form.weight || null, notes: form.notes || null, imageUrl: image, visibility: form.visibility,
        };
        id = editing?.kind === 'thread' ? (await updateThread(editing.item.id, data)).id : (await createThread(data)).id;
      } else {
        const data = {
          name: form.name.trim(), designer: form.designer.trim() || null, garmentType: form.garmentType!, difficulty: form.difficulty ?? '',
          sizes: form.sizes.trim() || null, status: form.status as Pattern['status'], format: form.format as Pattern['format'], notes: form.notes || null,
          requiredFabric: form.requiredFabric || null, yardage: form.yardage, recommendedFabrics: form.recommendedFabrics || null,
          seamAllowance: form.seamAllowance || null, instructions: form.instructions || null, steps: form.steps,
          coverImageUrl: image, pdfUrl: pdf?.url ?? null, pdfFileName: pdf?.name ?? null, visibility: form.visibility,
        };
        id = editing?.kind === 'pattern' ? (await updatePattern(editing.item.id, data)).id : (await createPattern(data)).id;
        const before = editing?.kind === 'pattern' ? editing.item.catalogId ?? null : null;
        if (form.catalogId !== before) await setCatalogLink('pattern', id, { catalogId: form.catalogId }).catch(() => undefined);
      }
      await draft.clear();
      client.invalidateQueries();
      if (isEdit) { leaveTo(); return; }
      setDone({ id, kind, name: kind === 'thread' ? form.colorName.trim() : form.name.trim() });
    } catch (e) {
      setSubmitError(errorText(e, "That didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const goNext = () => (isEdit && step !== 'details' && Object.values(errors).some(Boolean) ? flow.go('details') : v.attempt(() => {
    if (isEdit) { void submit(); return; }
    if (step === 'save') { void submit(); return; }
    const next = STEPS[STEPS.indexOf(step) + 1];
    setReached(r => Math.max(r, STEPS.indexOf(next)));
    flow.go(next);
  }));

  // Catalog suggestion for patterns (More).
  const catalogQuery = [form.name, form.designer].filter(Boolean).join(' ').trim();
  const catalog = useListCatalog({ kind: 'pattern', q: catalogQuery || undefined }, { query: { enabled: kind === 'pattern' && form.name.trim().length >= 3 && step === 'more' } });
  const suggestion = catalog.data?.items.find(e => e.id === form.catalogId) ?? catalog.data?.items[0];

  const audienceId = useId();
  const hi = (key: string) => (found.includes(key) ? 'bg-yellow/15' : 'bg-canvas');
  const title = kind ? (isEdit ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : KIND_TITLE[kind]) : 'Add to stash';
  const meta = kind === 'fabric'
    ? [form.type && cap(form.type), form.quantity ? `${form.quantity} ${form.unit}` : null, form.colorName.trim() || null].filter(Boolean).join(' · ')
    : kind === 'thread'
      ? [form.brand, THREAD_TYPES.find(t => t[0] === form.type)?.[1], form.quantity ? `${form.quantity} spool${form.quantity === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')
      : [form.designer, form.garmentType, form.sizes && `Sizes ${form.sizes}`].filter(Boolean).join(' · ');
  const previewName = kind === 'thread' ? form.colorName : form.name;
  const preview = <StashPreview kind={kind} name={previewName} meta={meta} image={photoUrl ?? (photo.items[0]?.preview || null)} colour={form.colorHex} visibility={form.visibility} />;

  // ---- Done
  if (done) {
    const param = done.kind === 'fabric' ? 'fabric' : done.kind === 'thread' ? 'thread' : 'pattern';
    const where = done.kind === 'fabric' ? 'fabric stash' : done.kind === 'thread' ? 'thread drawer' : 'pattern library';
    return (
      <FlowShell title={KIND_TITLE[done.kind]} steps={[]} current="" canOpen={() => false} onStep={() => undefined} onClose={leaveTo} narrow>
        <div className="space-y-3 pt-6 lg:pt-0">
          <div className="rounded-[34px] bg-yellow px-6 py-9 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-yellow" aria-hidden="true"><Check size={28} strokeWidth={3} /></span>
            <h2 className="mt-4 font-display text-[34px] leading-tight tracking-[-.05em]" data-autofocus tabIndex={-1}>{KIND_LABEL[done.kind]} saved</h2>
            <p className="mt-2 text-[15px]">{done.name} is in your {where}.</p>
          </div>
          <button type="button" onClick={() => setLocation(`/projects/new?${param}=${done.id}`)} className="flex min-h-[56px] w-full items-center justify-center rounded-full bg-ink text-lg font-bold text-white">Use it in a new project</button>
          <button type="button" onClick={() => { setLocation(`/stash/new?kind=${done.kind}`, { replace: true }); onRestart?.(); }} className="flex min-h-[56px] w-full items-center justify-center rounded-full border-2 border-ink text-lg font-bold">Add another</button>
        </div>
      </FlowShell>
    );
  }

  // ---- Start
  const showReading = reading !== 'idle' && Boolean(pdf || pdfUpload.items[0]);
  const startStep = (
    <div className="space-y-3" onDragOver={e => { if (kind && !showReading) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (!f || !kind) return; if (f.type === 'application/pdf') { setKind('pattern'); setSource('pdf'); readPdf(f); } else { setSource('photo'); pickPhoto(f); } }}>
      <input id="stash-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} onChange={e => { onFile(e.target.files, 'photo'); e.target.value = ''; }} />
      <input id="stash-camera" type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={e => { onFile(e.target.files, 'photo'); e.target.value = ''; }} />
      <input id="stash-pdf" type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={e => { onFile(e.target.files, 'pdf'); e.target.value = ''; }} />
      {!showReading ? (
        <>
          <h2 className="px-1 font-display text-[34px] leading-tight tracking-[-.05em]">What are you adding?</h2>
          <div data-field="kind">
            <KindCards value={kind} onChange={k => { if (!isEdit) { setKind(k); setFound([]); } }} />
            {v.error('kind') && <p className="mt-2 text-sm font-semibold text-red-ink">{v.error('kind')}</p>}
          </div>
          {kind && !isEdit && <SourceList kind={kind} onPick={pickSource} />}
        </>
      ) : (
        <>
          {(
            <div className="rounded-[34px] bg-ink p-5 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-12 place-items-center rounded-[12px] bg-white text-ink" aria-hidden="true"><FileText size={22} /></span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{pdf?.name ?? pdfUpload.items[0]?.file?.name ?? 'Pattern PDF'}</p>
                  <p className="text-sm text-white/70">{pdfItem?.status === 'error' ? "The PDF didn't upload." : pdfUpload.items[0]?.status === 'uploading' ? `Uploading ${Math.round((pdfUpload.items[0].progress ?? 0) * 100)}%` : reading === 'working' ? 'Reading the pattern…' : 'Stays private: only you can open it.'}</p>
                </div>
              </div>
              <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/20"><span className="block h-full bg-yellow transition-[width]" style={{ width: `${pdfUpload.items[0]?.status === 'uploading' ? Math.max(6, pdfUpload.items[0].progress * 100) : 100}%` }} /></span>
              {pdfItem?.status === 'error' && <button type="button" onClick={() => { setReading('working'); pdfUpload.retry(pdfItem.key); }} className="mt-2 min-h-[44px] font-bold text-yellow underline">Retry</button>}
            </div>
          )}
          {reading === 'working' && <ReadingCard status="working" title="Reading your PDF…" />}
          {reading === 'failed' && (
            <ReadingCard status="failed" title="We couldn't read this PDF">
              <p className="text-[15px] text-subtle">That's fine: fill in the details yourself next.{pdf ? ' The PDF is still attached and private.' : ''}</p>
            </ReadingCard>
          )}
          {reading === 'done' && (
            <ReadingCard status="done" title="Read from your PDF">
                  {found.includes('name') && <FoundRow label="Name" value={form.name} />}
                  {found.includes('designer') && <FoundRow label="Designer" value={form.designer} />}
                  {found.includes('garmentType') && <FoundRow label="Garment" value={form.garmentType} />}
                  {found.includes('difficulty') && <FoundRow label="Difficulty" value={cap(form.difficulty ?? '')} />}
                  {found.includes('sizes') && <FoundRow label="Sizes" value={form.sizes} />}
                  {(found.includes('requiredFabric') || found.includes('yardage')) && <FoundRow label="Fabric" value={form.requiredFabric || `${form.yardage} yd`} />}
                  {found.includes('steps') && <FoundRow label="Steps" value={`${form.steps?.length} construction steps`} />}
                  {!found.length && <p className="text-[15px] text-subtle">Nothing we could fill in. Add the details next.</p>}
            </ReadingCard>
          )}
          <button type="button" onClick={() => { setReading('idle'); setSource(null); }} className="px-1 text-sm font-bold underline">Start differently</button>
        </>
      )}
    </div>
  );

  // ---- Details
  const nameInput = (label: string, placeholder: string, error?: string) => (
    <FieldCard name="name" label={label} error={error}>
      <input {...fieldProps('name', error)} id="f-name" value={form.name} onChange={e => set('name', e.target.value.slice(0, 120))} placeholder={placeholder}
        className={`w-full rounded-[14px] px-3 py-3 font-display text-[24px] tracking-[-.03em] outline-none ${hi('name')}`} />
    </FieldCard>
  );
  const photoItem = photo.items[0];
  const photoRow = (
    <div className="flex items-start gap-3 rounded-[26px] bg-white p-2.5">
      {photoItem
        ? <UploadTile item={photoItem} label="photo" className="h-20 w-20" onRemove={() => { photo.remove(photoItem.key); setOriginal(null); }} onRetry={() => photo.retry(photoItem.key)} />
        : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-[16px] bg-canvas" aria-hidden="true"><ImagePlus size={22} /></span>}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-bold" aria-live="polite">{!photoItem ? 'Add a photo' : photoItem.status === 'uploading' ? `Uploading ${Math.round(photoItem.progress * 100)}%` : photoItem.status === 'error' ? "Didn't upload" : 'Your photo'}</p>
        <p className="text-sm text-subtle">{!photoItem ? 'Optional' : photoItem.status === 'uploading' ? 'Keep going while it uploads' : kind === 'pattern' ? 'The pattern cover' : 'The picture on its card'}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {photoItem && original && (
            <button type="button" onClick={() => setCropping(original)} className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-canvas px-4 text-sm font-bold"><Crop size={15} aria-hidden="true" />Crop</button>
          )}
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border-2 border-ink px-4 text-sm font-bold focus-within:ring-4 focus-within:ring-yellow">
            {photoItem ? 'Change photo' : 'Choose photo'}
            <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>
    </div>
  );
  const detailsStep = (
    <div className="space-y-3">
      {pdf && (
        <div className="flex items-center gap-3 rounded-[26px] bg-white p-2.5">
          <span className="grid h-14 w-14 place-items-center rounded-[14px] bg-canvas" aria-hidden="true"><FileText size={22} /></span>
          <div className="min-w-0"><p className="truncate font-bold">{pdf.name}</p><p className="text-sm text-subtle">{found.length ? 'Yellow fields came from it' : 'Private: only you can open it'}</p></div>
        </div>
      )}
      {photoRow}
      {kind === 'fabric' && <>
        {nameInput('Name', 'e.g. Chambray linen', v.error('name'))}
        <FieldCard name="type" label="Fabric type" group error={v.error('type')}>
          <ChoiceChips options={FABRIC_TYPES.map(t => ({ value: t, label: cap(t) }))} value={form.type as (typeof FABRIC_TYPES)[number] | null} onChange={t => set('type', t)} {...groupProps('type', v.error('type'))} />
        </FieldCard>
        <FieldCard name="colorName" label="Colour" aside="optional">
          <input {...fieldProps('colorName')} value={form.colorName} onChange={e => set('colorName', e.target.value.slice(0, 80))} placeholder="e.g. Navy, leopard print"
            className="w-full rounded-[14px] bg-canvas px-3 py-3 text-[17px] outline-none" />
        </FieldCard>
        <FieldCard name="colour" label="Closest swatch" aside="optional" group>
          <ColourField value={form.colorHex} onChange={h => set('colorHex', h)} labelledBy="f-colour-label" />
        </FieldCard>
        <FieldCard name="quantity" label="How much do you have?" group>
          <Stepper label="Amount" value={form.quantity} onChange={q => set('quantity', q)} step={0.5} unit={form.unit} />
        </FieldCard>
        <Segmented aria-label="Unit" value={form.unit} options={[{ value: 'm', label: 'Metres' }, { value: 'yd', label: 'Yards' }] as const}
          onChange={u => setForm(f => (u === f.unit ? f : { ...f, unit: u, quantity: f.quantity === null ? null : Math.round((u === 'yd' ? f.quantity / 0.9144 : f.quantity * 0.9144) * 10) / 10 }))} />
      </>}
      {kind === 'thread' && <>
        <FieldCard name="colorName" label="Colour name or number" error={v.error('colorName')}>
          <input {...fieldProps('colorName', v.error('colorName'))} value={form.colorName} onChange={e => set('colorName', e.target.value.slice(0, 80))} placeholder="e.g. Navy 310"
            className={`w-full rounded-[14px] px-3 py-3 font-display text-[24px] tracking-[-.03em] outline-none ${hi('colorName')}`} />
        </FieldCard>
        <FieldCard name="type" label="Thread type" group error={v.error('type')}>
          <ChoiceChips options={THREAD_TYPES.map(([value, label]) => ({ value, label }))} value={form.type as (typeof THREAD_TYPES)[number][0] | null} onChange={t => set('type', t)} {...groupProps('type', v.error('type'))} />
        </FieldCard>
        <FieldCard name="colour" label="Closest swatch" aside="optional" group>
          <ColourField value={form.colorHex} onChange={h => set('colorHex', h)} labelledBy="f-colour-label" />
        </FieldCard>
        <FieldCard name="quantity" label="Spools" group>
          <Stepper label="Spools" value={form.quantity} onChange={q => set('quantity', q === null ? null : Math.round(q))} step={1} />
        </FieldCard>
      </>}
      {kind === 'pattern' && <>
        {nameInput('Pattern name', 'e.g. Bayside Sailor Top', v.error('name'))}
        <FieldCard name="designer" label="Designer" aside="optional">
          <input {...fieldProps('designer')} value={form.designer} onChange={e => set('designer', e.target.value.slice(0, 120))} placeholder="e.g. Tidewater Patterns" className={`w-full rounded-[14px] px-3 py-3 text-[17px] outline-none ${hi('designer')}`} />
        </FieldCard>
        <FieldCard name="garmentType" label="Garment" group error={v.error('garmentType')}>
          <ChoiceChips options={[...GARMENTS, ...(form.garmentType && !GARMENTS.includes(form.garmentType as never) ? [form.garmentType] : [])].map(g => ({ value: g, label: g }))}
            value={form.garmentType} onChange={g => set('garmentType', g)} {...groupProps('garmentType', v.error('garmentType'))} />
        </FieldCard>
        <FieldCard name="difficulty" label="Difficulty" aside="optional" group hint="Tap again to clear it.">
          <ChoiceChips options={DIFFICULTIES.map(d => ({ value: d, label: cap(d) }))} value={form.difficulty as (typeof DIFFICULTIES)[number] | null} onChange={d => set('difficulty', d)} clearable {...groupProps('difficulty')} />
        </FieldCard>
        <FieldCard name="sizes" label="Sizes included" aside="optional">
          <input {...fieldProps('sizes')} value={form.sizes} onChange={e => set('sizes', e.target.value.slice(0, 80))} placeholder="e.g. 6–24" className={`w-full rounded-[14px] px-3 py-3 text-[17px] outline-none ${hi('sizes')}`} />
        </FieldCard>
      </>}
    </div>
  );

  // ---- More (all optional)
  const textField = (key: 'weight' | 'stretch' | 'composition' | 'brand', label: string, placeholder: string) => (
    <FieldCard name={key} label={label} aside="optional">
      <input {...fieldProps(key)} value={form[key]} onChange={e => set(key, e.target.value.slice(0, 120))} placeholder={placeholder} className="w-full rounded-[14px] bg-canvas px-3 py-3 text-[17px] outline-none" />
    </FieldCard>
  );
  const moreStep = (
    <div className="space-y-3">
      <p className="flex items-center justify-between px-1 text-[15px] text-subtle">All optional. Skip it and add them later.
        <button type="button" onClick={() => { setReached(r => Math.max(r, 3)); flow.go('save'); }} className="min-h-[44px] font-bold text-ink underline">Skip</button></p>
      {kind === 'fabric' && <>
        <FieldCard name="width" label="Width" group>
          <ChoiceChips options={WIDTHS.map(w => ({ value: w, label: w === 'other' ? 'Other' : `${w} cm` }))} value={form.width as (typeof WIDTHS)[number] | null} onChange={w => set('width', w)} clearable {...groupProps('width')} />
          {form.width === 'other' && <input value={form.widthOther} onChange={e => set('widthOther', e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))} inputMode="decimal" aria-label="Width in cm" placeholder="Width in cm" className="field mt-3" />}
        </FieldCard>
        {textField('weight', 'Weight', 'e.g. Midweight, 180 gsm')}
        {textField('stretch', 'Stretch', 'e.g. None, 2-way, 4-way')}
        {textField('composition', 'Composition', 'e.g. 100% linen')}
      </>}
      {kind === 'thread' && <>
        {textField('brand', 'Brand', 'e.g. Gütermann')}
        {textField('weight', 'Weight', 'e.g. 50 wt')}
      </>}
      {kind === 'pattern' && <>
        <FieldCard name="status" label="Status" group>
          <ChoiceChips options={STATUSES.map(([value, label]) => ({ value, label }))} value={form.status as (typeof STATUSES)[number][0]} onChange={s => set('status', s ?? 'want_to_make')} {...groupProps('status')} />
        </FieldCard>
        <FieldCard name="format" label="Format" group>
          <ChoiceChips options={FORMATS.map(([value, label]) => ({ value, label }))} value={form.format as (typeof FORMATS)[number][0] | null} onChange={f => set('format', f)} clearable {...groupProps('format')} />
        </FieldCard>
        {suggestion && (
          <div className="flex items-center gap-3 rounded-[30px] bg-ink p-4 text-white">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-white/10" aria-hidden="true"><BookOpen size={22} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{suggestion.name} page</p>
              <p className="text-sm text-white/70">{[suggestion.maker, suggestion.stats.rating !== null ? `${suggestion.stats.rating} stars` : null, `${suggestion.stats.reviews} review${suggestion.stats.reviews === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" aria-pressed={form.catalogId === suggestion.id} onClick={() => set('catalogId', form.catalogId === suggestion.id ? null : suggestion.id)}
              className={`min-h-[48px] shrink-0 rounded-full px-5 font-bold ${form.catalogId === suggestion.id ? 'bg-yellow text-ink' : 'bg-white text-ink'}`}>{form.catalogId === suggestion.id ? 'Linked' : 'Link'}</button>
          </div>
        )}
      </>}
      <FieldCard name="notes" label="Notes" aside="optional">
        <textarea {...fieldProps('notes')} value={form.notes} onChange={e => set('notes', e.target.value.slice(0, 4000))} rows={3}
          placeholder={kind === 'pattern' ? 'e.g. Grade between 12 and 14 at the hip' : 'Where it came from, what it is for…'} className="w-full resize-none rounded-[14px] bg-canvas px-3 py-3 text-[16px] outline-none" />
      </FieldCard>
    </div>
  );

  // ---- Save
  const helps = {
    private: 'The default for your stash.',
    followers: 'Shows on makes you share with followers.',
    public: 'Shows in the Used tab on your profile.',
  };
  const saveStep = (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-[30px] bg-white p-4">
        {photoUrl ? <img src={photoUrl} alt="" className="h-16 w-16 rounded-[18px] object-cover" />
          : <span className="h-16 w-16 shrink-0 rounded-[18px] bg-canvas" style={form.colorHex ? { backgroundColor: form.colorHex } : undefined} aria-hidden="true" />}
        <div className="min-w-0"><p className="truncate font-display text-[22px] tracking-[-.04em]">{previewName || 'Untitled'}</p><p className="truncate text-[15px] text-subtle">{meta}</p></div>
      </div>
      <div className="rounded-[30px] bg-white p-4">
        <h2 id={audienceId} className="mb-3 font-display text-[22px] tracking-[-.05em]">Who can see this?</h2>
        <AudienceCards value={form.visibility} onChange={a => set('visibility', a)} labelledBy={audienceId} helps={helps} />
        <p className="mt-3 text-sm text-subtle">Nothing in your stash goes public unless you choose it.{kind === 'pattern' && ' The pattern PDF itself always stays private.'}</p>
      </div>
      {submitError && <p role="alert" className="px-2 text-sm font-semibold text-red-ink">{submitError}</p>}
    </div>
  );

  const body = { start: startStep, details: detailsStep, more: moreStep, save: saveStep }[step];
  const readingNow = step === 'start' && showReading;
  const primary = {
    label: isEdit ? 'Save changes' : step === 'save' ? 'Save to stash' : readingNow && reading === 'done' ? 'Use these details' : 'Next',
    onClick: goNext,
    disabled: readingNow && reading === 'working',
    reason: readingNow && reading === 'working' ? 'Wait a moment while we read it.' : undefined,
    busy,
    busyLabel: photo.pending ? 'Finishing upload…' : 'Saving…',
  };
  return (
    <FlowShell
      title={title}
      subtitle={isEdit ? 'Nothing changes until you save' : step === 'start' && !kind ? 'Fabric, thread or a pattern' : draftLabel(draft.status)}
      steps={STEPS.map(id => ({ id, label: LABELS[id] }))}
      current={step}
      canOpen={id => canOpen(id as Step)}
      onStep={id => flow.go(id as Step)}
      onClose={leave.request}
      onBack={STEPS.indexOf(step) > 0 ? flow.back : undefined}
      primary={step === 'start' && !readingNow && !isEdit && !kind ? undefined : primary}
      aside={{ side: 'left', title: 'How it will look', content: preview }}
    >
      {!isEdit && draft.loaded && hydrated && step === 'start' && !showReading && (
        <DraftNotice updatedAt={draft.loaded.updatedAt} summary={(draft.loaded.payload as StashDraft).form?.name || undefined}
          onStartOver={async () => { await draft.discard({ keepOpen: true }); setLocation(`/stash/new${kind ? `?kind=${kind}` : ''}`, { replace: true }); onRestart?.(); }} />
      )}
      {body}
      {cropping && <PhotoCropper file={cropping} initialAspect={kind === 'pattern' ? '4:5' : '1:1'} onDone={acceptCrop} onCancel={() => setCropping(null)} />}
      {leave.dialog}
    </FlowShell>
  );
}
