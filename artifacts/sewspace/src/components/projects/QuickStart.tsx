import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createProject, getListProjectsQueryKey, useListFabrics, useListPatterns, useListThreads } from '@workspace/api-client-react';
import { BookOpen, Camera } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import {
  ChoiceChips,
  DraftNotice,
  FieldCard,
  FlowShell,
  UploadTile,
  draftLabel,
  fieldProps,
  groupProps,
  useDraft,
  useLeaveGuard,
  useUploads,
  useValidation,
} from '@/components/flow';
import { toast } from '@/hooks/use-toast';
import { uploadFile } from '@/lib/upload';

export const GARMENTS = ['Dress', 'Top', 'Trousers', 'Skirt', 'Outerwear', 'Bag', 'Other'] as const;
const GARMENT_CHOICES = GARMENTS.map(g => ({ value: g, label: g }));

interface ProjectDraft extends Record<string, unknown> {
  name: string;
  patternId: number | null;
  garment: string | null;
  cover: string | null;
}

/** The garment chip that best matches a pattern's garment type, if any. */
function garmentFor(type: string | null | undefined): string | null {
  const t = (type ?? '').toLowerCase();
  if (!t) return null;
  if (/dress|gown|pinafore/.test(t)) return 'Dress';
  if (/top|shirt|blouse|tee|vest|cami/.test(t)) return 'Top';
  if (/trouser|pant|jean|short/.test(t)) return 'Trousers';
  if (/skirt/.test(t)) return 'Skirt';
  if (/coat|jacket|outer/.test(t)) return 'Outerwear';
  if (/bag|tote|purse/.test(t)) return 'Bag';
  return null;
}

/**
 * Quick start (/projects/new): just a name to begin with. Optional: one of
 * your patterns (fills an empty name), a garment and a cover photo. The project
 * starts private; the rest is asked on the project page. ?pattern=, ?fabric=
 * and ?thread= pre-link items (from Add to stash).
 */
export function QuickStart() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const client = useQueryClient();
  const patterns = useListPatterns();
  const fabricId = Number(params.get('fabric')) || null;
  const threadId = Number(params.get('thread')) || null;
  const fabrics = useListFabrics(undefined, { query: { enabled: Boolean(fabricId) } });
  const threads = useListThreads(undefined, { query: { enabled: Boolean(threadId) } });
  const using = [fabrics.data?.find(f => f.id === fabricId)?.name, threads.data?.find(t => t.id === threadId)?.colorName].filter(Boolean).join(' and ');
  const [name, setName] = useState('');
  const [patternId, setPatternId] = useState<number | null>(Number(params.get('pattern')) || null);
  const [garment, setGarment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = useUploads<string>((file, options) => uploadFile(file, 'image', options).then(r => r.url), { max: 1 });
  const coverUrl = cover.results[0] ?? null;

  const dirty = Boolean(name.trim() || patternId || garment || cover.items.length);
  const payload: ProjectDraft = { name, patternId, garment, cover: coverUrl };
  const [hydrated, setHydrated] = useState(false);
  const draft = useDraft('project', payload, { enabled: true, active: hydrated && dirty });
  if (!hydrated && draft.loaded !== undefined) {
    const d = draft.loaded?.payload as ProjectDraft | undefined;
    if (d) {
      setName(String(d.name ?? ''));
      if (!params.get('pattern')) setPatternId(d.patternId ?? null);
      setGarment(d.garment ?? null);
      if (d.cover) cover.seed([{ key: 'cover', preview: d.cover, result: d.cover }]);
    }
    setHydrated(true);
  }

  const leave = useLeaveGuard({
    dirty,
    onLeave: () => (window.history.length > 1 ? window.history.back() : setLocation('/projects')),
    draft: { save: draft.save, discard: () => draft.discard() },
    where: 'New project',
  });
  const v = useValidation({ name: !name.trim() && 'Give it a name. You can change it any time.' });

  const pick = (id: number | null) => {
    setPatternId(id);
    const p = patterns.data?.find(x => x.id === id);
    if (p && !name.trim()) setName(p.name);
    if (p && !garment) setGarment(garmentFor(p.garmentType));
  };

  const create = () => v.attempt(async () => {
    setBusy(true);
    setError(null);
    const items = await cover.waitAll();
    if (items.some(i => i.status === 'error')) {
      setBusy(false);
      setError("The cover photo didn't upload. Retry it or remove it.");
      return;
    }
    try {
      const project = await createProject({
        name: name.trim(),
        visibility: 'private',
        status: 'planning',
        patternId,
        fabricId,
        threadId,
        garment,
        coverImageUrl: items[0]?.result ?? null,
      });
      await draft.clear();
      client.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      toast({ title: 'Project created', description: 'Finish setting it up whenever you like.' });
      setLocation(`/projects/${project.id}`, { replace: true });
    } catch (e) {
      setError((e as { data?: { error?: string } })?.data?.error ?? "That didn't save. Try again.");
      setBusy(false);
    }
  });

  return (
    <FlowShell title="New project" subtitle={draft.status === 'idle' ? undefined : draftLabel(draft.status)}
      steps={[]} current="" canOpen={() => false} onStep={() => undefined} onClose={leave.request} narrow
      primary={{ label: 'Create project', onClick: create, busy, busyLabel: cover.pending ? 'Finishing upload…' : 'Creating…' }}
      footnote="Only you can see it until you choose to share.">
      <div className="space-y-3">
        {draft.loaded && hydrated && <DraftNotice updatedAt={draft.loaded.updatedAt} summary={(draft.loaded.payload as ProjectDraft).name || undefined}
          onStartOver={async () => { await draft.discard({ keepOpen: true }); setName(''); setPatternId(null); setGarment(null); cover.seed([]); }} />}
        <div className="px-1 pt-2 lg:pt-0">
          <p className="eyebrow hidden text-red-ink lg:block">New project</p>
          <h2 className="font-display text-[34px] leading-tight tracking-[-.05em]">What are you making?</h2>
          <p className="mt-1 text-[15px] text-subtle">Just a name to start. Pattern, fabric and the rest can come later.</p>
          {using && <p className="mt-2 inline-flex rounded-full bg-yellow px-3 py-1 text-sm font-bold">Using {using}</p>}
        </div>

        <FieldCard name="name" label="Project name" error={v.error('name')}>
          <input {...fieldProps('name', v.error('name'))} value={name} onChange={e => setName(e.target.value.slice(0, 120))} autoComplete="off"
            placeholder="e.g. Sailor top in navy linen" className="w-full bg-transparent font-display text-[24px] tracking-[-.03em] outline-none placeholder:text-subtle/60 lg:rounded-[16px] lg:border lg:border-ink lg:px-4 lg:py-2.5 lg:text-xl" />
        </FieldCard>

        {(patterns.data?.length ?? 0) > 0 && (
          <FieldCard name="pattern" label="Start from one of your patterns" aside="optional" group>
            <div role="radiogroup" aria-labelledby="f-pattern-label" className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {patterns.data!.map(p => {
                const on = patternId === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => pick(on ? null : p.id)}
                    className={`w-[124px] shrink-0 overflow-hidden rounded-[22px] border-2 text-left ${on ? 'border-ink bg-yellow/20' : 'border-line'}`}>
                    {p.coverImageUrl
                      ? <img src={p.coverImageUrl} alt="" className="h-[110px] w-full object-cover" />
                      : <span className="grid h-[110px] place-items-center bg-canvas" aria-hidden="true"><BookOpen size={26} /></span>}
                    <span className="block px-2.5 py-2 text-sm font-bold leading-tight">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </FieldCard>
        )}

        <FieldCard name="garment" label="Garment" aside="optional" group>
          <ChoiceChips options={GARMENT_CHOICES} value={garment as (typeof GARMENTS)[number] | null} onChange={setGarment} clearable {...groupProps('garment')} />
        </FieldCard>

        <div className="flex items-center gap-4 rounded-[26px] bg-white p-4">
          {cover.items[0]
            ? <UploadTile item={cover.items[0]} label="cover photo" className="h-[72px] w-[72px]" onRemove={() => cover.remove(cover.items[0].key)} onRetry={() => cover.retry(cover.items[0].key)} />
            : <button type="button" onClick={() => document.getElementById('project-cover')?.click()} aria-label="Add a cover photo"
                className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[20px] border-2 border-dashed border-subtle/40"><Camera size={24} /></button>}
          <div>
            <p className="font-bold">{cover.items[0] ? 'Cover photo' : 'Add a cover photo'}</p>
            <p className="text-sm text-subtle">Optional · a sketch, the fabric, anything</p>
          </div>
          <input id="project-cover" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1}
            onChange={e => { if (e.target.files) cover.add(e.target.files); e.target.value = ''; }} />
        </div>
        {error && <p role="alert" className="px-2 text-sm font-semibold text-red-ink">{error}</p>}
      </div>
      {leave.dialog}
    </FlowShell>
  );
}
