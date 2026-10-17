import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  completeOnboarding, getGetOnboardingQueryKey, getGetProfileQueryKey, skipOnboarding, updateOnboarding, updateProfile,
  useGetOnboarding, useGetProfile, type Onboarding, type OnboardingUpdate, type Profile, type ProfileUpdate,
} from '@workspace/api-client-react';
import { Lock } from 'lucide-react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { RequireSignIn } from '@/components/auth/RequireSignIn';
import { Loading } from '@/components/common';
import { HandleField, handleFromName } from '@/components/profile/HandleField';
import { AUDIENCE, EXPERIENCE, EXPERIENCE_LEVEL, GOALS, MAKES, QUESTIONS, QUESTION_COUNT, STASH, TOOLS, type Answers } from '@/components/onboarding/copy';
import { Pip } from '@/components/onboarding/Pip';
import { MultiOptions, OnboardingPage, QuestionScreen, SingleOptions, TileOptions, type PickMethod } from '@/components/onboarding/Shell';

// Onboarding with Pip (Phase O). /welcome is Meet Pip, /welcome/1 … /welcome/7
// the questions. Every step saves: Pip's own answers to /api/onboarding, and
// name, experience, things to make and default post visibility to the
// existing profile fields (PATCH /profile). Leaving halfway and coming back
// resumes at current_step; going back keeps the answers.

const AFTER_FINISH = '/studio'; // Setting up and Ready come in O5.
const AFTER_SKIP = '/feed';

function errorMessage(error: unknown): string {
  return (error as { data?: { error?: string } })?.data?.error ?? 'We couldn’t save that. Try again.';
}

/** The answers as they're saved: onboarding row plus the profile fields it uses. */
function answersFrom(onboarding: Onboarding, profile: Profile): Answers {
  return {
    name: profile.name === 'Maker' ? '' : profile.name,
    goals: onboarding.goals,
    experience: onboarding.experience,
    makes: profile.favoriteGarments.map(canonicalMake).filter((m): m is string => m !== null),
    tools: onboarding.tools,
    stashSize: onboarding.stashSize,
    // The profile default (public) isn't a choice made here: question 7 starts
    // unanswered until setup has been finished once.
    audience: onboarding.completedAt ? profile.defaultPostVisibility : null,
  };
}

/** "dresses" (typed in Settings) → "Dresses"; null for things that aren't one of Pip's options. */
function canonicalMake(value: string): string | null {
  return MAKES.find(m => m.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

/** The step to resume at: the saved one, or question 1. */
function resumeStep(onboarding: Onboarding) {
  return onboarding.currentStep >= 1 && onboarding.currentStep <= QUESTION_COUNT ? onboarding.currentStep : 1;
}

function useSaver() {
  const client = useQueryClient();
  return {
    async onboarding(data: OnboardingUpdate) {
      client.setQueryData(getGetOnboardingQueryKey(), await updateOnboarding(data));
    },
    async profile(data: ProfileUpdate) {
      client.setQueryData(getGetProfileQueryKey(), await updateProfile(data));
    },
    async skip() {
      client.setQueryData(getGetOnboardingQueryKey(), await skipOnboarding());
    },
    async complete() {
      client.setQueryData(getGetOnboardingQueryKey(), await completeOnboarding());
    },
  };
}

/** /welcome: Meet Pip. (New accounts choose their @handle on question 1.) */
export function WelcomeRoute() {
  return <RequireSignIn><MeetPip /></RequireSignIn>;
}

/** Questions 3 and 6 move on this long after a tap or click (never after a keyboard pick). */
const AUTO_ADVANCE_MS = 350;

function MeetPip() {
  const onboarding = useGetOnboarding();
  const profile = useGetProfile();
  const save = useSaver();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skip = async () => {
    // Posting, commenting and a profile page need a handle, so without one
    // "Skip for now" goes by question 1 first and skips from there.
    if (profile.data?.needsHandle) return setLocation('/welcome/1?then=skip');
    setBusy(true);
    try { await save.skip(); setLocation(AFTER_SKIP); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <OnboardingPage background="yellow">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:justify-center md:pb-24">
        <div className="grid flex-1 place-items-center md:flex-none md:py-6">
          <Pip pose="wave" size={240} className="h-[200px] w-[200px] md:h-[240px] md:w-[240px]" />
        </div>
        <h1 className="font-display text-[44px] leading-[1.02] tracking-[-.05em] md:text-[56px]">Welcome! I’m Pip.</h1>
        <p className="mt-3 text-[17px] leading-relaxed">I live in the Seams Club sewing kit. Answer a few quick questions and I’ll set up your studio.</p>
        <button type="button" disabled={!onboarding.data}
          onClick={() => onboarding.data && setLocation(`/welcome/${resumeStep(onboarding.data)}`)}
          className="mt-7 flex min-h-[58px] w-full items-center justify-center rounded-full bg-ink text-[17px] font-bold text-white">
          {onboarding.data && onboarding.data.currentStep > 1 && onboarding.data.currentStep <= QUESTION_COUNT ? 'Carry on' : 'Let’s go'}
        </button>
        {error && <p role="alert" className="mt-2 text-center text-sm font-semibold text-red-ink">{error}</p>}
        <p className="mt-4 text-center text-[15px]">
          Takes about a minute · <button type="button" onClick={skip} disabled={busy} className="min-h-[44px] font-bold underline underline-offset-4">Skip for now</button>
        </p>
      </div>
    </OnboardingPage>
  );
}

/** /welcome/:step */
export function QuestionRoute({ step }: { step: number }) {
  return <RequireSignIn><QuestionGate step={step} /></RequireSignIn>;
}

function QuestionGate({ step }: { step: number }) {
  const profile = useGetProfile();
  const onboarding = useGetOnboarding();
  if (!Number.isInteger(step) || step < 1 || step > QUESTION_COUNT) return <Redirect to="/welcome" replace />;
  if (!profile.data || !onboarding.data) return <Loading />;
  if (profile.data.needsHandle && step > 1) return <Redirect to="/welcome/1" replace />;
  // No jumping ahead of where you got to (a finished setup can be gone through again).
  const furthest = onboarding.data.completedAt ? QUESTION_COUNT : resumeStep(onboarding.data);
  if (step > furthest) return <Redirect to={`/welcome/${furthest}`} replace />;
  // Keyed by step so each question starts from what was saved.
  return <Question key={step} step={step} saved={answersFrom(onboarding.data, profile.data)} savedHandle={profile.data.handle} />;
}

function Question({ step, saved, savedHandle }: { step: number; saved: Answers; savedHandle: string | null }) {
  const [, setLocation] = useLocation();
  const skipAfterName = step === 1 && new URLSearchParams(useSearch()).get('then') === 'skip';
  const client = useQueryClient();
  const save = useSaver();
  const [answers, setAnswers] = useState<Answers>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = QUESTIONS[step];
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setAnswers(a => ({ ...a, [key]: value }));
  // Question 1 also picks the @handle: suggested from the name until edited, checked live.
  const [handle, setHandle] = useState(savedHandle ?? handleFromName(saved.name));
  const [handleTouched, setHandleTouched] = useState(Boolean(savedHandle));
  const [handleValid, setHandleValid] = useState(false);
  const onHandleValidity = useCallback((valid: boolean) => setHandleValid(valid), []);
  const auto = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(auto.current), []);

  const answered = {
    1: answers.name.trim().length > 0 && handleValid, 2: answers.goals.length > 0, 3: answers.experience !== null, 4: answers.makes.length > 0,
    5: answers.tools.length > 0, 6: answers.stashSize !== null, 7: answers.audience !== null,
  }[step] ?? false;

  /** Save this question's answer (if there is one) and the step to come back to. */
  async function persist(nextStep: number, a: Answers = answers) {
    const answers = a;
    const track: OnboardingUpdate = { currentStep: Math.min(Math.max(nextStep, 1), QUESTION_COUNT) };
    if (step === 1 && answers.name.trim()) {
      // One save for both, so a taken handle (409) leaves the name as it was too.
      const changedHandle = handleValid && handle !== savedHandle ? { handle } : {};
      await save.profile({ name: answers.name.trim(), ...changedHandle });
    }
    if (step === 2) track.goals = answers.goals;
    if (step === 3) {
      track.experience = answers.experience;
      if (answers.experience) await save.profile({ experience: EXPERIENCE_LEVEL[answers.experience] });
    }
    if (step === 4) {
      // Keep anything typed in Settings that isn't one of Pip's options.
      const others = (client.getQueryData<Profile>(getGetProfileQueryKey())?.favoriteGarments ?? []).filter(m => canonicalMake(m) === null);
      await save.profile({ favoriteGarments: [...answers.makes, ...others] });
    }
    if (step === 5) track.tools = answers.tools;
    if (step === 6) track.stashSize = answers.stashSize;
    if (step === 7 && answers.audience) await save.profile({ defaultPostVisibility: answers.audience });
    await save.onboarding(track);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await work(); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  }

  const next = (a: Answers = answers) => run(async () => {
    window.clearTimeout(auto.current);
    await persist(step + 1, a);
    if (skipAfterName) {
      await save.skip();
      setLocation(AFTER_SKIP);
    } else if (step === QUESTION_COUNT) {
      await save.complete();
      setLocation(AFTER_FINISH);
    } else {
      setLocation(`/welcome/${step + 1}`);
    }
  });
  // Skip moves on without needing an answer (anything picked is kept, as in the mockup).
  const skip = q.optional ? () => run(async () => { await persist(step + 1); setLocation(`/welcome/${step + 1}`); }) : undefined;
  const back = () => run(async () => {
    if (step > 1) await persist(step - 1);
    setLocation(step > 1 ? `/welcome/${step - 1}` : '/welcome');
  });
  /** Questions 3 and 6: a tap or click moves on after a moment; arrow keys and Space don't. */
  const pickAndMaybeAdvance = (key: 'experience' | 'stashSize', value: string, how: PickMethod) => {
    const nextAnswers = { ...answers, [key]: value } as Answers;
    setAnswers(nextAnswers);
    window.clearTimeout(auto.current);
    if (how === 'pointer' && !busy) auto.current = window.setTimeout(() => next(nextAnswers), AUTO_ADVANCE_MS);
  };
  const finishLater = () => run(async () => {
    if (!savedHandle && !handleValid) throw { data: { error: 'Pick your @handle first, so people can find you.' } };
    await persist(step);
    await save.skip();
    setLocation(AFTER_SKIP);
  });

  return (
    <QuestionScreen step={step} pose={q.pose(answers)} lead={q.lead(answers)} title={q.title} help={q.help}
      canContinue={answered} busy={busy} error={error} continueLabel={step === QUESTION_COUNT ? 'Finish' : 'Continue'}
      onContinue={() => next()} onBack={back} onSkip={skip} onFinishLater={finishLater}
      footnote={step === 7 ? <p className="mt-4 flex items-center gap-2.5 text-[15px] text-subtle"><Lock size={18} aria-hidden="true" />You can change this on any post, any time.</p> : undefined}>
      {step === 1 && (
        <div className="space-y-4">
          <input value={answers.name} maxLength={100} autoComplete="name" aria-label="Your name"
            onChange={e => { set('name', e.target.value); if (!handleTouched) setHandle(handleFromName(e.target.value)); }}
            onKeyDown={e => { if (e.key === 'Enter' && answered && !busy) next(); }}
            // .field is unlayered CSS and beats font utilities, so size the text inline.
            style={{ fontSize: 22, fontWeight: 700, minHeight: 64 }} className="field" placeholder="Your name" />
          <HandleField value={handle} onChange={value => { setHandleTouched(true); setHandle(value); }} onValidityChange={onHandleValidity} />
        </div>
      )}
      {step === 2 && <MultiOptions label={q.title} options={GOALS} value={answers.goals} onChange={v => set('goals', v)} />}
      {step === 3 && <SingleOptions label={q.title} options={EXPERIENCE} value={answers.experience} onChange={(v, how) => pickAndMaybeAdvance('experience', v, how)} />}
      {step === 4 && <TileOptions label={q.title} options={MAKES} value={answers.makes} onChange={v => set('makes', v)} />}
      {step === 5 && <MultiOptions label={q.title} options={TOOLS} value={answers.tools} onChange={v => set('tools', v)} />}
      {step === 6 && <SingleOptions label={q.title} options={STASH} value={answers.stashSize} onChange={(v, how) => pickAndMaybeAdvance('stashSize', v, how)} />}
      {step === 7 && <SingleOptions label={q.title} options={AUDIENCE} value={answers.audience} onChange={v => set('audience', v)} />}
    </QuestionScreen>
  );
}
