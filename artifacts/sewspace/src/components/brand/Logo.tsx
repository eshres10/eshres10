import { Link } from 'wouter';

/** Seams Club logo artwork. */
export function Logo({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return <Link href={href} aria-label="Seams Club home" data-testid="link-logo" className={`flex items-center gap-2.5 no-underline ${dark ? 'text-white' : 'text-ink'}`}>
    <img src="/seams-club-logo.png" alt="" aria-hidden="true" className="h-[47px] w-[132px] shrink-0 object-contain" />
  </Link>;
}
