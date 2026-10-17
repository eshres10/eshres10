import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label isn't text (a colour swatch). */
  name?: string;
}

const chip = (on: boolean) =>
  `inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition-colors ${on ? 'border-ink bg-yellow text-ink' : 'border-line bg-white text-ink hover:border-ink'}`;

// Arrow keys move between radios and select, as native radio groups do.
function useRovingRadios<T extends string>(options: readonly Choice<T>[], onChange: (v: T) => void) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return { refs, onKeyDown };
}

/**
 * Pick one. Starts empty when `value` is null: nothing is chosen for the
 * person. With `clearable`, choosing the selected chip again clears it (for
 * optional questions).
 */
export function ChoiceChips<T extends string>({ options, value, onChange, clearable = false, labelledBy, className = '', ...aria }: {
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  clearable?: boolean;
  labelledBy?: string;
  className?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}) {
  const { refs, onKeyDown } = useRovingRadios(options, v => onChange(v));
  const focusIndex = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div role="radiogroup" aria-labelledby={labelledBy ?? aria['aria-labelledby']} aria-invalid={aria['aria-invalid']} aria-describedby={aria['aria-describedby']}
      className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o, i) => (
        <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={value === o.value}
          aria-label={o.name} tabIndex={i === focusIndex ? 0 : -1}
          onClick={() => onChange(value === o.value && clearable ? null : o.value)} onKeyDown={e => onKeyDown(e, i)}
          className={chip(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pick any number. Each chip is a toggle button (aria-pressed). */
export function ToggleChips<T extends string>({ options, value, onChange, max, className = '', ...aria }: {
  options: readonly Choice<T>[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  max?: number;
  className?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}) {
  const full = max !== undefined && value.length >= max;
  return (
    <div role="group" {...aria} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map(o => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} aria-label={o.name} disabled={!on && full}
            onClick={() => onChange(on ? value.filter(v => v !== o.value) : [...value, o.value])}
            className={`${chip(on)} disabled:opacity-40`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Two to four options in a pill track (Metres / Yards). Also a radiogroup. */
export function Segmented<T extends string>({ options, value, onChange, className = '', ...aria }: {
  // T comes from `value` alone, so callers never write <Segmented<T>>
  // (Replit's dev-only JSX tagger can't parse type arguments on JSX).
  options: readonly Choice<NoInfer<T>>[];
  value: T | null;
  onChange: (v: NoInfer<T>) => void;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}) {
  const { refs, onKeyDown } = useRovingRadios(options, onChange);
  const focusIndex = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div role="radiogroup" {...aria} className={`grid gap-1 rounded-full bg-white p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o, i) => (
        <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={value === o.value} aria-label={o.name}
          tabIndex={i === focusIndex ? 0 : -1} onClick={() => onChange(o.value)} onKeyDown={e => onKeyDown(e, i)}
          className={`min-h-[44px] rounded-full px-4 text-sm font-bold ${value === o.value ? 'bg-ink text-white' : 'text-ink hover:bg-canvas'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
