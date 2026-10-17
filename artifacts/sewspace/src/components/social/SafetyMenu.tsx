import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBlockProfile, useCreateReport, type ReportInputTargetKind, type ReportReason } from '@workspace/api-client-react';
import { Ban, Check, Flag, Loader2, MoreHorizontal, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { Sheet, SheetButton, useSheetDirty } from '@/components/social/Sheet';

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or dangerous acts' },
  { value: 'intellectual_property', label: 'Copied work or pattern piracy' },
  { value: 'other', label: 'Something else' },
];

function errorText(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? fallback;
}

/** Report form: reason, optional details, then a thank-you. */
export function ReportForm({ kind, targetId, what, onDone }: { kind: ReportInputTargetKind; targetId: string; what: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  useSheetDirty(Boolean(reason || details.trim()));
  const report = useCreateReport();
  if (report.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-yellow" aria-hidden="true"><Check size={26} /></span>
        <h2 className="font-display text-2xl">Thanks for telling us</h2>
        <p className="text-sm text-subtle">An admin will look at this {what}. The person isn't told who reported it.</p>
        <button type="button" onClick={onDone} className="btn btn-primary w-full">Done</button>
      </div>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); if (reason) report.mutate({ data: { targetKind: kind, targetId, reason, details: details.trim() } }); }} className="space-y-4">
      <h2 className="font-display text-2xl">Report this {what}</h2>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Why are you reporting it?</legend>
        {REASONS.map(r => (
          <label key={r.value} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[16px] border px-3.5 text-sm font-semibold ${reason === r.value ? 'border-ink bg-yellow' : 'border-line'}`}>
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="sr-only" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="block text-xs font-semibold">Anything else? (optional)
        <textarea value={details} onChange={e => setDetails(e.target.value.slice(0, 1000))} rows={3} className="field mt-1.5 resize-y" />
      </label>
      {report.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(report.error, "That didn't send. Try again.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="btn btn-line flex-1">Cancel</button>
        <button type="submit" disabled={!reason || report.isPending} className="btn btn-primary flex-1 disabled:opacity-50">{report.isPending && <Loader2 size={15} className="animate-spin" />}Send report</button>
      </div>
    </form>
  );
}

/** Block confirmation. Afterwards feeds refresh and, if asked, the page moves on. */
export function BlockForm({ handle, onDone, leaveTo }: { handle: string; onDone: () => void; leaveTo?: string }) {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const blockIt = useBlockProfile();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Block @{handle}?</h2>
      <p className="text-sm leading-relaxed text-subtle">
        You won't see each other's profiles, posts, makes or comments, and any follows between you end. They aren't told.
        You can unblock them in Profile &amp; settings.
      </p>
      {blockIt.isError && <p role="alert" className="text-sm font-semibold text-red-ink">{errorText(blockIt.error, "That didn't work. Try again.")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="btn btn-line flex-1">Cancel</button>
        <button type="button" disabled={blockIt.isPending} className="btn flex-1 bg-red text-white"
          onClick={() => blockIt.mutate({ handle }, {
            onSuccess: () => {
              // Their posts, comments and profile disappear everywhere.
              client.invalidateQueries();
              onDone();
              if (leaveTo) setLocation(leaveTo);
            },
          })}>
          {blockIt.isPending && <Loader2 size={15} className="animate-spin" />}Block
        </button>
      </div>
    </div>
  );
}

/**
 * "…" menu for something someone else made: report it, and block its author.
 * Signed-out visitors are asked to sign in first.
 */
export function SafetyMenu({ kind, targetId, what, authorHandle, label, leaveOnBlock, size = 44 }: {
  kind: ReportInputTargetKind;
  targetId: string;
  what: string;
  authorHandle: string;
  label: string;
  leaveOnBlock?: string;
  size?: number;
}) {
  const ask = useRequireSignIn();
  const [view, setView] = useState<'closed' | 'menu' | 'report' | 'block'>('closed');
  const close = () => setView('closed');
  return (
    <>
      <button type="button" aria-label={label} style={{ width: size, height: size }}
        onClick={() => { if (ask({ title: `Sign in to report or block`, body: "Reports go to the Seams Club admins. You'll come straight back here." })) setView('menu'); }}
        className="grid shrink-0 place-items-center rounded-full hover:bg-canvas">
        <MoreHorizontal size={20} />
      </button>
      {view !== 'closed' && (
        <Sheet label={label} onClose={close}>
          {view === 'menu' && (
            <div className="flex flex-col gap-1">
              <SheetButton icon={Flag} onClick={() => setView('report')}>Report {what}</SheetButton>
              <SheetButton icon={Ban} danger onClick={() => setView('block')}>Block @{authorHandle}</SheetButton>
              <SheetButton icon={X} onClick={close}>Cancel</SheetButton>
            </div>
          )}
          {view === 'report' && <ReportForm kind={kind} targetId={targetId} what={what} onDone={close} />}
          {view === 'block' && <BlockForm handle={authorHandle} onDone={close} leaveTo={leaveOnBlock} />}
        </Sheet>
      )}
    </>
  );
}
