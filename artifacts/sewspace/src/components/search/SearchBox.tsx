import { useEffect, useRef, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';

/** "/search?q=…&tab=…" (tab left out for the default, posts). */
export function searchHref(q = '', tab?: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (tab && tab !== 'posts') params.set('tab', tab);
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
}

/**
 * The site search field: a pill the height of the filter chips, with a clear
 * button. Explore submits it to /search; the search page passes onChange and
 * searches as you type.
 */
export function SearchBox({ value, onChange, onSubmit, autoFocus = false, className = '' }: {
  value: string; onChange: (value: string) => void; onSubmit?: (value: string) => void; autoFocus?: boolean; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    input.current?.blur();
    onSubmit?.(value);
  };
  return (
    <form role="search" onSubmit={submit} className={`relative flex items-center ${className}`}>
      <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-4 text-subtle" />
      <input ref={input} type="search" value={value} onChange={e => onChange(e.target.value)} maxLength={80}
        aria-label="Search Seams Club" placeholder="Search posts, people, tags…" enterKeyHint="search" autoComplete="off"
        className="min-h-[44px] w-full rounded-full border border-line bg-white pl-11 pr-11 text-[15px] text-ink outline-none placeholder:text-subtle focus:border-ink focus:ring-4 focus:ring-yellow [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" onClick={() => { onChange(''); input.current?.focus(); }} aria-label="Clear search"
          className="absolute right-0.5 grid h-11 w-11 place-items-center rounded-full text-subtle hover:text-ink">
          <X size={17} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
