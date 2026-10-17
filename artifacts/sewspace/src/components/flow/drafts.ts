import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDraft, getDraft, saveDraft, type Draft, type DraftKind } from '@workspace/api-client-react';

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 800;

/**
 * The person's one draft for a flow (post, project, stash, topic), kept on the
 * server and private to them. Loads it once, autosaves `payload` about 800 ms
 * after the last change while `active`, and deletes it on discard or submit.
 * Saves and deletes run one after another, so a late save can never bring
 * back a draft that was just deleted.
 */
export function useDraft<P extends Record<string, unknown>>(kind: DraftKind, payload: P, { enabled, active }: {
  /** Off in edit mode: editing an existing item keeps no draft. */
  enabled: boolean;
  /** Save only once there's something worth keeping (and the loaded draft has been applied). */
  active: boolean;
}) {
  const [loaded, setLoaded] = useState<Draft | null | undefined>(enabled ? undefined : null);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<P>(payload);
  const closed = useRef(false);
  latest.current = payload;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    getDraft(kind).then(r => { if (live) setLoaded(r.draft); }).catch(() => { if (live) setLoaded(null); });
    return () => { live = false; };
  }, [enabled, kind]);

  const run = useCallback((op: () => Promise<unknown>) => {
    const next = queue.current.then(op, op);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Save now. Resolves false when the server refused or couldn't be reached. */
  const save = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (!enabled || closed.current) return true;
    setStatus('saving');
    try {
      await run(() => saveDraft(kind, { payload: latest.current }));
      if (!closed.current) setStatus('saved');
      return true;
    } catch {
      if (!closed.current) setStatus('error');
      return false;
    }
  }, [enabled, kind, run]);

  const serialized = JSON.stringify(payload);
  useEffect(() => {
    if (!enabled || !active || closed.current || loaded === undefined) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void save(); }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [serialized, enabled, active, loaded, save]);

  // Leaving the tab: save now rather than lose the last 800 ms.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && timer.current !== undefined) void save(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [save]);

  /** Delete the draft. With `keepOpen`, autosave carries on afterwards (Start over). */
  const discard = useCallback(async ({ keepOpen = false }: { keepOpen?: boolean } = {}) => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    closed.current = !keepOpen;
    setStatus('idle');
    if (!enabled) return;
    await run(() => deleteDraft(kind)).catch(() => undefined);
  }, [enabled, kind, run]);

  return {
    /** undefined while loading; null when there's no draft. */
    loaded,
    status,
    /** Save now (Save draft in the leave dialog). */
    save,
    discard,
    /** Call after a successful submit. */
    clear: () => discard(),
  };
}

/** The header subtitle for a draft's state. */
export function draftLabel(status: DraftStatus, fallback = 'Draft kept if you leave'): string {
  return status === 'saving' ? 'Saving draft…' : status === 'saved' ? 'Draft saved' : status === 'error' ? 'Draft not saved' : fallback;
}
