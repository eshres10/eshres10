import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProfileQueryKey, useGetMenuSummary, useGetProfile, useUpdateProfile, type Profile } from '@workspace/api-client-react';
import { Bookmark, ChevronDown, ChevronRight, Flag, FolderKanban, Heart, Loader2, LogOut as LogOutIcon, Menu, MessageCircle, Ruler, Settings, Sparkles, SquareKanban, TrendingUp, Trophy, Users, X, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { useModal } from '@/components/flow/modal';
import { VISIBILITY_OPTIONS } from '@/components/visibility';
import { basePath } from '@/lib/clerk';


const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${className}`}>{children}</span>;
}

const ROW = 'flex min-h-[44px] w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[14px] font-semibold text-ink no-underline hover:bg-canvas focus-visible:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink';

function Row({ href, icon: Icon, label, onClick, children }: { href: string; icon: LucideIcon; label: string; onClick: () => void; children?: ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className={ROW}>
      <Icon size={19} aria-hidden="true" className="shrink-0" /><span className="flex-1 truncate">{label}</span>{children}
    </Link>
  );
}

/** cm / in, bound to the profile's units. Saves at once; the change shows straight away and is undone if the save fails. */
function MeasureIn({ me }: { me: Profile | undefined }) {
  const client = useQueryClient();
  const update = useUpdateProfile();
  const [failed, setFailed] = useState(false);
  const labelId = useId();
  const name = useId();
  const set = (units: Profile['units']) => {
    if (!me || me.units === units) return;
    const key = getGetProfileQueryKey();
    const previous = client.getQueryData<Profile>(key);
    setFailed(false);
    client.setQueryData<Profile>(key, old => (old ? { ...old, units } : old));
    update.mutate({ data: { units } }, {
      onSuccess: data => client.setQueryData(key, data),
      onError: () => { client.setQueryData(key, previous); setFailed(true); },
    });
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-3 px-2.5">
      <Ruler size={19} aria-hidden="true" className="shrink-0" />
      <span id={labelId} className="flex-1 text-[14px] font-semibold">Measure in</span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex rounded-full bg-canvas p-1">
        {([['metric', 'cm'], ['imperial', 'in']] as const).map(([value, label]) => {
          const on = me?.units === value;
          return (
            <label key={value} className={`grid h-8 min-w-[44px] cursor-pointer place-items-center rounded-full px-3 text-[13px] font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${on ? 'bg-ink text-white' : 'text-ink'}`}>
              <input type="radio" name={name} value={value} checked={on} onChange={() => set(value)} className="sr-only" />{label}
            </label>
          );
        })}
      </div>
      {failed && <p role="alert" className="w-full pl-8 text-xs font-semibold text-red-ink">That didn't save. Try again.</p>}
    </div>
  );
}

/** Log out, with "Log out of Seams Club?" in place before it happens. */
/**
 * Log out with an "are you sure?" step. Used in the account menu, the sidebar
 * (also the phone ☰ menu) and Settings, so it's easy to find.
 */
export function LogOut({ close, rowClass = ROW, panelClass = 'bg-canvas', cancelClass = 'bg-white' }: {
  close?: () => void; rowClass?: string; panelClass?: string; cancelClass?: string;
}) {
  const { signOut } = useClerk();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (asking) cancel.current?.focus(); }, [asking]);
  const confirmId = useId();
  return (
    <>
      <button type="button" onClick={() => setAsking(a => !a)} aria-expanded={asking} aria-controls={confirmId} data-testid="button-log-out" className={rowClass}>
        <LogOutIcon size={19} aria-hidden="true" className="shrink-0" /><span className="flex-1">Log out</span>
      </button>
      {asking && (
        <div id={confirmId} role="group" aria-label="Log out of Seams Club?" className={`mt-1 flex flex-wrap items-center gap-2 rounded-[16px] p-2.5 pl-3 ${panelClass}`}>
          <p className="min-w-[9.5rem] flex-1 text-[13px] font-semibold leading-snug">Log out of Seams Club?</p>
          <button ref={cancel} type="button" onClick={() => setAsking(false)} className={`min-h-[44px] whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold ${cancelClass}`}>Cancel</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await signOut({ redirectUrl: `${basePath}/` }); } finally { setBusy(false); close?.(); } }}
            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3.5 text-[13px] font-bold text-white disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Log out
          </button>
        </div>
      )}
    </>
  );
}

/** What's inside the menu, the same on both sizes. `close` runs when a link is chosen. */
function MenuBody({ me, close, closeButton, phone = false }: { me: Profile | undefined; close: () => void; closeButton?: ReactNode; phone?: boolean }) {
  const profileHref = me?.handle ? `/@${me.handle}` : '/settings';
  const audience = VISIBILITY_OPTIONS.find(o => o.value === me?.defaultPostVisibility)?.label;
  // Fresh numbers each time the menu opens (this body mounts on open).
  const summary = useGetMenuSummary({ query: { staleTime: 0, refetchOnMount: 'always', retry: false } }).data;
  return (
    <>
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
      <nav aria-label="Your account" className="border-b border-line py-1.5">
        <Row href="/studio" icon={SquareKanban} label="My studio" onClick={close} />
        <Row href="/saved" icon={Bookmark} label="Saved" onClick={close}>
          {!!summary?.savedCount && <Badge className="bg-canvas">{summary.savedCount}<span className="sr-only"> saved</span></Badge>}
        </Row>
        <Row href="/challenges" icon={Trophy} label="My challenges" onClick={close}>
          {!!summary?.activeChallengeCount && <Badge className="bg-yellow">{summary.activeChallengeCount} active</Badge>}
        </Row>
        {/* Only for sellers, once pattern selling exists (null until then). */}
        {summary && summary.salesLast24h !== null && (
          <Row href="/marketplace" icon={TrendingUp} label="Pattern sales" onClick={close}>
            {summary.salesLast24h > 0 && <Badge className="bg-ink text-white">+{money.format(summary.salesLast24h)}<span className="sr-only"> in the last 24 hours</span></Badge>}
          </Row>
        )}
      </nav>
      <div role="group" aria-label="Quick settings" className="border-b border-line py-1.5">
        <MeasureIn me={me} />
        <Row href="/settings#privacy" icon={Users} label="Posts visible to" onClick={close}>
          {audience && <span className="text-[13px] text-subtle">{audience}</span>}<ChevronRight size={16} aria-hidden="true" className="text-subtle" />
        </Row>
      </div>
      {/* Phones have no sidebar: the pages the tab bar, studio pills and community tabs don't reach. */}
      {phone && (
        <nav aria-label="Also on Seams Club" className="border-b border-line py-1.5">
          <Row href="/projects" icon={FolderKanban} label="Projects & makes" onClick={close} />
          <Row href="/ai-studio" icon={Sparkles} label="AI studio" onClick={close} />
          <Row href="/assistant" icon={MessageCircle} label="Sewing assistant" onClick={close} />
          {me?.isAdmin && <Row href="/admin/reports" icon={Flag} label="Admin: reports" onClick={close} />}
        </nav>
      )}
      <nav aria-label="More" className="border-b border-line py-1.5">
        {/* Once membership exists. */}
        {summary?.membershipAvailable && (
          <Link href="/membership" onClick={close} className={`${ROW} bg-yellow hover:bg-yellow`}>
            <Heart size={19} aria-hidden="true" className="shrink-0" /><span className="flex-1">Support Seams Club</span>
            <span className="text-[13px] font-bold">{summary.isSupporter ? 'Supporter ♥' : '$5/mo'}</span>
          </Link>
        )}
        <Row href="/settings" icon={Settings} label="Settings & privacy" onClick={close} />
        <LogOut close={close} />
      </nav>
      <p className="px-2.5 pt-2.5 text-[11px] text-subtle">© {new Date().getFullYear()} Seams Club</p>
    </>
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
 * Phones: the ☰ button at the right of the top bar (owner: one menu, no avatar
 * in the bar) opens a 328 px drawer from the right over a 45% backdrop. A modal dialog: focus stays inside, the page
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
      <button ref={trigger} type="button" aria-label="Menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink md:hidden">
        <Menu size={20} aria-hidden="true" />
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
      <div ref={panel} id={id} role="dialog" aria-modal="true" aria-label="Menu"
        className="account-drawer absolute inset-y-0 right-0 flex w-[328px] max-w-[92vw] flex-col overflow-y-auto rounded-l-[28px] bg-white px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] text-ink">
        <MenuBody me={me} close={close} phone closeButton={
          <button type="button" onClick={close} aria-label="Close menu" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas"><X size={20} aria-hidden="true" /></button>
        } />
      </div>
    </div>
  );
}
