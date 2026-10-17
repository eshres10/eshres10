import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGetProfile, type Profile } from '@workspace/api-client-react';
import { ChevronDown, X } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { useModal } from '@/components/flow/modal';


/** What's inside the menu, the same on both sizes. `close` runs when a link is chosen. */
function MenuBody({ me, close, closeButton }: { me: Profile | undefined; close: () => void; closeButton?: ReactNode }) {
  const profileHref = me?.handle ? `/@${me.handle}` : '/settings';
  return (
    <div className="flex items-center gap-3 border-b border-line px-1 pb-3">
      <UserAvatar name={me?.name} avatarUrl={me?.avatarUrl} size={46} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold">{me?.name ?? 'Your account'}</p>
        <Link href={profileHref} onClick={close} className="block truncate text-[13px] text-subtle underline underline-offset-2">
          View profile{me?.handle ? ` · @${me.handle}` : ''}
        </Link>
      </div>
      {closeButton}
    </div>
  );
}

/**
 * Desktop (768 px up): the avatar button at the right of the top bar opens a
 * 320 px popover under it. A non-modal dialog: no backdrop, the page scrolls,
 * Escape, a click outside or choosing a link closes it, and focus goes back to
 * the avatar.
 */
export function AccountMenuDesktop() {
  const me = useGetProfile().data;
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div ref={wrap} className="relative hidden md:block">
      <button ref={trigger} type="button" aria-label="Account menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}
        className={`flex h-11 items-center gap-1 rounded-full py-1 pl-1 pr-2 ${open ? 'bg-yellow' : 'hover:bg-canvas'}`}>
        <UserAvatar name={me?.name} avatarUrl={me?.avatarUrl} size={36} />
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <DesktopPanel id={id} me={me} close={close} />}
    </div>
  );
}

function DesktopPanel({ id, me, close }: { id: string; me: Profile | undefined; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useModal(panel, close, { modal: false });
  return (
    <div ref={panel} id={id} role="dialog" aria-label="Account menu"
      className="account-pop absolute right-0 top-full z-50 mt-2 w-[320px] rounded-[24px] bg-white p-3 text-ink shadow-float outline outline-1 outline-line">
      <MenuBody me={me} close={close} />
    </div>
  );
}

/**
 * Phones: the avatar at the right of the top bar opens a 328 px drawer from the
 * right over a 45% backdrop. A modal dialog: focus stays inside, the page
 * doesn't scroll, ✕, a backdrop tap or Escape closes it.
 */
export function AccountMenuMobile() {
  const me = useGetProfile().data;
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  return (
    <>
      <button ref={trigger} type="button" aria-label="Account menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full md:hidden">
        <UserAvatar name={me?.name} avatarUrl={me?.avatarUrl} size={34} />
      </button>
      {/* Portal: the top bars use transforms, which would trap a fixed drawer inside them. */}
      {open && createPortal(<MobileDrawer id={id} me={me} close={close} />, document.body)}
    </>
  );
}

function MobileDrawer({ id, me, close }: { id: string; me: Profile | undefined; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useModal(panel, close);
  return (
    <div className="account-fade fixed inset-0 z-[60] bg-ink/45 md:hidden" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} id={id} role="dialog" aria-modal="true" aria-label="Account menu"
        className="account-drawer absolute inset-y-0 right-0 flex w-[328px] max-w-[92vw] flex-col overflow-y-auto rounded-l-[28px] bg-white px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] text-ink">
        <MenuBody me={me} close={close} closeButton={
          <button type="button" onClick={close} aria-label="Close account menu" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas"><X size={20} aria-hidden="true" /></button>
        } />
      </div>
    </div>
  );
}
