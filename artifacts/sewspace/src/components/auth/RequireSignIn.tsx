import type { ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { Redirect } from 'wouter';
import { Loading } from '@/components/common';
import { authHref } from '@/lib/navigation';

/** Private pages: signed-out visitors go to sign-in and come back here afterwards. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="p-6"><Loading /></div>;
  if (!isSignedIn) return <Redirect to={authHref('sign-in')} replace />;
  return <>{children}</>;
}
