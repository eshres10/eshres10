import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCollectionItem, createCollection, getListCollectionsQueryKey, listCollections, sendExploreFeedback, undoExploreFeedback,
  type Collection, type ExploreCard,
} from '@workspace/api-client-react';
import { ChevronDown, EyeOff, Loader2, Lock, MoreHorizontal, Share, Sparkle, X } from 'lucide-react';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { shareLink } from '@/components/feed/PostActions';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { useModal } from '@/components/flow/modal';
import { Sheet } from '@/components/social/Sheet';
import { toast } from '@/hooks/use-toast';
import { cardArea, cardHref, cardTitle, CardMedia, ExploreCardView } from './cards';

// Explore step 4: Save (to a private collection), Share, More like this and
// Hide on every card. Three ways in: a long press (the arc of round buttons),
// the "…" button (a plain menu, keyboard friendly), and on devices that hover
// a Save button over photo cards. Signed out, Share works; the rest asks to
// sign in. Saved and hidden cards change in place (no refetch reshuffling).

type Action = 'save' | 'share' | 'more' | 'hide';
const ACTIONS: Array<{ id: Action; label: string; menuLabel: string; on: string }> = [
  { id: 'save', label: 'Save', menuLabel: 'Save to collection', on: 'bg-red text-white' },
  { id: 'share', label: 'Share', menuLabel: 'Share', on: 'bg-blue text-white' },
  { id: 'more', label: 'More', menuLabel: 'More like this', on: 'bg-yellow text-ink' },
  { id: 'hide', label: 'Hide', menuLabel: 'Hide (see fewer)', on: 'bg-peach text-ink' },
];
const QUICK_SAVES = 'Quick saves';
const HOLD_MS = 450;
const SLOP_PX = 10;
const MENU_WIDTH = 232;

/** The sewing pin from the design (Save). */
function PinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.4 10.6 3.5 20.5" /><path d="M16 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z" fill="currentColor" />
    </svg>
  );
}
function ActionIcon({ id, size = 22 }: { id: Action; size?: number }) {
  if (id === 'save') return <PinIcon size={size} />;
  const Icon = id === 'share' ? Share : id === 'more' ? Sparkle : EyeOff;
  return <Icon size={size} strokeWidth={2.2} aria-hidden="true" />;
}

interface MenuState { card: ExploreCard; index: number; rect: DOMRect; point: { x: number; y: number } }
interface Ctx {
  isSaved: (card: ExploreCard) => boolean;
  isHidden: (card: ExploreCard) => boolean;
  lastCollection: string;
  run: (action: Action, card: ExploreCard, index: number) => void;
  quickSave: (card: ExploreCard) => void;
  openMenu: (state: MenuState) => void;
  undoHide: (card: ExploreCard) => void;
}
const ActionsContext = createContext<Ctx | null>(null);
function useActions(): Ctx {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('Explore cards need <ExploreActionsProvider>');
  return ctx;
}

function failText(err: unknown): string {
  return (err as { status?: number })?.status === 429 ? 'That’s a lot for one hour. Try again a little later.' : 'Something went wrong. Try again.';
}

export function ExploreActionsProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [saved, setSaved] = useState<Record<string, true>>({});
  const [hidden, setHidden] = useState<Record<string, true>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sheet, setSheet] = useState<{ card: ExploreCard; index: number } | null>(null);
  const collections = useQuery({ queryKey: getListCollectionsQueryKey(), queryFn: () => listCollections(), enabled: Boolean(isSignedIn), staleTime: 60_000 });
  // The list comes most recently used first.
  const lastCollection = collections.data?.[0]?.name ?? QUICK_SAVES;

  const signInToSave = useCallback(() => ask({ title: 'Sign in to save ideas', body: "Collections are private: only you see what you save. You'll come straight back here." }), [ask]);
  const signInToTune = useCallback(() => ask({ title: 'Sign in to tune Explore', body: "More like this and Hide only change what you see. You'll come straight back here." }), [ask]);

  const saveTo = useCallback(async (card: ExploreCard, target: { id?: number; name: string }) => {
    try {
      const id = target.id ?? (await createCollection({ name: target.name })).id;
      const collection = await addCollectionItem(id, { type: card.type, id: card.itemId });
      setSaved(s => ({ ...s, [card.key]: true }));
      toast({ title: `Saved to ${collection.name}` });
      void client.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
      if (card.type === 'post') void client.invalidateQueries({ queryKey: FEED_KEYS.saved });
      return true;
    } catch (err) {
      toast({ title: 'Not saved', description: failText(err) });
      return false;
    }
  }, [client]);

  const quickSave = useCallback((card: ExploreCard) => {
    if (!signInToSave()) return;
    const last = collections.data?.[0];
    void saveTo(card, last ? { id: last.id, name: last.name } : { name: QUICK_SAVES });
  }, [collections.data, saveTo, signInToSave]);

  const hide = useCallback(async (card: ExploreCard) => {
    setHidden(h => ({ ...h, [card.key]: true }));
    try {
      await sendExploreFeedback({ type: card.type, id: card.itemId, kind: 'see_less' });
    } catch (err) {
      setHidden(h => { const next = { ...h }; delete next[card.key]; return next; });
      toast({ title: 'Couldn’t hide that', description: failText(err) });
    }
  }, []);

  const undoHide = useCallback(async (card: ExploreCard) => {
    setHidden(h => { const next = { ...h }; delete next[card.key]; return next; });
    try {
      await undoExploreFeedback({ type: card.type, itemId: card.itemId, kind: 'see_less' });
    } catch (err) {
      setHidden(h => ({ ...h, [card.key]: true }));
      toast({ title: 'Couldn’t undo that', description: failText(err) });
    }
  }, []);

  const run = useCallback((action: Action, card: ExploreCard, index: number) => {
    setMenu(null);
    if (action === 'share') {
      const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${cardHref(card)}`;
      void shareLink(url, cardTitle(card)).then(copied => { if (copied) toast({ title: 'Link copied' }); });
      return;
    }
    if (action === 'save') {
      if (signInToSave()) setSheet({ card, index });
      return;
    }
    if (!signInToTune()) return;
    if (action === 'hide') {
      void hide(card);
      return;
    }
    sendExploreFeedback({ type: card.type, id: card.itemId, kind: 'more_like' })
      .then(() => toast({ title: 'We’ll show you more like this' }))
      .catch(err => toast({ title: 'Not sent', description: failText(err) }));
  }, [hide, signInToSave, signInToTune]);

  const value = useMemo<Ctx>(() => ({
    isSaved: card => card.saved || Boolean(saved[card.key]),
    isHidden: card => Boolean(hidden[card.key]),
    lastCollection, run, quickSave, undoHide, openMenu: setMenu,
  }), [saved, hidden, lastCollection, run, quickSave, undoHide]);

  return (
    <ActionsContext.Provider value={value}>
      {children}
      {menu && <LongPressMenu state={menu} onClose={() => setMenu(null)} onRun={a => run(a, menu.card, menu.index)} />}
      {sheet && (
        <SaveSheet card={sheet.card} index={sheet.index} collections={collections.data} loading={collections.isLoading}
          onClose={() => setSheet(null)}
          onSave={async target => { if (await saveTo(sheet.card, target)) setSheet(null); }} />
      )}
    </ActionsContext.Provider>
  );
}

/**
 * Hold for 450 ms to open the arc menu; moving more than 10 px first cancels
 * (so scrolling never opens it). A hold that opened the menu never opens the card.
 */
function useLongPress(open: (point: { x: number; y: number }) => void) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const [pressed, setPressed] = useState(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
    setPressed(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    pressed,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 || (e.target as Element).closest('button')) return;
        const point = { x: e.clientX, y: e.clientY };
        start.current = point;
        fired.current = false;
        setPressed(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          fired.current = true;
          start.current = null;
          setPressed(false);
          open(point);
        }, HOLD_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onClickCapture: (e: React.MouseEvent) => {
        if (!fired.current) return;
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
    },
  };
}

/** One Explore card with its actions: long press, "…", hover Save, Saved badge, and Hide's stand-in. */
export function ExploreActionCard({ card, index }: { card: ExploreCard; index: number }) {
  const actions = useActions();
  const area = cardArea(card);
  const areaRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const press = useLongPress(point => {
    const box = (areaRef.current ?? wrapRef.current)!.getBoundingClientRect();
    actions.openMenu({ card, index, rect: box, point });
  });
  if (actions.isHidden(card)) return <HiddenNotice card={card} />;
  const saved = actions.isSaved(card);
  const title = cardTitle(card);
  // Photo cards: a "Saved" pill on the photo. Text cards: a round pin beside "…" (their first line leaves room for both).
  const badge = saved && (area
    ? <span className="pointer-events-none absolute right-2 top-2 inline-flex min-h-8 items-center rounded-full bg-ink px-3 text-[12px] font-bold text-white">Saved</span>
    : <span className="pointer-events-none absolute right-12 top-3 grid h-8 w-8 place-items-center rounded-full bg-ink text-white"><PinIcon size={15} /><span className="sr-only">Saved</span></span>);
  return (
    <div ref={wrapRef} {...press.handlers}
      className={`group/card relative select-none transition-transform duration-150 motion-reduce:transition-none has-[[aria-expanded=true]]:z-20 ${press.pressed ? 'scale-[.97]' : ''}`}>
      <ExploreCardView card={card} index={index} saved={saved} />
      {area ? (
        <div ref={areaRef} className="pointer-events-none absolute inset-x-0 top-0" style={{ aspectRatio: area }}>
          <span aria-hidden="true" className="absolute inset-0 rounded-[20px] bg-ink/40 opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100" />
          {badge}
          <div className="opacity-0 transition-opacity [@media(hover:none)]:hidden group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-has-[:focus-visible]/card:pointer-events-auto group-has-[:focus-visible]/card:opacity-100">
            <button type="button" onClick={() => actions.run('save', card, index)} aria-label={`Choose a collection for ${title}`}
              className="absolute left-2 top-2 inline-flex min-h-10 max-w-[calc(100%-6.5rem)] items-center gap-1 rounded-full bg-white/95 pl-3 pr-2.5 text-[13px] font-bold text-ink">
              <span className="truncate">{actions.lastCollection}</span><ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />
            </button>
            {!saved && (
              <button type="button" onClick={() => actions.quickSave(card)} aria-label={`Save ${title} to ${actions.lastCollection}`}
                className="absolute right-2 top-2 min-h-10 rounded-full bg-red px-4 text-[14px] font-bold text-white">Save</button>
            )}
            <MoreMenu card={card} index={index} className="absolute bottom-2 right-2" round />
          </div>
          {/* Touch screens: beside the caption, just under the photo. Hover screens use the corner one. */}
          <MoreMenu card={card} index={index} className="pointer-events-auto absolute right-0 top-full mt-0.5 [@media(hover:hover)]:hidden" />
        </div>
      ) : (
        <>
          {badge}
          <MoreMenu card={card} index={index} className="absolute right-1.5 top-1.5" />
        </>
      )}
    </div>
  );
}

function HiddenNotice({ card }: { card: ExploreCard }) {
  const { undoHide } = useActions();
  return (
    <div className="rounded-[20px] bg-white px-3.5 py-5 text-center md:bg-canvas" role="status">
      <b className="block text-[13px]">Got it. You'll see fewer ideas like this.</b>
      <button type="button" onClick={() => undoHide(card)} className="mt-2 min-h-11 rounded-full bg-canvas px-4 text-[13px] font-bold md:bg-white">
        Undo<span className="sr-only">: show {cardTitle(card)} again</span>
      </button>
    </div>
  );
}

/** The "…" button: the same four actions as a plain menu (arrow keys, Escape returns to the button). */
function MoreMenu({ card, index, className, round = false }: { card: ExploreCard; index: number; className: string; round?: boolean }) {
  const { run } = useActions();
  const [open, setOpen] = useState(false);
  // Opens toward the room it has: right-aligned unless that runs off the left edge, upward near the bottom.
  const [place, setPlace] = useState('right-0 top-full mt-1');
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const r = button.current!.getBoundingClientRect();
    const x = r.right - MENU_WIDTH < 8 ? 'left-0' : 'right-0';
    const y = r.bottom + 220 > window.innerHeight && r.top > 240 ? 'bottom-full mb-1' : 'top-full mt-1';
    setPlace(`${x} ${y}`);
    setOpen(o => !o);
  };
  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const title = cardTitle(card);
  return (
    <div className={className}>
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`More options for ${title}`}
        onClick={toggle}
        className={round ? 'grid h-10 w-10 place-items-center rounded-full bg-white/95 text-ink' : 'grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-ink/5'}>
        <MoreHorizontal size={20} strokeWidth={2.6} aria-hidden="true" />
      </button>
      {open && (
        <div ref={list} role="menu" aria-label={`Options for ${title}`} onKeyDown={onKey}
          className={`absolute ${place} z-30 w-[232px] rounded-[18px] border border-line bg-white p-1.5 text-left`}>
          {ACTIONS.map(a => (
            <button key={a.id} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { close(true); run(a.id, card, index); }}
              className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[14px] font-semibold text-ink hover:bg-canvas focus:bg-canvas focus:outline-none">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${a.on}`}><ActionIcon id={a.id} size={16} /></span>
              {a.menuLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Where the four round buttons go: an arc around the press, turned away from the nearest edge. */
function arcPositions(point: { x: number; y: number }, w: number, h: number) {
  const desk = w >= 768;
  let base = Math.atan2(h * 0.45 - point.y, w / 2 - point.x);
  if (!desk) {
    base = point.x < w / 2 ? -Math.PI / 4 : -3 * Math.PI / 4;
    if (point.y < 260) base = point.x < w / 2 ? Math.PI / 5 : Math.PI - Math.PI / 5;
  }
  const radius = desk ? 104 : 100, spread = 0.74;
  return ACTIONS.map((_, n) => {
    const angle = base + (n - 1.5) * spread;
    const x = Math.max(8, Math.min(w - 64, point.x + Math.cos(angle) * radius - 28));
    const y = Math.max(8, Math.min(h - 90, point.y + Math.sin(angle) * radius - 28));
    return { x, y, cx: x + 28, cy: y + 28 };
  });
}

/**
 * The long-press menu. The finger is still down when it opens: sliding onto a
 * button selects it and letting go there runs it. Tapping a button, or
 * keyboard focus + Enter, works too. Escape or a tap outside closes it.
 */
function LongPressMenu({ state, onClose, onRun }: { state: MenuState; onClose: () => void; onRun: (a: Action) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const selRef = useRef<number | null>(null);
  const gesture = useRef(true); // the press that opened it hasn't been let go yet
  const [size] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const spots = useMemo(() => arcPositions(state.point, size.w, size.h), [state.point, size]);
  const select = (n: number | null) => { selRef.current = n; setSel(n); };
  useModal(panel, onClose);

  useLayoutEffect(() => {
    const hit = (e: PointerEvent) => {
      if (!gesture.current) return;
      const n = spots.findIndex(s => Math.hypot(e.clientX - s.cx, e.clientY - s.cy) < 38);
      select(n < 0 ? null : n);
    };
    const up = () => {
      if (!gesture.current) return;
      gesture.current = false;
      if (selRef.current !== null) onRun(ACTIONS[selRef.current].id);
    };
    const noScroll = (e: TouchEvent) => e.preventDefault();
    const closeOnResize = () => onClose();
    window.addEventListener('pointermove', hit);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', noScroll, { passive: false });
    window.addEventListener('wheel', closeOnResize, { passive: true });
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('pointermove', hit);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', noScroll);
      window.removeEventListener('wheel', closeOnResize);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [spots, onRun, onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    items[(at + step + items.length) % items.length]?.focus();
  };

  const { rect, point, card } = state;
  const title = cardTitle(card);
  return createPortal(
    <div ref={panel} className="fixed inset-0 z-[70] select-none [-webkit-touch-callout:none]" onContextMenu={e => e.preventDefault()}>
      <div className="absolute inset-0 bg-ink/60" onClick={onClose} aria-hidden="true" />
      <div aria-hidden="true" className="pointer-events-none absolute overflow-hidden rounded-[20px] shadow-[0_24px_50px_-12px_rgb(0_0_0/0.45)]"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, transform: 'scale(1.04)' }}>
        <CardMedia card={card} index={state.index} />
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute h-11 w-11 rounded-full border-[3px] border-white/90 bg-white/20"
        style={{ left: point.x - 22, top: point.y - 22 }} />
      <div role="menu" aria-label={`Options for ${title}`} onKeyDown={onKey}>
        {ACTIONS.map((a, n) => {
          const on = sel === n;
          return (
            <div key={a.id} className="absolute flex w-14 flex-col items-center gap-1" style={{ left: spots[n].x, top: spots[n].y }}>
              <button type="button" role="menuitem" aria-label={a.label}
                onClick={() => onRun(a.id)}
                onPointerEnter={() => { if (!gesture.current) select(n); }}
                onPointerLeave={() => { if (!gesture.current && selRef.current === n) select(null); }}
                onFocus={e => { if (e.currentTarget.matches(':focus-visible')) select(n); }}
                onBlur={() => { if (selRef.current === n) select(null); }}
                className={`grid h-14 w-14 place-items-center rounded-full shadow-[0_8px_18px_-6px_rgb(0_0_0/0.3)] transition-transform duration-100 focus:outline-none motion-reduce:transition-none ${on ? `${a.on} scale-[1.14]` : 'bg-white text-ink'}`}>
                <ActionIcon id={a.id} />
              </button>
              <span aria-hidden="true" className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold transition-opacity duration-100 ${on ? a.on : 'opacity-0'}`}>{a.label}</span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

/** Save to collection: a bottom sheet on phones, a centred dialog from 640 px. */
function SaveSheet({ card, index, collections, loading, onClose, onSave }: {
  card: ExploreCard; index: number; collections: Collection[] | undefined; loading: boolean;
  onClose: () => void; onSave: (target: { id?: number; name: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (target: { id?: number; name: string }) => {
    if (busy) return;
    setBusy(true);
    await onSave(target);
    setBusy(false);
  };
  const list = collections ?? [];
  const typed = name.replace(/\s+/g, ' ').trim();
  return (
    <Sheet label="Save to collection" onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="h-16 w-[52px] shrink-0 overflow-hidden rounded-[12px]"><CardMedia card={card} index={index} small /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[22px] leading-tight tracking-[-.05em]">Save to collection</h2>
          <span className="block truncate text-[13px] text-subtle">{cardTitle(card)}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas"><X size={16} strokeWidth={2.6} aria-hidden="true" /></button>
      </div>
      <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-[12px] text-subtle"><Lock size={13} aria-hidden="true" />Collections are private. Only you see what you save.</p>
      {loading ? (
        <div className="grid place-items-center py-6" role="status" aria-label="Loading collections"><Loader2 className="animate-spin" aria-hidden="true" /></div>
      ) : (
        <ul className="flex flex-col" aria-label="Your collections">
          {(list.length ? list : [{ id: undefined, name: QUICK_SAVES, count: 0, coverUrl: null }]).map(c => (
            <li key={c.id ?? 'quick'}>
              <button type="button" disabled={busy} onClick={() => save({ id: c.id, name: c.name })}
                className="flex min-h-16 w-full items-center gap-3 rounded-[16px] px-2 py-1.5 text-left hover:bg-canvas disabled:opacity-60">
                {c.coverUrl
                  ? <img src={c.coverUrl} alt="" className="h-[52px] w-[52px] shrink-0 rounded-[12px] object-cover" />
                  : <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[12px] bg-canvas"><PinIcon size={20} /></span>}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{c.name}</b>
                  <span className="text-[12px] text-subtle">{c.count} {c.count === 1 ? 'save' : 'saves'}</span>
                </span>
                <Lock size={15} className="shrink-0 text-subtle" role="img" aria-label="Private" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-2 flex items-center gap-2 border-t border-line pt-3" onSubmit={e => { e.preventDefault(); if (typed) void save({ name: typed }); }}>
        <input type="text" value={name} onChange={e => setName(e.target.value.slice(0, 40))} maxLength={40}
          aria-label="New collection name" placeholder="New collection, e.g. Winter coats" className="field min-w-0 flex-1" />
        <button type="submit" disabled={!typed || busy} className="min-h-[46px] shrink-0 rounded-full bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-35">Create</button>
      </form>
    </Sheet>
  );
}
