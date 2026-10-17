import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProjectQueryKey, updateProjectFields, type ProjectDetail } from '@workspace/api-client-react';
import { Check, Loader2 } from 'lucide-react';

const FIELDS = [
  { key: 'notes', title: 'Notes', placeholder: 'Anything to remember about this make.' },
  { key: 'alterations', title: 'Alterations', placeholder: 'Changes to the pattern: lengthened, graded, a full bust adjustment…' },
  { key: 'problems', title: 'Problems', placeholder: 'What went wrong or felt tricky.' },
  { key: 'solutions', title: 'Fixes', placeholder: 'How you sorted it, for next time.' },
] as const;
type Key = (typeof FIELDS)[number]['key'];
type Status = 'idle' | 'saving' | 'saved' | 'error';

/** One journal field. Saves a second after you stop typing (and on leaving the field). */
function JournalField({ project, field }: { project: ProjectDetail; field: (typeof FIELDS)[number] }) {
  const client = useQueryClient();
  const stored = (project[field.key] as string | null) ?? '';
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState<Status>('idle');
  const timer = useRef<number | undefined>(undefined);
  const saved = useRef(stored);
  // A new value from the server (another tab, a refresh) replaces the text if nothing is pending.
  useEffect(() => {
    if (timer.current === undefined && status !== 'saving') { setText(stored); saved.current = stored; }
  }, [stored]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (value: string) => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (value === saved.current) return;
    setStatus('saving');
    try {
      const row = await updateProjectFields(project.id, { [field.key]: value });
      saved.current = (row[field.key as Key] as string | null) ?? '';
      client.setQueryData(getGetProjectQueryKey(project.id), (old: ProjectDetail | undefined) => (old ? { ...old, ...row, steps: old.steps, photos: old.photos } : old));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };
  const id = `journal-${field.key}`;
  return (
    <div className="border-t border-line pt-3 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold">{field.title}</label>
        <span className="text-xs font-semibold" aria-live="polite">
          {status === 'saving' && <span className="inline-flex items-center gap-1 text-subtle"><Loader2 size={12} className="animate-spin" aria-hidden="true" />Saving…</span>}
          {status === 'saved' && <span className="inline-flex items-center gap-1 text-subtle"><Check size={12} aria-hidden="true" />Saved</span>}
          {status === 'error' && <span className="text-red-ink">Not saved. <button type="button" onClick={() => save(text)} className="underline">Retry</button></span>}
        </span>
      </div>
      <textarea id={id} value={text} placeholder={field.placeholder}
        onChange={e => { const v = e.target.value.slice(0, 20000); setText(v); setStatus('idle'); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void save(v); }, 1000); }}
        onBlur={() => { if (timer.current !== undefined || text !== saved.current) void save(text); }}
        rows={Math.min(10, Math.max(2, text.split('\n').length + 1))}
        className="mt-1.5 w-full resize-none rounded-[16px] bg-canvas px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:shadow-[0_0_0_3px_rgba(230,229,30,.6)]" />
    </div>
  );
}

/** Journal: notes, alterations, problems and fixes, each saving on its own. */
export function Journal({ project }: { project: ProjectDetail }) {
  return (
    <section aria-labelledby="journal-title" className="rounded-[30px] bg-white p-6">
      <h2 id="journal-title" className="font-display text-2xl tracking-[-.04em]">Journal</h2>
      <p className="mt-1 text-sm text-subtle">Notes, alterations, problems and fixes. Each one saves as you type.</p>
      <div className="mt-4 space-y-3">
        {FIELDS.map(f => <JournalField key={f.key} project={project} field={f} />)}
      </div>
    </section>
  );
}
