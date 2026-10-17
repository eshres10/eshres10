export interface FlowStepDef {
  id: string;
  label: string;
  /** Not part of this run of the flow (e.g. Edit for a status post): shown struck through. */
  skipped?: boolean;
}

interface StepsProps {
  steps: readonly FlowStepDef[];
  current: string;
  canOpen: (id: string) => boolean;
  onStep: (id: string) => void;
}

function stateOf(steps: readonly FlowStepDef[], current: string, id: string) {
  const at = steps.findIndex(s => s.id === current);
  const i = steps.findIndex(s => s.id === id);
  return i === at ? 'current' : i < at ? 'done' : 'todo';
}

/** Phone: labelled segments under the header. Done steps (and every step in edit mode) can be opened. */
export function StepBar({ steps, current, canOpen, onStep }: StepsProps) {
  return (
    <ol className="grid gap-2 px-6" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Steps">
      {steps.map((s, i) => {
        const state = stateOf(steps, current, s.id);
        const open = state !== 'current' && !s.skipped && canOpen(s.id);
        const inner = (
          <>
            <span aria-hidden="true" className={`block h-[5px] rounded-full ${state === 'current' ? 'bg-ink' : state === 'done' && !s.skipped ? 'bg-yellow' : 'bg-line'}`} />
            <span className={`mt-1.5 block truncate text-left text-[13px] font-semibold ${state === 'current' ? 'text-ink' : 'text-subtle'} ${s.skipped ? 'line-through' : ''}`}>
              {s.label}
              <span className="sr-only">{`, step ${i + 1} of ${steps.length}`}{s.skipped ? ', skipped' : state === 'done' ? ', done' : ''}</span>
            </span>
          </>
        );
        return (
          <li key={s.id} aria-current={state === 'current' ? 'step' : undefined}>
            {open
              ? <button type="button" onClick={() => onStep(s.id)} className="block min-h-[44px] w-full pt-2">{inner}</button>
              : <span className="block min-h-[44px] pt-2">{inner}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Desktop: step pills in the dialog header. */
export function StepPills({ steps, current, canOpen, onStep }: StepsProps) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Steps">
      {steps.map((s, i) => {
        const state = stateOf(steps, current, s.id);
        const open = state !== 'current' && !s.skipped && canOpen(s.id);
        const cls = `inline-flex min-h-[40px] items-center gap-2 rounded-full px-3.5 text-sm font-bold ${state === 'current' ? 'bg-canvas text-ink' : 'bg-canvas text-subtle'} ${s.skipped ? 'line-through' : ''}`;
        const inner = (
          <>
            <span aria-hidden="true" className={`h-[5px] w-4 rounded-full ${state === 'current' ? 'bg-ink' : state === 'done' && !s.skipped ? 'bg-yellow' : 'bg-line'}`} />
            {s.label}
            <span className="sr-only">{`, step ${i + 1} of ${steps.length}`}{s.skipped ? ', skipped' : state === 'done' ? ', done' : ''}</span>
          </>
        );
        return (
          <li key={s.id} aria-current={state === 'current' ? 'step' : undefined}>
            {open ? <button type="button" onClick={() => onStep(s.id)} className={`${cls} hover:bg-line`}>{inner}</button> : <span className={cls}>{inner}</span>}
          </li>
        );
      })}
    </ol>
  );
}
