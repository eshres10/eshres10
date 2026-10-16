import { useId } from 'react';
import { Globe, Lock, Users } from 'lucide-react';

export type Visibility = 'private' | 'followers' | 'public';

export const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; help: string; icon: typeof Lock }> = [
  { value: 'private', label: 'Private', help: 'Only you', icon: Lock },
  { value: 'followers', label: 'Followers', help: 'People who follow you', icon: Users },
  { value: 'public', label: 'Public', help: 'Anyone, even without an account', icon: Globe },
];

/** Private / Followers / Public selector (design: make log). */
export function VisibilityPicker({ value, onChange, disabled = false, legend = 'Who can see this', note }: {
  value: Visibility; onChange: (value: Visibility) => void; disabled?: boolean; legend?: string; note?: string;
}) {
  const name = useId();
  const current = VISIBILITY_OPTIONS.find(o => o.value === value) ?? VISIBILITY_OPTIONS[0];
  return (
    <fieldset disabled={disabled}>
      <legend className="text-xs font-semibold">{legend}</legend>
      <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1" role="radiogroup">
        {VISIBILITY_OPTIONS.map(option => {
          const Icon = option.icon;
          const selected = option.value === value;
          return (
            <label key={option.value} className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold ${selected ? 'bg-ink text-white' : 'text-ink hover:bg-white'} ${disabled ? 'cursor-default opacity-60' : ''}`}>
              <input type="radio" name={name} value={option.value} checked={selected} onChange={() => onChange(option.value)} className="sr-only" data-testid={`visibility-${option.value}`} />
              <Icon size={15} aria-hidden="true" />{option.label}
            </label>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-subtle">{current.help}.{note ? ` ${note}` : ''}</p>
    </fieldset>
  );
}

/** Small label showing who can see an item. */
export function VisibilityBadge({ value, className = '' }: { value?: string | null; className?: string }) {
  const option = VISIBILITY_OPTIONS.find(o => o.value === value) ?? VISIBILITY_OPTIONS[0];
  const Icon = option.icon;
  const tone = option.value === 'public' ? 'bg-yellow text-ink' : option.value === 'followers' ? 'bg-ink text-white' : 'bg-canvas text-subtle';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone} ${className}`} title={`${option.label}: ${option.help.toLowerCase()}`}>
      <Icon size={11} aria-hidden="true" />{option.label}
    </span>
  );
}
