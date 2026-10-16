import { useEffect, useId, useState } from 'react';
import { useCheckHandleAvailability } from '@workspace/api-client-react';
import { Check, Loader2, X } from 'lucide-react';

const REASON_TEXT: Record<string, string> = {
  taken: 'That handle is taken.',
  reserved: 'That handle is reserved.',
  too_short: 'Use at least 3 characters.',
  too_long: 'Use at most 30 characters.',
  invalid_characters: 'Use lowercase letters, numbers, _ and . only.',
};

/** Lowercases and strips characters a handle can't contain, as the person types. */
export function cleanHandleInput(value: string): string {
  return value.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
}

/** A display name as a starting handle ("Ana María" -> "ana.maria"). The server suggests a free one if it's taken. */
export function handleFromName(name: string): string {
  return cleanHandleInput(name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.')).replace(/^[._]+|[._]+$/g, '').replace(/\.{2,}/g, '.');
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Handle input with a live availability check against the server. Reports
 * whether the current value can be saved through onValidityChange.
 */
export function HandleField({ value, onChange, onValidityChange }: { value: string; onChange: (value: string) => void; onValidityChange: (valid: boolean) => void }) {
  const id = useId();
  const debounced = useDebounced(value, 350);
  const check = useCheckHandleAvailability({ handle: debounced }, { query: { enabled: debounced.length > 0, staleTime: 5000, retry: false } });
  const settled = debounced === value && !check.isFetching;
  const result = settled ? check.data : undefined;
  const valid = Boolean(result?.available);
  useEffect(() => { onValidityChange(valid); }, [valid, onValidityChange]);

  let status: React.ReactNode = <span className="text-subtle">3–30 characters: lowercase letters, numbers, _ and .</span>;
  if (value && !settled) status = <span className="inline-flex items-center gap-1.5 text-subtle"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Checking…</span>;
  else if (result?.available) status = <span className="inline-flex items-center gap-1.5 font-semibold text-blue-ink"><Check size={15} aria-hidden="true" />{result.reason === 'yours' ? 'This is your handle.' : `@${result.handle} is available.`}</span>;
  else if (result) status = (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-red-ink">
      <X size={15} aria-hidden="true" />{REASON_TEXT[result.reason] ?? "That handle can't be used."}
      {result.suggestion && <button type="button" onClick={() => onChange(result.suggestion!)} className="rounded-full border border-ink px-3 py-1 text-xs font-bold text-ink">Use @{result.suggestion}</button>}
    </span>
  );

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold">Handle</label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-[.85rem] top-1/2 -translate-y-1/2 font-semibold text-subtle" aria-hidden="true">@</span>
        <input id={id} value={value} onChange={e => onChange(cleanHandleInput(e.target.value))} autoComplete="off" autoCapitalize="none" spellCheck={false}
          inputMode="text" maxLength={30} required aria-describedby={`${id}-status`} className="field !pl-8" data-testid="input-handle" />
      </div>
      <p id={`${id}-status`} aria-live="polite" className="mt-2 min-h-[1.5rem] text-[13px]">{status}</p>
    </div>
  );
}
