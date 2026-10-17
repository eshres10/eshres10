import { useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { GLYPH, MAKE_ART, QUESTION_COUNT, TONE, toneAt, type GlyphName, type Option, type Tone } from './copy';
import { Pip, type PipPose } from './Pip';

// The onboarding shell (Phase O2): full-height screens with no app bars.
// Phones: progress, back and Skip at the top, small Pip with a speech bubble,
// the question, and Continue pinned to the bottom. From 768 px: logo and a
// header link, Pip and the bubble on the left, the question in a white card.

const BACKGROUND = { canvas: 'bg-canvas', yellow: 'bg-yellow', peach: 'bg-peach' } as const;

/** A full-height onboarding page. The header (logo + `headerRight`) shows from 768 px. */
export function OnboardingPage({ background = 'canvas', headerRight, children }: { background?: keyof typeof BACKGROUND; headerRight?: ReactNode; children: ReactNode }) {
  return (
    // The page colour covers the dot grid on body.
    <div className={`flex min-h-[100dvh] flex-col ${BACKGROUND[background]}`}>
      <header className="hidden items-center justify-between px-10 pt-7 md:flex">
        <Logo href="/feed" />
        {headerRight}
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

/** One line icon from the mockup set. */
export function Glyph({ name, size = 22, className = '' }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={GLYPH[name]} />
    </svg>
  );
}

/** Seven segments; the label says "Question n of 7". */
export function ProgressBar({ step, className = '' }: { step: number; className?: string }) {
  const text = `Question ${step} of ${QUESTION_COUNT}`;
  return (
    <div role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={QUESTION_COUNT} aria-valuenow={step} aria-valuetext={text}
      className={`flex flex-1 gap-1.5 ${className}`}>
      {Array.from({ length: QUESTION_COUNT }, (_, i) => (
        <span key={i} className={`h-[5px] flex-1 rounded-full ${i < step ? 'bg-ink' : 'bg-line'}`} />
      ))}
    </div>
  );
}

/** Pip's speech bubble. Polite live region, so a new line is read out. */
export function SpeechBubble({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p aria-live="polite" className={`rounded-[22px] bg-white px-4 py-3 text-[15px] font-semibold leading-snug text-ink ${className}`}>
      {children}
    </p>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} aria-label="Back" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-white/70">
      <ChevronLeft size={24} aria-hidden="true" />
    </button>
  );
}

export function ContinueButton({ label = 'Continue', disabled, busy, onClick, className = '' }: { label?: string; disabled: boolean; busy: boolean; onClick: () => void; className?: string }) {
  return (
    // Disabled stays visible, with a dark label on light grey (≥ 4.5:1).
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={`flex min-h-[56px] items-center justify-center gap-2 rounded-full px-12 text-[17px] font-bold ${disabled ? 'bg-line text-subtle' : 'bg-ink text-white'} ${className}`}>
      {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{label}
    </button>
  );
}

/**
 * A question screen. Focus moves to the question (`h1`) when the step
 * changes; Skip appears only on optional questions.
 */
export function QuestionScreen({ step, pose, lead, title, help, children, footnote, canContinue, busy, error, continueLabel, onContinue, onBack, onSkip, onFinishLater }: {
  step: number; pose: PipPose; lead: string; title: string; help?: string; children: ReactNode; footnote?: ReactNode;
  canContinue: boolean; busy: boolean; error?: string | null; continueLabel?: string;
  onContinue: () => void; onBack: () => void; onSkip?: () => void; onFinishLater: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  return (
    <OnboardingPage headerRight={<button type="button" onClick={onFinishLater} className="min-h-[44px] text-[15px] font-bold text-ink underline underline-offset-4">Finish setup later</button>}>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pb-36 md:grid md:max-w-[1280px] md:flex-none md:grid-cols-[minmax(0,3fr)_minmax(0,8fr)] md:items-center md:gap-8 md:px-10 lg:gap-12 md:pb-16 md:pt-14">
        <div className="flex items-center gap-3 pt-[calc(1.25rem+env(safe-area-inset-top))] md:hidden">
          <BackButton onBack={onBack} />
          <ProgressBar step={step} />
          {onSkip ? <button type="button" onClick={onSkip} className="min-h-[44px] px-1 text-[15px] font-bold text-subtle">Skip</button> : <span className="w-9" aria-hidden="true" />}
        </div>
        <div className="mt-4 flex items-center gap-3 md:mt-0 md:flex-col md:gap-6 md:self-start md:pt-20">
          <Pip pose={pose} size={200} className="h-[92px] w-[92px] md:h-[150px] md:w-[150px] lg:h-[200px] lg:w-[200px]" />
          <SpeechBubble className="md:max-w-[300px] md:text-center md:text-[17px]">{lead}</SpeechBubble>
        </div>
        <section className="mt-3 md:mt-0 md:rounded-[40px] md:bg-white md:p-12">
          <div className="hidden items-center gap-5 md:flex">
            <BackButton onBack={onBack} />
            <ProgressBar step={step} />
            <span className="shrink-0 text-sm font-bold text-subtle" aria-hidden="true">Question {step} of {QUESTION_COUNT}</span>
          </div>
          <h1 ref={heading} tabIndex={-1} className="font-display text-[34px] leading-[1.05] tracking-[-.045em] outline-none md:mt-8 md:text-[44px]">{title}</h1>
          {help && <p className="mt-2 text-[15px] leading-relaxed text-subtle md:text-base">{help}</p>}
          <div className="mt-5">{children}</div>
          {footnote}
          <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-canvas from-70% to-transparent px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-8 md:static md:mt-8 md:flex md:items-center md:justify-between md:bg-none md:p-0">
            {onSkip ? <button type="button" onClick={onSkip} className="hidden min-h-[44px] px-2 text-[15px] font-bold text-subtle md:block">Skip this one</button> : <span className="hidden md:block" />}
            <div className="mx-auto max-w-[560px] md:mx-0">
              {error && <p role="alert" className="mb-2 text-center text-sm font-semibold text-red-ink md:text-right">{error}</p>}
              <ContinueButton label={continueLabel} disabled={!canContinue} busy={busy} onClick={onContinue} className="w-full md:w-auto" />
            </div>
          </div>
        </section>
      </div>
    </OnboardingPage>
  );
}

/** How an option was picked: questions 3 and 6 move on after a pointer pick only (O4). */
export type PickMethod = 'pointer' | 'keyboard';

function Mark({ on, round }: { on: boolean; round: boolean }) {
  return (
    <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center ${round ? 'rounded-full' : 'rounded-[8px]'} ${on ? 'bg-ink text-white' : 'border-2 border-mark bg-white'}`}>
      {on && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
    </span>
  );
}

function OptionCard<V extends string>({ option, tone, on, round, ref, ...button }: { option: Option<V>; tone: Tone; on: boolean; round: boolean; ref?: Ref<HTMLButtonElement> } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" ref={ref} {...button}
      className={`flex min-h-[72px] w-full items-center gap-4 rounded-[26px] border-2 p-3.5 pr-4 text-left text-ink ${on ? 'border-ink bg-yellow' : 'border-transparent bg-white md:border-line'}`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] ${TONE[tone]}`}><Glyph name={option.glyph} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold leading-tight">{option.label}</span>
        {option.sub && <span className="mt-0.5 block text-sm leading-snug text-subtle">{option.sub}</span>}
      </span>
      <Mark on={on} round={round} />
    </button>
  );
}

/** Pick any number: real buttons with role="checkbox" in a role="group". */
export function MultiOptions<V extends string>({ label, options, value, onChange }: {
  label: string; options: Option<V>[]; value: V[]; onChange: (value: NoInfer<V>[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-3 md:grid-cols-2">
      {options.map((o, i) => {
        const on = value.includes(o.value);
        return <OptionCard key={o.value} option={o} tone={toneAt(i)} on={on} round={false} role="checkbox" aria-checked={on}
          onClick={() => onChange(on ? value.filter(v => v !== o.value) : [...value, o.value])} />;
      })}
    </div>
  );
}

/**
 * Pick one: role="radio" in a role="radiogroup" with a roving tab stop.
 * Arrow keys move and select, Space selects; `onChange` says whether it was
 * a pointer or the keyboard.
 */
export function SingleOptions<V extends string>({ label, options, value, onChange }: {
  label: string; options: Option<V>[]; value: V | null; onChange: (value: NoInfer<V>, how: PickMethod) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex(o => o.value === value));
  const onKey = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      event.preventDefault();
      const next = (index + step + options.length) % options.length;
      refs.current[next]?.focus();
      onChange(options[next].value, 'keyboard');
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onChange(options[index].value, 'keyboard');
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 md:grid-cols-2">
      {options.map((o, i) => (
        <OptionCard key={o.value} option={o} tone={toneAt(i)} on={o.value === value} round role="radio" aria-checked={o.value === value}
          ref={el => { refs.current[i] = el; }} tabIndex={i === current ? 0 : -1}
          onKeyDown={e => onKey(e, i)} onClick={() => onChange(o.value, 'pointer')} />
      ))}
    </div>
  );
}

/** Question 4: illustrated tiles in 3 columns on phones, 5 from 768 px (role="checkbox" in a group). */
export function TileOptions({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-2.5 md:grid-cols-5 md:gap-3">
      {options.map((o, i) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" role="checkbox" aria-checked={on} onClick={() => onChange(on ? value.filter(v => v !== o) : [...value, o])}
            className={`relative flex flex-col overflow-hidden rounded-[22px] border-2 bg-white text-left text-ink ${on ? 'border-ink' : 'border-line'}`}>
            <span className={`grid aspect-[4/5] w-full place-items-center ${TONE[toneAt(i)]}`} aria-hidden="true">
              {MAKE_ART[o] && (
                <svg viewBox="0 0 48 48" className="h-[55%] w-[55%] text-ink" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={MAKE_ART[o]} />
                </svg>
              )}
            </span>
            <span className="absolute right-2 top-2"><Mark on={on} round /></span>
            <span className="px-3 py-2.5 text-[15px] font-bold">{o}</span>
          </button>
        );
      })}
    </div>
  );
}
