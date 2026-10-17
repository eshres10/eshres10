import { useAuth } from '@clerk/react';
import { Search } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Logo } from '@/components/brand/Logo';
import { authHref } from '@/lib/navigation';
import { useHideOnScroll } from '@/components/shell/useHideOnScroll';

/** Public header, fixed edge-to-edge on mobile and floating on larger screens. */
export function PublicHeader() {
  const { isSignedIn } = useAuth();
  const [location] = useLocation();
  const hidden = useHideOnScroll(true, location);
  return (
    <>
    <div aria-hidden="true" className="h-[calc(5rem+env(safe-area-inset-top))] md:hidden" />
    <header className={`fixed inset-x-0 top-0 z-40 max-w-none px-0 pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out ${hidden ? '-translate-y-full' : 'translate-y-0'} md:static md:mx-auto md:max-w-[1232px] md:px-4 md:pt-5 md:transition-none md:translate-y-0`}>
      <nav aria-label="Main" className="flex w-full items-center justify-between gap-3 rounded-none bg-white py-2 pl-4 pr-2 shadow-float sm:py-3 sm:pl-[22px] sm:pr-3.5 md:rounded-[30px]">
        <Logo />
        <span className="hidden flex-1 items-center gap-1 pl-4 md:flex">
          <Link href="/explore" className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-canvas">Explore</Link>
          <Link href="/forum" className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-canvas">Forum</Link>
          <Link href="/challenges" className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-canvas">Challenges</Link>
          <Link href="/catalog" className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-canvas">Patterns</Link>
        </span>
        <span className="flex items-center gap-1 sm:gap-2">
        {location !== '/search' && <Link href="/search" aria-label="Search" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-canvas"><Search size={20} aria-hidden="true" /></Link>}
        {isSignedIn ? (
          <Link href="/feed" className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-[22px] text-[15px] font-semibold text-white no-underline">Open Seams Club</Link>
        ) : (
          <div className="flex gap-2">
            <Link href={authHref('sign-in')} className="hidden min-h-[44px] items-center rounded-full border border-ink px-[22px] text-[15px] font-medium text-ink no-underline sm:inline-flex">Log in</Link>
            <Link href={authHref('sign-up')} className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-[18px] text-[15px] font-semibold text-white no-underline sm:px-[22px]">Join<span className="hidden sm:inline">&nbsp;free</span></Link>
          </div>
        )}
        </span>
      </nav>
    </header>
    </>
  );
}
