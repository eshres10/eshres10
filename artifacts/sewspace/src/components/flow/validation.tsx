import { useCallback, useState, type ReactNode } from 'react';

export type FieldErrors = Record<string, string | null | undefined | false>;

function firstError(errors: FieldErrors): string | null {
  return Object.keys(errors).find(k => errors[k]) ?? null;
}

/** Moves focus to a field's control (the invalid one first) and scrolls it into view. */
export function focusField(name: string) {
  const card = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(name)}"]`);
  if (!card) return;
  const target = card.querySelector<HTMLElement>('[aria-invalid="true"], [role="radio"][tabindex="0"], input, textarea, select, button');
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target?.focus({ preventScroll: true });
}

/**
 * Errors are worked out on every render, but only shown once the person has
 * pressed Next (or Save). Then they update live as fields are fixed, and focus
 * goes to the first invalid field. Order fields in `errors` as they appear.
 */
export function useValidation(errors: FieldErrors) {
  const [shown, setShown] = useState(false);
  const attempt = useCallback((onValid: () => void) => {
    const first = firstError(errors);
    if (!first) {
      setShown(false);
      onValid();
      return;
    }
    setShown(true);
    requestAnimationFrame(() => focusField(first));
  }, [errors]);
  return {
    shown,
    attempt,
    reset: useCallback(() => setShown(false), []),
    error: (name: string): string | undefined => (shown && errors[name]) || undefined,
  };
}

/** Accessible attributes for the control inside a FieldCard. */
export function fieldProps(name: string, error?: string) {
  return {
    id: `f-${name}`,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `f-${name}-error` : undefined,
  };
}

/** Accessible attributes for a chip group or segmented control inside a FieldCard. */
export function groupProps(name: string, error?: string) {
  return {
    'aria-labelledby': `f-${name}-label`,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `f-${name}-error` : undefined,
  };
}

/**
 * A white card holding one question. With an error it gets a 2 px red outline
 * and the message under the field. `group` labels a chip group instead of a
 * single input.
 */
export function FieldCard({ name, label, error, aside, hint, group = false, highlight = false, className = '', children }: {
  name: string;
  label: ReactNode;
  error?: string;
  /** Right of the label: "optional", "37 / 140". */
  aside?: ReactNode;
  hint?: ReactNode;
  group?: boolean;
  /** A value that came from a photo or PDF: shown with a soft yellow fill by the caller's input. */
  highlight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-field={name} data-highlight={highlight || undefined}
      className={`rounded-[26px] bg-white p-4 ${error ? 'outline outline-2 -outline-offset-2 outline-red-ink' : ''} ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {group
          ? <span id={`f-${name}-label`} className="text-sm font-semibold text-subtle">{label}</span>
          : <label htmlFor={`f-${name}`} id={`f-${name}-label`} className="text-sm font-semibold text-subtle">{label}</label>}
        {aside && <span className="shrink-0 text-xs font-semibold text-subtle">{aside}</span>}
      </div>
      {children}
      {hint && !error && <p className="mt-2 text-sm text-subtle">{hint}</p>}
      {error && <p id={`f-${name}-error`} className="mt-2 text-sm font-semibold text-red-ink">{error}</p>}
    </div>
  );
}
