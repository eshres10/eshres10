import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { Heart } from 'lucide-react';
import { useLocation } from 'wouter';
import { authHref, currentAppPath } from '@/lib/navigation';

export interface SignInReason {
  /** e.g. "Sign in to like this make" */
  title: string;
  /** e.g. "It's free. You'll come straight back to this post." */
  body?: string;
}

type Ask = (reason: SignInReason) => boolean;
const PromptContext = createContext<Ask | null>(null);

/**
 * Returns a guard for actions that need an account (like, comment, follow,
 * post, join). Call it at the start of the action: it returns true when the
 * visitor is signed in, otherwise opens the sign-in sheet and returns false.
 */
export function useRequireSignIn(): Ask {
  const ask = useContext(PromptContext);
  if (!ask) throw new Error('useRequireSignIn needs <SignInPromptProvider>');
  return ask;
}

export function SignInPromptProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [reason, setReason] = useState<SignInReason | null>(null);
  const ask = useCallback<Ask>(next => {
    if (isSignedIn) return true;
    setReason(next);
    return false;
  }, [isSignedIn]);
  return (
    <PromptContext.Provider value={ask}>
      {children}
      {reason && <SignInSheet reason={reason} close={() => setReason(null)} />}
    </PromptContext.Provider>
  );
}

function SignInSheet({ reason, close }: { reason: SignInReason; close: () => void }) {
  const [, setLocation] = useLocation();
  const returnTo = useRef(currentAppPath()).current;
  const firstButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstButton.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/45 p-2 sm:items-center" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sign-in-title" className="w-full max-w-[440px] rounded-[32px] bg-white px-5 pb-[calc(1.4rem+env(safe-area-inset-bottom))] pt-3 sm:p-7">
        <span className="mx-auto mb-4 block h-[5px] w-11 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-red" aria-hidden="true"><Heart size={28} className="fill-white text-white" /></span>
        <h2 id="sign-in-title" className="mt-4 font-display text-[28px] leading-[1.05]">{reason.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-subtle">{reason.body ?? "It's free. You'll come straight back here afterwards."}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button ref={firstButton} type="button" onClick={() => setLocation(authHref('sign-up', returnTo))} className="min-h-[52px] rounded-full bg-yellow text-[15px] font-bold text-ink">Create a free account</button>
          <button type="button" onClick={() => setLocation(authHref('sign-in', returnTo))} className="min-h-[52px] rounded-full bg-ink text-[15px] font-bold text-white">I already have an account</button>
        </div>
        <button type="button" onClick={close} className="mt-2 min-h-[44px] w-full text-sm font-semibold text-subtle">Keep browsing</button>
      </div>
    </div>
  );
}
