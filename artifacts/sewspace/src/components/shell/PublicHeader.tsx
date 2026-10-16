import { useAuth } from '@clerk/react';
import { Link } from 'wouter';
import { Logo } from '@/components/brand/Logo';
import { authHref } from '@/lib/navigation';

/** Floating header for signed-out visitors on public pages. */
export function PublicHeader() {
  const { isSignedIn } = useAuth();
  return (
    <header className="mx-auto max-w-[1232px] px-4 pt-5">
      <nav aria-label="Main" className="flex flex-wrap items-center justify-between gap-3 rounded-[30px] bg-white py-3 pl-[22px] pr-3.5 shadow-float">
        <Logo />
        {isSignedIn ? (
          <Link href="/studio" className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-[22px] text-[15px] font-semibold text-white no-underline">Open your studio</Link>
        ) : (
          <div className="flex gap-2">
            <Link href={authHref('sign-in')} className="inline-flex min-h-[44px] items-center rounded-full border border-ink px-[22px] text-[15px] font-medium text-ink no-underline">Log in</Link>
            <Link href={authHref('sign-up')} className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-[22px] text-[15px] font-semibold text-white no-underline">Join free</Link>
          </div>
        )}
      </nav>
    </header>
  );
}
