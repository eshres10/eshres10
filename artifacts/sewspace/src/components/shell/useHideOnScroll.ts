import { useEffect, useState } from 'react';

/** Hide a header after 10px of downward scrolling; reveal it after 10px upward. */
export function useHideOnScroll(enabled: boolean) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    let lastY = Math.max(0, window.scrollY);
    let accumulatedDelta = 0;

    const onScroll = () => {
      const currentY = Math.max(0, window.scrollY);
      if (currentY === 0) {
        accumulatedDelta = 0;
        lastY = 0;
        setHidden(false);
        return;
      }

      accumulatedDelta += currentY - lastY;
      lastY = currentY;

      if (accumulatedDelta >= 10) {
        accumulatedDelta = 0;
        setHidden(true);
      } else if (accumulatedDelta <= -10) {
        accumulatedDelta = 0;
        setHidden(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);

  return hidden;
}
