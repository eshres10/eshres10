import { useState } from 'react';
import { useSheetDirty } from '@/components/social/Sheet';
import { useCreateChallenge, type Challenge, type ChallengeSummary } from '@workspace/api-client-react';
import { Loader2, Trophy, Users } from 'lucide-react';
import { Link } from 'wouter';

export function errorText(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? fallback;
}

const dayMonth = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

/** "1–31 October 2026", or across months "28 September – 5 October 2026". */
export function dateRange(start: string | Date, end: string | Date): string {
  const a = new Date(start), b = new Date(end);
  const year = b.toLocaleDateString(undefined, { year: 'numeric' });
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${b.toLocaleDateString(undefined, { month: 'long' })} ${year}`;
  }
  return `${dayMonth(a)} – ${dayMonth(b)} ${year}`;
}

export const STATUS_LABEL = { active: 'Active', upcoming: 'Starting soon', ended: 'Ended' } as const;

export function StatusPill({ status }: { status: ChallengeSummary['status'] }) {
  const tone = status === 'active' ? 'bg-yellow text-ink' : status === 'upcoming' ? 'bg-blue text-white' : 'bg-line text-ink';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export function ChallengeCard({ challenge: c }: { challenge: ChallengeSummary }) {
  return (
    <Link href={`/challenges/${c.slug}`} className="flex flex-col rounded-[30px] bg-white p-5 text-ink no-underline hover:outline hover:outline-2 hover:outline-ink">
      <span className="flex flex-wrap items-center gap-2"><span className="font-display text-lg tracking-[-.03em]">#{c.tag}</span><StatusPill status={c.status} /></span>
      <span className="mt-1.5 font-display text-[22px] leading-tight tracking-[-.04em]">{c.title}</span>
      <span className="mt-1 text-sm text-subtle">{dateRange(c.startsAt, c.endsAt)} · by @{c.host.handle}</span>
      {c.description && <span className="mt-2 line-clamp-2 text-sm">{c.description}</span>}
      <span className="mt-auto flex gap-4 pt-4 text-sm">
        <span className="inline-flex items-center gap-1.5"><Users size={15} aria-hidden="true" /><b>{c.members}</b> joined</span>
        <span className="inline-flex items-center gap-1.5"><Trophy size={15} aria-hidden="true" /><b>{c.entries}</b> entries</span>
      </span>
    </Link>
  );
}

const toInputDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Start a challenge: tag, title, what to sew, rules, and dates (whole days, local time). */
export function NewChallengeForm({ onCreated, onCancel }: { onCreated: (c: Challenge) => void; onCancel: () => void }) {
  const create = useCreateChallenge();
  const today = new Date();
  const [form, setForm] = useState({
    tag: '', title: '', description: '', rules: '',
    start: toInputDate(today), end: toInputDate(new Date(today.getTime() + 30 * 86400000)),
  });
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  useSheetDirty(Boolean(form.tag.trim() || form.title.trim() || form.description.trim() || form.rules.trim()));
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      // Starts at the beginning of the first day and ends at the end of the last, in your time zone.
      const startsAt = new Date(`${form.start}T00:00:00`), endsAt = new Date(`${form.end}T23:59:59`);
      create.mutate({ data: { tag: form.tag.replace(/^#/, ''), title: form.title, description: form.description, rules: form.rules, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } }, { onSuccess: onCreated });
    }}>
      <h2 className="font-display text-2xl">Start a challenge</h2>
      <p className="text-sm text-subtle">You'll host it: you can reword it and remove entries that break your rules. The tag and dates can't change once it's started.</p>
      <label className="block text-xs font-semibold">Tag
        <span className="mt-1.5 flex items-center rounded-[16px] border border-ink bg-white pl-3 focus-within:ring-4 focus-within:ring-yellow">
          <span aria-hidden="true" className="font-bold">#</span>
          <input value={form.tag} onChange={e => set('tag', e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 30))} required minLength={3} className="min-h-[48px] flex-1 rounded-[16px] bg-transparent px-1 text-[16px] outline-none" placeholder="OctoberDenim" />
        </span>
      </label>
      <label className="block text-xs font-semibold">Title
        <input value={form.title} onChange={e => set('title', e.target.value.slice(0, 80))} required className="field mt-1.5" placeholder="October Denim Challenge" />
      </label>
      <label className="block text-xs font-semibold">What to sew
        <textarea value={form.description} onChange={e => set('description', e.target.value.slice(0, 2000))} rows={3} className="field mt-1.5 resize-y" placeholder="Sew anything in denim this month…" />
      </label>
      <label className="block text-xs font-semibold">Rules <span className="font-normal text-subtle">(one per line)</span>
        <textarea value={form.rules} onChange={e => set('rules', e.target.value.slice(0, 2000))} rows={3} className="field mt-1.5 resize-y" placeholder={'Finished makes only\nTag the fabric you used'} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold">Starts
          <input type="date" value={form.start} min={toInputDate(today)} onChange={e => set('start', e.target.value)} required className="field mt-1.5" />
        </label>
        <label className="block text-xs font-semibold">Ends
          <input type="date" value={form.end} min={form.start} onChange={e => set('end', e.target.value)} required className="field mt-1.5" />
        </label>
      </div>
      {create.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(create.error, "That didn't start. Try again.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={form.tag.length < 3 || !form.title.trim() || create.isPending} className="btn btn-primary flex-1 disabled:opacity-50">{create.isPending && <Loader2 size={15} className="animate-spin" />}Start challenge</button>
      </div>
    </form>
  );
}
