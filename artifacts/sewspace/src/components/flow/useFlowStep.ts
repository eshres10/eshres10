import { useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';

/**
 * The current step lives in the URL (?step=details), so the browser's Back
 * button goes to the previous step. Other query parameters are kept.
 * `canOpen` decides which steps may be opened directly (done steps, or every
 * step in edit mode); anything else falls back to `initial`.
 */
export function useFlowStep<S extends string>(steps: readonly S[], { initial, canOpen }: { initial?: S; canOpen: (step: S) => boolean }) {
  const [path, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const first = initial ?? steps[0];
  const fromUrl = params.get('step') as S | null;
  const step = fromUrl && steps.includes(fromUrl) && canOpen(fromUrl) ? fromUrl : first;

  const go = useCallback((next: S, { replace = false }: { replace?: boolean } = {}) => {
    const p = new URLSearchParams(window.location.search);
    if (next === first) p.delete('step');
    else p.set('step', next);
    const depth = (window.history.state as { flowDepth?: number } | null)?.flowDepth ?? 0;
    setLocation(`${path}${p.size ? `?${p}` : ''}`, { replace, state: { flowDepth: replace ? depth : depth + 1 } });
  }, [first, path, setLocation]);

  /** Step back: the browser's history when we came from there, else replace with the previous step. */
  const back = useCallback(() => {
    const at = steps.indexOf(step);
    if (at <= 0) return;
    const depth = (window.history.state as { flowDepth?: number } | null)?.flowDepth ?? 0;
    if (depth > 0) window.history.back();
    else go(steps[at - 1], { replace: true });
  }, [go, step, steps]);

  return { step, index: steps.indexOf(step), go, back };
}
