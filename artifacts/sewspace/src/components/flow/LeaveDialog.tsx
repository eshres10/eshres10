import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useModal } from './modal';

/**
 * "Keep this as a draft?" (or "Discard your changes?" where there's no draft
 * to keep), over a flow or sheet. Escape or a tap outside means Keep editing.
 */
export function LeaveDialog({ canSaveDraft, where, onSave, onDiscard, onStay }: {
  canSaveDraft: boolean;
  /** "New post": where the draft can be found again. */
  where?: string;
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null);
  const [failed, setFailed] = useState(false);
  const save = async () => {
    setBusy('save');
    setFailed(false);
    if (!(await onSave())) {
      setBusy(null);
      setFailed(true);
    }
  };
  useModal(panel, onStay);
  const big = 'flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full text-lg font-bold';
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onStay(); }}>
      <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        className="w-full max-w-[440px] rounded-t-[36px] bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 text-center sm:rounded-[34px] sm:p-6">
        <h2 id={titleId} className="font-display text-[26px] leading-tight tracking-[-.05em]">{canSaveDraft ? 'Keep this as a draft?' : 'Discard your changes?'}</h2>
        <p id={bodyId} className="mx-auto mt-2 max-w-[340px] text-[15px] text-subtle">
          {canSaveDraft
            ? <>Find it again next time you open {where ?? 'this'}. Uploaded photos stay with it.</>
            : <>What you've written here will be lost.</>}
        </p>
        {failed && <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">The draft didn't save. Check your connection and try again, or keep editing.</p>}
        <div className="mt-5 space-y-2.5">
          {canSaveDraft && (
            <button type="button" data-autofocus disabled={busy !== null} onClick={save} className={`${big} bg-ink text-white`}>
              {busy === 'save' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}Save draft
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={() => { setBusy('discard'); onDiscard(); }} className={`${big} border-2 border-red-ink text-red-ink`}>
            {busy === 'discard' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}Discard
          </button>
          <button type="button" data-autofocus={canSaveDraft ? undefined : true} disabled={busy !== null} onClick={onStay} className={`${big} bg-canvas text-ink`}>Keep editing</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Close, Escape or a tap outside call `request()`. With nothing entered it
 * leaves straight away; otherwise it asks first. Render `dialog`.
 */
export function useLeaveGuard({ dirty, onLeave, draft, where }: {
  dirty: boolean;
  onLeave: () => void;
  /** Present when the flow keeps a draft: Save draft saves it now, Discard deletes it. */
  draft?: { save: () => Promise<boolean>; discard: () => Promise<void> };
  where?: string;
}): { request: () => void; dialog: ReactNode } {
  const [asking, setAsking] = useState(false);
  const request = useCallback(() => { if (dirty) setAsking(true); else onLeave(); }, [dirty, onLeave]);
  const dialog = asking
    ? (
      <LeaveDialog canSaveDraft={Boolean(draft)} where={where}
        onStay={() => setAsking(false)}
        onSave={async () => {
          if (!(await (draft?.save() ?? Promise.resolve(true)))) return false;
          setAsking(false);
          onLeave();
          return true;
        }}
        onDiscard={async () => { await draft?.discard(); setAsking(false); onLeave(); }} />
    )
    : null;
  return { request, dialog };
}
