import { useEffect, useRef, type ReactNode } from 'react';

/** Bottom sheet on phones, centred dialog on larger screens. Escape or a tap outside closes it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Once per opening: focus the first control, close on Escape, restore focus after.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button, [href], input, textarea, select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/45 p-2 sm:items-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label}
        className="max-h-[90dvh] w-full max-w-[440px] overflow-y-auto rounded-[32px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <span className="mx-auto mb-3 block h-[5px] w-11 rounded-full bg-line sm:hidden" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** A full-width row button for sheets and menus. */
export function SheetButton({ icon: Icon, children, onClick, danger = false }: {
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-[52px] w-full items-center gap-3 rounded-[18px] px-3 text-left font-semibold hover:bg-canvas ${danger ? 'text-red-ink' : 'text-ink'}`}>
      <Icon size={18} aria-hidden={true} />{children}
    </button>
  );
}
