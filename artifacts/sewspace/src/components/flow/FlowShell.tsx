import { useId, useRef, type ReactNode } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { useModal } from './modal';
import { StepBar, StepPills, type FlowStepDef } from './Steps';

export interface FlowAction {
  label: string;
  onClick: () => void;
  /** Disabled buttons always say why, in `reason`. */
  disabled?: boolean;
  reason?: string;
  busy?: boolean;
  busyLabel?: string;
}

export interface FlowShellProps {
  title: string;
  /** "Draft saved", "Saving draft…", or a short hint. */
  subtitle?: ReactNode;
  steps: readonly FlowStepDef[];
  current: string;
  canOpen: (id: string) => boolean;
  onStep: (id: string) => void;
  /** Close was asked for (Close button, Escape, a click outside). The flow decides whether to ask first. */
  onClose: () => void;
  /** Go back a step. Leave undefined on the first step: the header then shows Close. */
  onBack?: () => void;
  primary?: FlowAction;
  /** Phones: also show the primary action, small, at the right of the header. */
  primaryInHeader?: boolean;
  /** Desktop: the primary action sits in the header instead of a footer (New post). */
  desktopPrimaryInHeader?: boolean;
  /** Desktop only: a preview pane beside the form. */
  aside?: { side: 'left' | 'right'; title?: string; content: ReactNode; dark?: boolean };
  /** Desktop: white behind the form instead of canvas grey (New post). */
  plainDesktop?: boolean;
  /** Desktop: keep one height across steps instead of fitting each step. */
  steadyHeight?: boolean;
  children: ReactNode;
}

function PrimaryButton({ action, describedBy, className }: { action: FlowAction; describedBy?: string; className: string }) {
  const blocked = action.disabled || action.busy;
  return (
    <button type="button" onClick={action.onClick} disabled={blocked} aria-describedby={action.disabled && action.reason ? describedBy : undefined}
      className={`${className} ${blocked ? 'bg-line text-subtle' : 'bg-yellow text-ink hover:bg-ink hover:text-white'}`}>
      {action.busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {action.busy ? action.busyLabel ?? action.label : action.label}
    </button>
  );
}

/**
 * The frame for every step-by-step form. Phones get a full-screen page: a
 * floating header (Back or Close, title, draft status), a labelled step bar and
 * a sticky main button. From 1024 px it's a centred dialog over the dimmed page,
 * with step pills in the header, Back and Next in a footer, and an optional
 * preview pane.
 */
export function FlowShell(props: FlowShellProps) {
  const { title, subtitle, steps, current, canOpen, onStep, onClose, onBack, primary, primaryInHeader, desktopPrimaryInHeader, aside, plainDesktop, steadyHeight, children } = props;
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const reasonMobileId = useId();
  useModal(dialog, onClose, { focusContainer: true });

  const reason = primary?.disabled && primary.reason ? primary.reason : null;
  const round = 'grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-canvas';
  const backOrClose = (extra = '') => onBack
    ? <button type="button" onClick={onBack} aria-label="Back" className={`${round} ${extra}`}><ChevronLeft size={22} aria-hidden="true" /></button>
    : <button type="button" onClick={onClose} aria-label="Close" className={`${round} ${extra}`}><X size={20} aria-hidden="true" /></button>;

  const pane = aside && (
    <aside className={`hidden min-h-0 shrink-0 overflow-y-auto border-line p-5 lg:block ${aside.side === 'left' ? 'order-first border-r' : 'border-l'} ${aside.dark ? 'w-[55%] bg-ink text-white' : aside.side === 'left' ? 'w-[300px] bg-white' : 'w-[320px] bg-white'}`}
      aria-label={aside.title ?? 'Preview'}>
      {aside.title && <p className={`eyebrow mb-3 ${aside.dark ? 'text-white/70' : 'text-subtle'}`}>{aside.title}</p>}
      {aside.content}
    </aside>
  );

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-canvas lg:items-center lg:justify-center lg:bg-ink/45 lg:p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`flex min-h-0 flex-1 flex-col outline-none lg:max-h-[min(880px,calc(100dvh-48px))] lg:w-full lg:max-w-[1080px] lg:flex-none lg:overflow-hidden lg:rounded-[34px] lg:bg-white ${steadyHeight ? 'lg:h-[min(760px,calc(100dvh-48px))]' : ''}`}>

        {/* Phone header and step bar */}
        <div className="shrink-0 px-3 pt-[calc(.75rem+env(safe-area-inset-top))] lg:hidden">
          <div className="flex min-h-[68px] items-center gap-2 rounded-[30px] bg-white px-2 shadow-float">
            {backOrClose()}
            <div className="min-w-0 flex-1">
              <h1 id={titleId} className="truncate font-display text-[22px] leading-tight tracking-[-.04em]">{title}</h1>
              {subtitle && <p className="truncate text-sm text-subtle" aria-live="polite">{subtitle}</p>}
            </div>
            {primaryInHeader && primary && (
              <PrimaryButton action={primary} describedBy={reasonMobileId} className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-full px-5 text-base font-bold" />
            )}
          </div>
        </div>
        {steps.length > 0 && <div className="shrink-0 pt-1 lg:hidden"><StepBar steps={steps} current={current} canOpen={canOpen} onStep={onStep} /></div>}

        {/* Desktop header with step pills */}
        <div className="hidden shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line px-4 py-3 lg:grid">
          <div className="flex min-w-0 items-center gap-2">
            {desktopPrimaryInHeader && backOrClose('bg-canvas')}
            <div className="min-w-0 pl-1">
              <p className="truncate font-display text-xl leading-tight tracking-[-.04em]" aria-hidden="true">{title}</p>
              {subtitle && <p className="truncate text-xs text-subtle">{subtitle}</p>}
            </div>
          </div>
          {steps.length > 0 ? <StepPills steps={steps} current={current} canOpen={canOpen} onStep={onStep} /> : <span />}
          <div className="flex items-center justify-end gap-3">
            {desktopPrimaryInHeader
              ? primary && <>
                  {reason && <p id={reasonId} className="max-w-[220px] text-right text-xs font-semibold text-subtle">{reason}</p>}
                  <PrimaryButton action={primary} describedBy={reasonId} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-6 text-sm font-bold" />
                </>
              : <button type="button" onClick={onClose} aria-label="Close" className={`${round} bg-canvas`}><X size={20} aria-hidden="true" /></button>}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <main className={`min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3 lg:p-5 ${plainDesktop ? 'lg:bg-white' : 'lg:bg-canvas'}`}>
              {children}
            </main>

            {/* Phone: sticky main button */}
            {primary && !primaryInHeader && (
              <div className="shrink-0 px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-2 lg:hidden">
                {reason && <p id={reasonMobileId} className="mb-2 text-center text-sm font-semibold text-subtle">{reason}</p>}
                <PrimaryButton action={primary} describedBy={reasonMobileId} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full text-lg font-bold" />
              </div>
            )}
            {primary && primaryInHeader && reason && <p id={reasonMobileId} className="shrink-0 px-4 pb-3 text-center text-sm font-semibold text-subtle lg:hidden">{reason}</p>}

            {/* Desktop footer */}
            {!desktopPrimaryInHeader && (
              <div className="hidden shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-5 py-3 lg:flex">
                {onBack ? <button type="button" onClick={onBack} className="btn btn-line min-h-[48px] px-5 text-base">Back</button> : <span />}
                {primary && (
                  <div className="flex items-center gap-3">
                    {reason && <p id={reasonId} className="text-sm font-semibold text-subtle">{reason}</p>}
                    <PrimaryButton action={primary} describedBy={reasonId} className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full px-6 text-base font-bold" />
                  </div>
                )}
              </div>
            )}
          </div>
          {pane}
        </div>
      </div>
    </div>
  );
}
