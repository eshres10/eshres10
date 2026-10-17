import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  addStepsFromPattern,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  setVisibility,
  updateProjectFields,
  useGetProfile,
  useListFabrics,
  useListMeasurementProfiles,
  useListPatterns,
  useListThreads,
  type ProjectDetail,
  type ProjectFieldsInput,
} from '@workspace/api-client-react';
import { BookOpen, Check, ChevronLeft, Layers, Loader2, X } from 'lucide-react';
import { Link } from 'wouter';
import { AudienceCards, type Audience } from '@/components/post-flow/parts';
import { Sheet } from '@/components/social/Sheet';
import { fabricFit, formatLength, parseSizes, toMetres } from './setup';

const ROWS = ['pattern', 'fabric', 'thread', 'measurements', 'size', 'steps', 'visibility'] as const;
type Row = (typeof ROWS)[number];
const TITLES: Record<Row, string> = {
  pattern: 'Pattern', fabric: 'Fabric', thread: 'Thread', measurements: 'Measurements',
  size: "Size you're making", steps: 'Steps', visibility: 'Who can see it',
};
const QUESTIONS: Record<Row, string> = {
  pattern: 'Which pattern?', fabric: 'Which fabric?', thread: 'Which thread?', measurements: 'Whose measurements?',
  size: 'What size are you making?', steps: 'How will you track steps?', visibility: 'Who can see it?',
};
const AUDIENCE_LABEL: Record<string, string> = { public: 'Public', followers: 'Followers', private: 'Only me' };
const MAKE_HELPS = {
  public: 'Anyone, even without an account. Your measurements and pattern PDFs are never shown.',
  followers: 'Only people who follow you.',
  private: 'Just you. You can share it later.',
};

function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setDesktop(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return desktop;
}

/** A progress ring: n of 7 answered. */
function Ring({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 22;
  return (
    <span className="relative grid h-14 w-14 shrink-0 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
        <circle cx="26" cy="26" r="22" fill="none" strokeWidth="5" className="stroke-white/20" />
        <circle cx="26" cy="26" r="22" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-yellow"
          strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} />
      </svg>
      <span className="text-sm font-bold text-white">{done}/{total}</span>
    </span>
  );
}

/**
 * "Finish setting up · n/7" on the project page. Each row asks one question
 * (a sheet on phones, the right-hand panel on desktop) with Skip and Save and
 * next, which jumps to the next unanswered row. Hidden once all seven are
 * answered or the person hides it.
 */
export function SetupChecklist({ project, onAddOwnStep }: { project: ProjectDetail; onAddOwnStep: () => void }) {
  const client = useQueryClient();
  const desktop = useIsDesktop();
  const titleId = useId();
  const me = useGetProfile();
  const patterns = useListPatterns();
  const fabrics = useListFabrics();
  const threads = useListThreads();
  const profiles = useListMeasurementProfiles();
  const [open, setOpen] = useState<Row | null>(null);
  const [finished, setFinished] = useState(false);
  // Rows skipped this visit aren't offered again by "next" (they stay tappable).
  const [skipped, setSkipped] = useState<Row[]>([]);
  const units = me.data?.units === 'imperial' ? 'imperial' : 'metric';

  const steps = project.steps ?? [];
  const setup = project.setup;
  const answered: Record<Row, boolean> = {
    pattern: project.patternId !== null,
    fabric: project.fabricId !== null,
    thread: project.threadId !== null,
    measurements: project.measurementProfileId !== null,
    size: Boolean(project.size),
    steps: steps.length > 0 || setup.stepsChoice === 'none',
    visibility: Boolean(setup.visibilityChosen),
  };
  const count = ROWS.filter(r => answered[r]).length;
  if (setup.dismissed || (count === ROWS.length && !finished)) return null;

  const pattern = patterns.data?.find(p => p.id === project.patternId);
  const fabric = fabrics.data?.find(f => f.id === project.fabricId);
  const thread = threads.data?.find(t => t.id === project.threadId);
  const profile = profiles.data?.find(m => m.id === project.measurementProfileId);
  const summary: Record<Row, string> = {
    pattern: pattern?.name ?? 'Not chosen',
    fabric: fabric ? [fabric.name, fabric.quantity ? `${formatLength(toMetres(fabric.quantity, fabric.unit), units)} in your stash` : null].filter(Boolean).join(' · ') : 'Not chosen',
    thread: thread ? [thread.colorName, thread.type, thread.quantity ? `${thread.quantity} spool${thread.quantity === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') : 'Not chosen',
    measurements: profile ? `${profile.name} · ${new Date(profile.recordedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : 'Not chosen',
    size: project.size ? `Size ${project.size}` : 'Not chosen',
    steps: steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}${setup.stepsChoice === 'pattern' ? ' from the pattern' : ''}` : setup.stepsChoice === 'none' ? 'No steps' : setup.stepsChoice === 'own' ? 'Add your first step below' : 'Not set',
    visibility: setup.visibilityChosen ? AUDIENCE_LABEL[project.visibility] : `${AUDIENCE_LABEL[project.visibility]} (default)`,
  };

  const refresh = () => {
    client.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
    client.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };
  const save = async (data: ProjectFieldsInput) => {
    const row = await updateProjectFields(project.id, data);
    client.setQueryData(getGetProjectQueryKey(project.id), (old: ProjectDetail | undefined) => (old ? { ...old, ...row } : old));
    refresh();
  };
  // After answering (or skipping) a row: the next unanswered one after it, else close.
  const advance = (from: Row, nowAnswered: boolean) => {
    const done = { ...answered, [from]: answered[from] || nowAnswered };
    const passed = nowAnswered ? skipped : [...skipped, from];
    if (!nowAnswered) setSkipped(passed);
    const at = ROWS.indexOf(from);
    const next = [...ROWS.slice(at + 1), ...ROWS.slice(0, at)].find(r => !done[r] && !passed.includes(r));
    if (!next) {
      setOpen(null);
      if (ROWS.every(r => done[r])) setFinished(true);
      return;
    }
    setOpen(next);
  };
  const hide = async () => { await save({ setup: { dismissed: true } }); };

  const question = open && (
    <Question key={open} row={open} index={ROWS.indexOf(open)} project={project} units={units}
      patterns={patterns.data ?? []} fabrics={fabrics.data ?? []} threads={threads.data ?? []} profiles={profiles.data ?? []}
      onSkip={() => advance(open, false)}
      onClose={() => setOpen(null)}
      onSave={async (row, value) => {
        if (row === 'steps') {
          if (value === 'pattern') await addStepsFromPattern(project.id).then(refresh);
          else await save({ setup: { stepsChoice: value as 'own' | 'none' } });
          if (value === 'own') {
            setOpen(null);
            onAddOwnStep();
            return;
          }
        } else if (row === 'visibility') {
          await setVisibility('project', project.id, { visibility: value as Audience });
          await save({ setup: { visibilityChosen: true } });
        } else {
          const key = { pattern: 'patternId', fabric: 'fabricId', thread: 'threadId', measurements: 'measurementProfileId', size: 'size' }[row];
          await save({ [key]: value });
        }
        advance(row, true);
      }} />
  );

  const rows = (
    <ul className="divide-y divide-line">
      {ROWS.map(r => (
        <li key={r}>
          <button type="button" onClick={() => setOpen(r)} className="flex min-h-[64px] w-full items-center gap-3 py-2.5 text-left">
            <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${answered[r] ? 'bg-yellow' : 'border-2 border-line'}`}>{answered[r] && <Check size={16} strokeWidth={3} />}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{TITLES[r]}</span>
              <span className="block truncate text-sm text-subtle">{summary[r]}</span>
            </span>
            <span className={`shrink-0 text-sm font-bold ${answered[r] ? 'text-subtle' : 'text-blue-ink'}`}>{answered[r] ? 'Change' : 'Add'}<span className="sr-only"> {TITLES[r].toLowerCase()}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby={titleId} className="rounded-[30px] bg-white p-4 lg:p-5">
      {desktop && open ? question : (
        <>
          <div className="flex items-center gap-3 rounded-[24px] bg-ink p-4 text-white">
            <Ring done={count} total={ROWS.length} />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-xl tracking-[-.04em]">{count === ROWS.length ? 'All set up' : 'Finish setting up'}</h2>
              <p className="text-sm text-white/75">{count === ROWS.length ? 'Tick off steps to move your progress.' : "Tap any row. Skip what you don't know yet."}</p>
            </div>
            <button type="button" onClick={hide} aria-label={count === ROWS.length ? 'Close the setup list' : 'Hide the setup list'} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10"><X size={18} /></button>
          </div>
          <div className="mt-1">{rows}</div>
        </>
      )}
      {!desktop && open && (
        <Sheet label={QUESTIONS[open]} onClose={() => setOpen(null)}>{question}</Sheet>
      )}
    </section>
  );
}

type Lists = {
  patterns: Array<{ id: number; name: string; designer?: string | null; coverImageUrl?: string | null; sizes?: string | null; yardage?: number | null; steps?: string[] | null }>;
  fabrics: Array<{ id: number; name: string; color: string; quantity?: number | null; unit?: string | null; imageUrl?: string | null }>;
  threads: Array<{ id: number; brand: string; colorName: string; color: string; type: string; quantity?: number | null }>;
  profiles: Array<{ id: number; name: string; recordedAt: string }>;
};

/** One setup question with Skip and Save and next. */
function Question({ row, index, project, units, patterns, fabrics, threads, profiles, onSkip, onSave, onClose }: Lists & {
  row: Row;
  index: number;
  project: ProjectDetail;
  units: 'metric' | 'imperial';
  onSkip: () => void;
  onSave: (row: Row, value: string | number) => Promise<void>;
  onClose: () => void;
}) {
  const pattern = patterns.find(p => p.id === project.patternId);
  const initial: Record<Row, string | number | null> = {
    pattern: project.patternId, fabric: project.fabricId, thread: project.threadId, measurements: project.measurementProfileId,
    size: project.size ?? null, steps: project.setup.stepsChoice ?? null, visibility: project.setup.visibilityChosen ? project.visibility : null,
  };
  const [value, setValue] = useState<string | number | null>(initial[row]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const sizes = parseSizes(pattern?.sizes);

  const submit = async () => {
    if (value === null || value === '') {
      setError(row === 'size' ? 'Pick a size or type one, or tap Skip.' : 'Choose one, or tap Skip.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(row, value);
    } catch (e) {
      setError((e as { data?: { error?: string } })?.data?.error ?? "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const option = (key: string | number, body: ReactNode, badge?: ReactNode, image?: ReactNode) => (
    <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => { setValue(key); setError(null); }}
      className={`flex min-h-[64px] w-full items-center gap-3 rounded-[22px] border-2 p-2.5 text-left ${value === key ? 'border-ink bg-yellow/15' : 'border-line hover:border-ink'}`}>
      {image}
      <span className="min-w-0 flex-1">{body}</span>
      {badge}
    </button>
  );
  const thumb = (src: string | null | undefined, Icon: typeof BookOpen) => src
    ? <img src={src} alt="" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" />
    : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-canvas" aria-hidden="true"><Icon size={22} /></span>;
  const empty = (text: string, href: string, label: string) => (
    <p className="rounded-[20px] bg-canvas p-4 text-sm text-subtle">{text} <Link href={href} className="font-bold text-blue-ink">{label}</Link></p>
  );

  let help: ReactNode = null;
  let body: ReactNode = null;
  if (row === 'pattern') {
    help = 'One of the patterns in your library.';
    body = patterns.length ? patterns.map(p => option(p.id, <><span className="block font-bold">{p.name}</span>{p.designer && <span className="block text-sm text-subtle">{p.designer}</span>}</>, undefined, thumb(p.coverImageUrl, BookOpen)))
      : empty('No patterns in your library yet.', '/patterns', 'Add one');
  } else if (row === 'fabric') {
    help = pattern?.yardage ? `${pattern.name} needs ${formatLength(pattern.yardage * 0.9144, units)}. We checked your stash.` : 'Fabrics from your stash.';
    body = fabrics.length ? fabrics.map(f => {
      const fit = fabricFit(f, pattern?.yardage, units);
      return option(f.id, <><span className="block font-bold">{f.name}</span><span className="block text-sm text-subtle">{f.quantity ? `${formatLength(toMetres(f.quantity, f.unit), units)} in your stash` : f.color}</span></>,
        fit && <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${fit.enough ? 'bg-yellow text-ink' : 'bg-red-ink text-white'}`}>{fit.label}</span>,
        thumb(f.imageUrl, Layers));
    }) : empty('No fabric in your stash yet.', '/stash/fabrics', 'Add some');
  } else if (row === 'thread') {
    help = 'Thread from your stash.';
    body = threads.length ? threads.map(t => option(t.id, <><span className="block font-bold">{t.colorName}</span><span className="block text-sm text-subtle">{[t.brand, t.type, t.quantity ? `${t.quantity} spool${t.quantity === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</span></>,
      undefined, <span className="h-14 w-14 shrink-0 rounded-full border border-line" style={{ backgroundColor: t.color }} aria-hidden="true" />))
      : empty('No thread in your stash yet.', '/stash/threads', 'Add some');
  } else if (row === 'measurements') {
    help = 'They stay private. Nobody else ever sees them.';
    body = profiles.length ? profiles.map(m => option(m.id, <><span className="block font-bold">{m.name}</span><span className="block text-sm text-subtle">{new Date(m.recordedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></>))
      : empty('No measurements saved yet.', '/measurements', 'Add yours');
  } else if (row === 'size') {
    help = 'You can change it after a muslin.';
    body = (
      <div className="space-y-3">
        {sizes && (
          <div role="radiogroup" aria-labelledby={titleId} className="grid grid-cols-4 gap-2">
            {sizes.map(s => (
              <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => { setValue(s); setError(null); }}
                className={`min-h-[56px] rounded-[20px] border-2 text-xl font-bold ${value === s ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>{s}</button>
            ))}
          </div>
        )}
        <label className="block text-sm font-semibold text-subtle">{sizes ? 'Or type a size' : 'Size'}
          <input value={typeof value === 'string' && !sizes?.includes(value) ? value : ''} onChange={e => { setValue(e.target.value.slice(0, 60)); setError(null); }}
            className="field mt-1.5" placeholder="e.g. 12, graded to 14 at the hip" />
        </label>
      </div>
    );
  } else if (row === 'steps') {
    help = 'Progress is worked out from the steps you tick off.';
    const fromPattern = pattern?.steps?.length ?? 0;
    body = [
      ...(fromPattern ? [option('pattern', <><span className="block font-bold">Use the pattern's steps</span><span className="block text-sm text-subtle">{fromPattern} steps from {pattern!.name}</span></>)] : []),
      option('own', <><span className="block font-bold">Add my own</span><span className="block text-sm text-subtle">Type them in as you go.</span></>),
      option('none', <><span className="block font-bold">No steps</span><span className="block text-sm text-subtle">Just keep notes and photos.</span></>),
    ];
  } else {
    help = 'Nothing is shared until you choose.';
    body = <AudienceCards value={(value as Audience | null) ?? null} onChange={v => { setValue(v); setError(null); }} labelledBy={titleId} helps={MAKE_HELPS} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="hidden min-h-[40px] items-center gap-1 rounded-full bg-canvas px-3 text-sm font-bold lg:inline-flex"><ChevronLeft size={16} aria-hidden="true" />Checklist</button>
        <p className="text-sm font-semibold text-subtle lg:font-bold"><span className="lg:hidden">Setting up · </span>{index + 1} of {ROWS.length}</p>
      </div>
      <h2 id={titleId} className="mt-2 font-display text-[28px] leading-tight tracking-[-.05em] lg:text-[24px]">{QUESTIONS[row]}</h2>
      <p className="mt-1 text-[15px] text-subtle lg:text-sm">{help}</p>
      <div role={row === 'size' || row === 'visibility' ? undefined : 'radiogroup'} aria-labelledby={row === 'size' || row === 'visibility' ? undefined : titleId}
        className="mt-4 max-h-[48dvh] space-y-2 overflow-y-auto lg:max-h-none">{body}</div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onSkip} className="btn btn-line min-h-[52px] flex-1 text-base">Skip</button>
        <button type="button" onClick={submit} disabled={busy} className="btn btn-primary min-h-[52px] flex-[1.4] text-base">{busy && <Loader2 size={16} className="animate-spin" />}Save and next</button>
      </div>
    </div>
  );
}
