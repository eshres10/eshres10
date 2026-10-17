import { useEffect } from 'react';
import { useGetOnboarding } from '@workspace/api-client-react';
import { useLocation } from 'wouter';

// The onboarding gate (Phase O3): someone who hasn't finished or skipped setup
// with Pip and lands on Home goes to /welcome, at most once per browser
// session. Only Home calls this, so deep links (a post, a profile, the studio)
// are never interrupted. "Skip for now" / "Finish setup later" set skippedAt,
// which ends it for good.
const SEEN = 'seams.pip-gate';

function seenThisSession(): boolean {
  try { return window.sessionStorage.getItem(SEEN) === '1'; } catch { return false; }
}

function markSeen() {
  try { window.sessionStorage.setItem(SEEN, '1'); } catch { /* storage blocked: the gate may show again next visit */ }
}

export function usePipGate() {
  const onboarding = useGetOnboarding();
  const [, setLocation] = useLocation();
  const data = onboarding.data;
  useEffect(() => {
    if (!data || data.completedAt || data.skippedAt || seenThisSession()) return;
    markSeen();
    setLocation('/welcome', { replace: true });
  }, [data, setLocation]);
}
