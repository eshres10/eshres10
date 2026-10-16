import { Scissors } from 'lucide-react';
import { Link } from 'wouter';

/** SewSpace wordmark. `mark` is the square behind the scissors: yellow on white surfaces, black on the yellow sidebar. */
export function Logo({ dark = false, mark = 'yellow', href = '/' }: { dark?: boolean; mark?: 'yellow' | 'black'; href?: string }) {
  return <Link href={href} data-testid="link-logo" className={`flex items-center gap-2.5 no-underline ${dark ? 'text-white' : 'text-ink'}`}>
    <span className={`grid h-9 w-9 place-items-center rounded-[11px] ${mark === 'black' ? 'bg-ink text-yellow' : 'bg-yellow text-ink'}`} aria-hidden="true"><Scissors size={17} strokeWidth={2.2} /></span>
    <span className="font-display text-[21px] tracking-[-.04em]">sewspace</span>
  </Link>;
}
