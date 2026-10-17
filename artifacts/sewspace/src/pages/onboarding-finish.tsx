import { useEffect, useState } from 'react';
import { useGetOnboarding, useGetOnboardingRecommendations, useGetProfile, type CatalogEntry, type ChallengeSummary } from '@workspace/api-client-react';
import { X } from 'lucide-react';
import { Link, Redirect, useLocation } from 'wouter';
import { RequireSignIn } from '@/components/auth/RequireSignIn';
import { capitalise, catalogPath } from '@/components/catalog/parts';
import { Loading } from '@/components/common';
import { MAKE_ART } from '@/components/onboarding/copy';
import { Pip } from '@/components/onboarding/Pip';
import { Glyph, OnboardingPage } from '@/components/onboarding/Shell';

// The end of onboarding (Phase O5): Setting up, then Ready, both built from
// the person's own answers and /api/onboarding/recommendations (public
// catalog pattern pages and running challenges only). Plus the Home card for
// people who skipped.

const STEP_MS = 650; // three ticks, then Ready at about 2.6 s
const DAY = 86_400_000;

function useFinished() {
  const onboarding = useGetOnboarding();
  return { onboarding, ready: Boolean(onboarding.data?.completedAt) };
}

/** /welcome/setup: three rows tick in turn while the recommendations load, with "Skip ahead". */
export function SettingUpRoute() {
  return <RequireSignIn><SettingUp /></RequireSignIn>;
}

function SettingUp() {
  const { onboarding, ready } = useFinished();
  const [, setLocation] = useLocation();
  const [tick, setTick] = useState(0);
  useGetOnboardingRecommendations({ query: { enabled: ready } }); // warm the Ready screen
  useEffect(() => {
    if (!ready) return;
    const timers = [1, 2, 3].map(t => window.setTimeout(() => setTick(t), STEP_MS * t));
    timers.push(window.setTimeout(() => setLocation('/welcome/ready', { replace: true }), STEP_MS * 4));
    return () => timers.forEach(window.clearTimeout);
  }, [ready, setLocation]);
  if (onboarding.isLoading) return <Loading />;
  if (!ready) return <Redirect to="/welcome" replace />;
  const beginner = !onboarding.data?.experience || onboarding.data.experience === 'start';
  const rows = [beginner ? 'Finding beginner-friendly patterns' : 'Finding patterns for you', 'Picking a challenge you’ll like', 'Locking your stash so only you see it'];
  return (
    <OnboardingPage background="peach">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] text-center md:justify-center md:pt-0">
        <Pip pose="focus" size={170} />
        <h1 className="mt-5 font-display text-[30px] leading-[1.05] tracking-[-.05em] md:text-[36px]">Threading your studio…</h1>
        <div role="progressbar" aria-label="Setting up" aria-valuemin={0} aria-valuemax={3} aria-valuenow={tick}
          className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-white">
          <span className="block h-full rounded-full bg-ink transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round((tick / 3) * 100)}%` }} />
        </div>
        <ul className="mt-6 flex w-full flex-col gap-2.5 text-left" aria-live="polite">
          {rows.map((label, n) => {
            const done = n < tick;
            return (
              <li key={label} className={`flex min-h-[54px] items-center gap-3 rounded-[18px] px-4 text-[15px] font-semibold ${done ? 'bg-white' : 'bg-white/45'}`}>
                <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? 'bg-ink text-white' : 'border-2 border-ink/60'}`}>
                  {done && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                {label}<span className="sr-only">{done ? ' (done)' : ''}</span>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setLocation('/welcome/ready', { replace: true })} className="mt-auto min-h-[44px] pt-8 text-[15px] font-bold underline underline-offset-4 md:mt-8">Skip ahead</button>
      </div>
    </OnboardingPage>
  );
}

/** /welcome/ready */
export function ReadyRoute() {
  return <RequireSignIn><Ready /></RequireSignIn>;
}

const STEP_TONES = ['bg-yellow text-ink', 'bg-blue text-white', 'bg-peach text-ink'];
/** Catalog pattern categories → Question 4's drawings. */
const CATEGORY_ART: Record<string, string> = { dresses: 'Dresses', tops: 'Tops', skirts: 'Skirts', trousers: 'Trousers', outerwear: 'Outerwear', knitwear: 'Knits', bags: 'Bags' };
const PATTERN_TONES = ['bg-blue-soft', 'bg-peach-soft', 'bg-mist'];

function PatternCard({ entry, index }: { entry: CatalogEntry; index: number }) {
  const art = MAKE_ART[CATEGORY_ART[entry.category] ?? ''];
  return (
    <Link href={catalogPath(entry)} className="block min-w-0 text-ink no-underline">
      <span className={`grid aspect-[4/5] place-items-center rounded-[18px] ${PATTERN_TONES[index % PATTERN_TONES.length]}`} aria-hidden="true">
        {art
          ? <svg viewBox="0 0 48 48" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={art} /></svg>
          : <Glyph name="book" size={34} />}
      </span>
      <span className="mt-2 block truncate text-[15px] font-bold">{entry.name}</span>
      <span className="block truncate text-[13px] text-subtle">{[capitalise(entry.category), entry.difficulty && capitalise(entry.difficulty)].filter(Boolean).join(' · ')}</span>
    </Link>
  );
}

function challengeMeta(c: ChallengeSummary) {
  const now = Date.now();
  const starts = new Date(c.startsAt).getTime();
  if (starts > now) return `Starts in ${Math.ceil((starts - now) / DAY)} days`;
  const left = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - now) / DAY));
  return `${left} ${left === 1 ? 'day' : 'days'} left · ${c.members} joined`;
}

function Ready() {
  const { onboarding, ready } = useFinished();
  const profile = useGetProfile();
  const recs = useGetOnboardingRecommendations({ query: { enabled: ready } });
  if (onboarding.isLoading || profile.isLoading) return <Loading />;
  if (!ready) return <Redirect to="/welcome" replace />;
  const name = profile.data?.name && profile.data.name !== 'Maker' ? profile.data.name : '';
  const data = recs.data;
  return (
    <OnboardingPage background="yellow">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-36 pt-[calc(2.5rem+env(safe-area-inset-top))] md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] md:items-center md:gap-12 md:px-10 md:pb-16 md:pt-10">
        <div className="flex flex-col items-center text-center">
          <Pip pose="cheer" size={240} className="h-[150px] w-[150px] md:h-[240px] md:w-[240px]" />
          <h1 className="mt-3 font-display text-[32px] leading-[1.05] tracking-[-.05em] md:text-[48px]">{name ? `You’re all set, ${name}!` : 'You’re all set!'}</h1>
          <p className="mt-2 text-[16px] leading-relaxed">Here’s where I’d start. You can change any of this later.</p>
          <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-yellow from-70% to-transparent px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-8 md:static md:mt-6 md:w-full md:bg-none md:p-0">
            <Link href="/studio" className="mx-auto flex min-h-[58px] max-w-[560px] items-center justify-center rounded-full bg-ink text-[17px] font-bold text-white no-underline">Go to my studio</Link>
            <Link href="/feed" className="mt-1 hidden min-h-[44px] items-center justify-center text-[15px] font-bold text-ink underline underline-offset-4 md:flex">or browse the feed</Link>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 md:mt-0">
          {!data ? <div className="rounded-[26px] bg-white p-6"><Loading /></div> : <>
            <section aria-labelledby="start-here" className="rounded-[26px] bg-white p-4 md:rounded-[30px] md:p-6">
              <h2 id="start-here" className="font-display text-[20px] tracking-[-.03em] md:text-[24px]">Start here</h2>
              <ol className="mt-3 grid gap-2 md:grid-cols-3 md:gap-3">
                {data.firstSteps.map((s, i) => (
                  <li key={s.id}>
                    <Link href={s.href} className="flex min-h-[56px] items-center gap-3 rounded-[18px] bg-canvas px-3 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-line md:min-h-[120px] md:flex-col md:items-start md:p-4">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${STEP_TONES[i]}`} aria-hidden="true">{i + 1}</span>
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
            {data.patterns.length > 0 && (
              <section aria-labelledby="patterns-for-you" className="rounded-[26px] bg-white p-4 md:rounded-[30px] md:p-6">
                <h2 id="patterns-for-you" className="font-display text-[20px] tracking-[-.03em] md:text-[24px]">{data.patternsTitle}</h2>
                <div className="mt-3 grid grid-cols-3 gap-2.5 md:gap-3">{data.patterns.map((p, i) => <PatternCard key={p.id} entry={p} index={i} />)}</div>
              </section>
            )}
            {data.challenge && (
              <Link href={`/challenges/${data.challenge.slug}`} className="flex items-center gap-3 rounded-[22px] bg-ink px-4 py-3 text-white no-underline md:rounded-[30px] md:px-6 md:py-4">
                <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-yellow text-ink" aria-hidden="true"><Glyph name="trophy" size={26} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[.12em] text-yellow">A challenge for you</span>
                  <b className="block truncate text-[16px]">{data.challenge.title}</b>
                  <span className="block text-[13px] text-white/75">{challengeMeta(data.challenge)}</span>
                </span>
              </Link>
            )}
            <Link href="/feed" className="flex min-h-[44px] items-center justify-center text-[15px] font-bold text-ink underline underline-offset-4 md:hidden">or browse the feed</Link>
          </>}
        </div>
      </div>
    </OnboardingPage>
  );
}

const DISMISSED = 'seams.pip-card-dismissed';

/** Home: after "Skip for now" / "Finish setup later", a small card to carry on (dismissible, per browser). */
export function FinishSetupCard() {
  const onboarding = useGetOnboarding();
  const [hidden, setHidden] = useState(() => { try { return window.localStorage.getItem(DISMISSED) === '1'; } catch { return false; } });
  const data = onboarding.data;
  if (hidden || !data?.skippedAt || data.completedAt) return null;
  const dismiss = () => { setHidden(true); try { window.localStorage.setItem(DISMISSED, '1'); } catch { /* hidden for this visit only */ } };
  return (
    <section aria-label="Finish setting up" className="relative flex items-center gap-3 rounded-[26px] bg-yellow p-3.5 pr-12 md:rounded-[30px] md:p-4 md:pr-14">
      <Pip pose="wave" size={64} bob={false} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[18px] leading-tight tracking-[-.03em]">Finish setting up with Pip</p>
        <p className="mt-0.5 text-sm">A few quick questions and I’ll suggest patterns and a challenge.</p>
        <Link href="/welcome" className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-ink px-5 text-sm font-bold text-white no-underline">Carry on</Link>
      </div>
      <button type="button" onClick={dismiss} aria-label="Hide this card" className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center rounded-full hover:bg-white/50"><X size={18} aria-hidden="true" /></button>
    </section>
  );
}
