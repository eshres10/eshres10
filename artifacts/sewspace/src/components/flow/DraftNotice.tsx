import { timeAgo } from '@/lib/time';

function savedWhen(updatedAt: string): string {
  const t = timeAgo(updatedAt);
  return t === 'now' ? 'just now' : /^\d+[mhd]$/.test(t) ? `${t} ago` : `on ${t}`;
}

/** "Draft · Lavender sundress, saved 3h ago · Start over": shown when a flow opened on a saved draft. */
export function DraftNotice({ updatedAt, summary, onStartOver }: { updatedAt: string; summary?: string; onStartOver: () => void }) {
  return (
    <p className="mb-3 flex flex-wrap items-center justify-center gap-x-1.5 rounded-full bg-white px-4 py-2 text-center text-sm text-subtle">
      <span><b className="text-ink">Draft</b>{summary ? ` · ${summary}` : ''}, saved {savedWhen(updatedAt)}</span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onStartOver} className="min-h-[44px] font-bold text-ink underline">Start over</button>
    </p>
  );
}
