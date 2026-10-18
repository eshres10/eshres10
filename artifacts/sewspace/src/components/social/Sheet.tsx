import { createPortal } from 'react-dom';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLeaveGuard } from '@/components/flow/LeaveDialog';
import { useModal } from '@/components/flow/modal';

const SheetDirty = createContext<(dirty: boolean) => void>(() => undefined);

/** A form inside a Sheet reports whether something has been entered, so closing asks first. */
export function useSheetDirty(dirty: boolean) {
  const set = useContext(SheetDirty);
  useEffect(() => {
    set(dirty);
    return () => set(false);
  }, [dirty, set]);
}

/**
 * Bottom sheet on phones, centred dialog on larger screens. Escape or a tap
 * outside closes it, after asking "Discard your changes?" when a form inside
 * has something entered (useSheetDirty). Focus stays inside while it's open.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard({ dirty, onLeave: onClose });
  useModal(panel, guard.request);
  // On document.body above everything (z 90): sheets also open from the post view and the comments sheet (z 80).
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-2 sm:items-center" onMouseDown={e => { if (e.target === e.currentTarget) guard.request(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label}
        className="max-h-[90dvh] w-full max-w-[440px] overflow-y-auto rounded-[32px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <span className="mx-auto mb-3 block h-[5px] w-11 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <SheetDirty.Provider value={setDirty}>{children}</SheetDirty.Provider>
      </div>
      {guard.dialog}
    </div>,
    document.body,
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
