import { SignIn, SignUp } from '@clerk/react';
import { basePath } from '@/lib/clerk';

// Clerk sends people back to the redirect_url query parameter after signing in
// (see lib/navigation.ts authHref); otherwise to the studio.
export function ClerkAuth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return <main className="grid min-h-[100dvh] place-items-center px-4 py-8">
    {mode === 'sign-in'
      ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/studio`} />
      : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/welcome`} />}
  </main>;
}
