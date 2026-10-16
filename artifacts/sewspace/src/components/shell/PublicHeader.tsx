import { useAuth } from '@clerk/react';
import { Link } from 'wouter';
import { Logo } from '@/components/brand/Logo';
import { authHref } from '@/lib/navigation';

/** Floating header for signed-out visitors on public pages. */
export function PublicHeader() {
  const { isSignedIn } = useAuth();
  return (
    <header className="mx-auto max-w-[1232px] px-4 pt-5">
      <nav aria-label="Main" className="flex items-center justify-between gap-3 rounded-[30px] bg-white py-2 pl-4 pr-2 shadow-float sm:py-3 sm:pl-[22px] sm:pr-3.5">
        <Logo />
        <span className="hidden flex-1 items-center gap-1 pl-4 md:flex">
          <Link href="/explore" className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-canvas">Explore</Link>
          <Link href="/catalog" className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-canvas">Patterns</Link>
        </span>
        {isSignedIn ? (
          <Link href="/feed" className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-[22px] text-[15px] font-semibold text-white no-underline">Open SewSpace</Link>
        ) : (
          <div className="flex gap-2">
            <Link href={authHref('sign-in')} className="hidden min-h-[44px] items-center rounded-full border border-ink px-[22px] text-[15px] font-medium text-ink no-underline sm:inline-flex">Log in</Link>
            <Link href={authHref('sign-up')} className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-[18px] text-[15px] font-semibold text-white no-underline sm:px-[22px]">Join<span className="hidden sm:inline">&nbsp;free</span></Link>
          </div>
        )}
      </nav>
    </header>
  );
}
