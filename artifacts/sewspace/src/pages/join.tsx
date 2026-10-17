import { SignUp, useAuth } from '@clerk/react';
import { Link, Redirect } from 'wouter';
import { Logo } from '@/components/brand/Logo';
import { Pip } from '@/components/onboarding/Pip';
import { basePath } from '@/lib/clerk';

// Join (Phase O3): the "Join free" buttons across the site come here. The
// sign-up itself is Clerk's own form, so it shows exactly the methods switched
// on in the Clerk dashboard (Google, Apple, email link or code) and keeps
// Clerk's verification, bot protection and "already have an account" handling.
// It's styled to match the design: pill buttons, Google in black, no Clerk
// header or footer. New accounts go to /welcome (Meet Pip).

const appearance = {
  layout: { socialButtonsVariant: 'blockButton' as const, socialButtonsPlacement: 'top' as const },
  elements: {
    rootBox: '!w-full',
    cardBox: '!w-full !max-w-none !border-0 !bg-transparent !rounded-none !shadow-none',
    card: '!p-0 !gap-4 !shadow-none !bg-transparent',
    header: '!hidden',
    footer: '!hidden',
    socialButtonsBlockButton: '!min-h-[56px] !rounded-full !border-2 !border-ink !bg-white',
    socialButtonsBlockButtonText: '!text-[17px] !font-bold !text-ink',
    socialButtonsBlockButton__google: '!bg-ink',
    socialButtonsBlockButtonText__google: '!text-white',
    dividerText: '!text-subtle',
    formFieldInput: '!min-h-[56px] !rounded-full !border-2 !border-ink !px-5 !text-[17px]',
    formButtonPrimary: '!min-h-[56px] !rounded-full !border-2 !border-ink !bg-white !text-[17px] !font-bold !text-ink hover:!bg-ink hover:!text-white',
    formFieldErrorText: '!text-red-ink !font-semibold',
  },
};

function LogIn({ className = '' }: { className?: string }) {
  return <p className={`text-[15px] ${className}`}>Already a member? <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">Log in</Link></p>;
}

export function JoinPage() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/feed" replace />;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] md:px-10 md:pt-7">
        <Logo />
        <LogIn className="hidden md:block" />
      </header>
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:grid md:grid-cols-2 md:items-center md:gap-10 md:px-10 md:pb-16">
        <div className="grid flex-1 place-items-center py-6 md:flex-none md:gap-6 md:py-0">
          <Pip pose="wave" size={240} className="h-[150px] w-[150px] md:h-[240px] md:w-[240px]" />
          <p className="hidden text-center font-display text-[44px] leading-[1.02] tracking-[-.05em] md:block">A home for your sewing.</p>
        </div>
        <section className="md:rounded-[40px] md:bg-white md:p-10" aria-labelledby="join-title">
          <h1 id="join-title" className="font-display text-[40px] leading-[1.02] tracking-[-.05em]">Join Seams Club</h1>
          <p className="mt-2 text-[17px] leading-relaxed md:text-subtle">Free for everyone. No ads, and your stash stays private.</p>
          <div className="mt-6">
            <SignUp routing="path" path={`${basePath}/join`} signInUrl={`${basePath}/sign-in`}
              forceRedirectUrl={`${basePath}/welcome`} signInFallbackRedirectUrl={`${basePath}/feed`} appearance={appearance} />
          </div>
          <LogIn className="mt-5 text-center md:hidden" />
        </section>
      </main>
    </div>
  );
}
