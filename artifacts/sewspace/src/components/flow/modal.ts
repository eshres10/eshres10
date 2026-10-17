import { useEffect, useRef, type RefObject } from 'react';

// Open modals, innermost last. Only the top one answers Escape and keeps Tab
// inside itself, so a confirm dialog over a sheet doesn't close both.
const stack: Array<RefObject<HTMLElement | null>> = [];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Focus handling for a dialog: focus moves inside when it opens ([data-autofocus]
 * first, else the first control, or the dialog itself with `focusContainer`
 * so screen readers start at its title), Tab and Shift+Tab stay inside, Escape calls
 * onEscape, and focus goes back to where it was on close. The page behind
 * doesn't scroll while it's open.
 */
export function useModal(ref: RefObject<HTMLElement | null>, onEscape: () => void, { focusContainer = false }: { focusContainer?: boolean } = {}) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    stack.push(ref);
    const root = ref.current;
    if (root && !root.contains(document.activeElement)) {
      (root.querySelector<HTMLElement>('[data-autofocus]') ?? (focusContainer ? root : focusables(root)[0]) ?? root).focus({ preventScroll: true });
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== ref || !ref.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        escape.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(ref.current);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !ref.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(ref), 1);
      if (!stack.length) document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref]);
}
