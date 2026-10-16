import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProfileQueryKey, useGetProfile, useUpdateProfile } from '@workspace/api-client-react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { RequireSignIn } from '@/components/auth/RequireSignIn';
import { Logo } from '@/components/brand/Logo';
import { Loading } from '@/components/common';
import { HandleField, handleFromName } from '@/components/profile/HandleField';
import { safeReturnPath } from '@/lib/navigation';

function errorMessage(error: unknown): string {
  return (error as { data?: { error?: string } })?.data?.error ?? "We couldn't save that. Try again.";
}

function WelcomeForm() {
  const profile = useGetProfile();
  const update = useUpdateProfile();
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const next = safeReturnPath(new URLSearchParams(useSearch()).get('next'));
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [valid, setValid] = useState(false);
  const [handleTouched, setHandleTouched] = useState(false);
  const onValidity = useCallback((v: boolean) => setValid(v), []);

  useEffect(() => {
    if (!profile.data) return;
    const startName = profile.data.name === 'Maker' ? '' : profile.data.name;
    setName(startName);
    setHandle(profile.data.handle ?? handleFromName(startName));
  }, [profile.data]);

  if (profile.isLoading || !profile.data) return <Loading />;
  if (!profile.data.needsHandle) return <Redirect to={next} replace />;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !name.trim()) return;
    update.mutate({ data: { handle, name: name.trim() } }, {
      onSuccess: data => {
        client.setQueryData(getGetProfileQueryKey(), data);
        setLocation(next, { replace: true });
      },
    });
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block text-xs font-semibold">Your name
        <input value={name} onChange={e => { setName(e.target.value); if (!handleTouched) setHandle(handleFromName(e.target.value)); }}
          required maxLength={100} autoComplete="name" className="field mt-1.5" data-testid="input-name" />
      </label>
      <HandleField value={handle} onChange={value => { setHandleTouched(true); setHandle(value); }} onValidityChange={onValidity} />
      {update.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorMessage(update.error)}</p>}
      <button type="submit" disabled={!valid || !name.trim() || update.isPending} className="btn btn-primary w-full disabled:opacity-50" data-testid="button-save-handle">
        {update.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}Continue <ArrowRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}

/** First visit after signing up: pick a handle, then go back to where you were heading. */
export function WelcomePage() {
  return (
    <RequireSignIn>
      <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
        <section className="w-full max-w-[460px] rounded-[40px] bg-white p-7 sm:p-10">
          <Logo />
          <p className="eyebrow mt-8">Welcome to SewSpace</p>
          <h1 className="mt-2 font-display text-[34px] leading-[1.05]">Choose your handle</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-subtle">It's how people find you and your makes. Your profile page will be at sewspace/@handle. You can change it later in settings.</p>
          <div className="mt-7"><WelcomeForm /></div>
        </section>
      </main>
    </RequireSignIn>
  );
}
