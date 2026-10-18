import { Link2 } from 'lucide-react';
import { linkLabel } from '@/lib/links';

/** The author's link on a post (migration 0022): opens in a new tab, never passes on ranking or the referrer. */
export function PostLink({ url, className = '' }: { url: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc"
      className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-canvas px-3 text-[13px] font-bold text-blue-ink no-underline hover:underline ${className}`}>
      <Link2 size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{linkLabel(url)}</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
