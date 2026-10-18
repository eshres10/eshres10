import { createContext, useContext, useEffect, useState } from 'react';

export interface HideOnScrollOptions {
  /** Movement (px, added up) that flips the state. */
  step: number;
  /** Never hide above this scroll position. */
  minY: number;
}
const DEFAULTS: HideOnScrollOptions = { step: 10, minY: 0 };
/** Explore (owner's brief): hide after 6 px down once past 80 px; show after 6 px up. */
export const EXPLORE_SCROLL: HideOnScrollOptions = { step: 6, minY: 80 };
/** Pages whose top bar slides away on the way down (desktop too) while a toolbar stays pinned under it. Owner added Forum, October 2026. */
export const SCROLL_AWAY_PAGES = new Set(['/explore', '/forum']);
/** Where a pinned toolbar sits under the bar, and how far it moves up when the bar slides away. */
export const STICKY = {
  app: { base: 'top-[calc(4rem+env(safe-area-inset-top))] md:top-[94px]', hidden: '-translate-y-[4rem] md:-translate-y-[76px]' },
  public: { base: 'top-[calc(63px+env(safe-area-inset-top))] md:top-0', hidden: '-translate-y-[63px] md:translate-y-0' },
} as const;

/**
 * True while the page is scrolling down (the top bar slides away), false once
 * it scrolls back up or reaches the top. Reads the scroll position at most
 * once a frame and only re-renders when the answer changes.
 */
export function useHideOnScroll(enabled: boolean, resetKey?: string, options: HideOnScrollOptions = DEFAULTS) {
  const [hidden, setHidden] = useState(false);
  const { step, minY } = options;

  useEffect(() => {
    setHidden(false);
    if (!enabled) {
      return;
    }

    let lastY = Math.max(0, window.scrollY);
    let accumulatedDelta = 0;
    let current = false;
    let frame = 0;
    const set = (next: boolean) => {
      if (next === current) return;
      current = next;
      setHidden(next);
    };

    const read = () => {
      frame = 0;
      const currentY = Math.max(0, window.scrollY);
      if (currentY === 0) {
        accumulatedDelta = 0;
        lastY = 0;
        set(false);
        return;
      }

      const delta = currentY - lastY;
      // A change of direction starts counting again.
      accumulatedDelta = Math.sign(delta) === Math.sign(accumulatedDelta) ? accumulatedDelta + delta : delta;
      lastY = currentY;

      if (accumulatedDelta >= step) {
        accumulatedDelta = 0;
        if (currentY > minY) set(true);
      } else if (accumulatedDelta <= -step) {
        accumulatedDelta = 0;
        set(false);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, resetKey, step, minY]);

  return hidden;
}

/**
 * Whether the top bar is scrolled away, for things that stick under it (the
 * Explore filters). `app` = the signed-in shell, `public` = the website header.
 */
export const ChromeContext = createContext<{ hidden: boolean; shell: 'app' | 'public' }>({ hidden: false, shell: 'public' });
export const useChrome = () => useContext(ChromeContext);
