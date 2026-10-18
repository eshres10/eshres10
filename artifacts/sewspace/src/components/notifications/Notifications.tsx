import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetUnreadNotificationCountQueryKey,
  listNotifications,
  markNotificationsRead,
  useGetUnreadNotificationCount,
  type Notification,
  type NotificationPage,
} from '@workspace/api-client-react';
import { Bell, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { useModal } from '@/components/flow/modal';
import { timeAgo } from '@/lib/time';

// Notifications (the bell). The number is checked about once a minute while
// the tab is open and again when you come back to it; nothing in the
// background. Opening the list marks what you saw as read (the dots stay
// until you open it again, so you can still tell which ones were new).

const POLL_MS = 60_000;

export function useUnreadNotifications() {
  return useGetUnreadNotificationCount({
    query: { refetchInterval: POLL_MS, refetchIntervalInBackground: false, refetchOnWindowFocus: true, staleTime: 30_000, retry: false },
  }).data?.unreadCount ?? 0;
}

const quote = (text: string) => `“${text}”`;

/** "Ann liked your post", in parts so the name can be bold. */
export function describe(n: Notification): { action: string; detail: string | null } {
  switch (n.kind) {
    case 'like': return { action: 'liked your post', detail: n.post?.caption ? quote(n.post.caption) : null };
    case 'comment': return { action: 'commented on your post', detail: n.comment ? quote(n.comment.body) : null };
    case 'comment_reply': return { action: 'replied to your comment', detail: n.comment ? quote(n.comment.body) : null };
    case 'follow': return { action: 'started following you', detail: null };
    case 'forum_reply': return { action: `replied to ${quote(n.topic?.title ?? 'your topic')}`, detail: n.reply ? quote(n.reply.body) : null };
    case 'answer_accepted': return { action: `accepted your answer in ${quote(n.topic?.title ?? 'a topic')}`, detail: null };
    case 'challenge_entry': return { action: `entered ${n.challenge?.title ?? 'your challenge'}`, detail: n.post?.caption ? quote(n.post.caption) : null };
  }
}

/** Marks these read on the server and puts the new number on the bell. */
function useMarkRead() {
  const client = useQueryClient();
  return async (ids?: number[]) => {
    if (ids && !ids.length) return;
    try {
      const { unreadCount } = await markNotificationsRead(ids ? { ids } : {});
      client.setQueryData(getGetUnreadNotificationCountQueryKey(), { unreadCount });
    } catch { /* stays unread; the next check shows the right number */ }
  };
}

function NotificationRow({ n, onOpen, compact = false }: { n: Notification; onOpen?: () => void; compact?: boolean }) {
  const { action, detail } = describe(n);
  const who = n.actor?.name ?? 'Someone';
  return (
    <li>
      <Link href={n.href} onClick={onOpen}
        className={`flex items-start gap-3 rounded-[16px] px-2.5 py-2.5 text-ink no-underline hover:bg-canvas focus-visible:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${n.read ? '' : 'bg-yellow/25'}`}>
        <UserAvatar name={who} avatarUrl={n.actor?.avatarUrl} size={compact ? 38 : 44} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug">
            <strong className="font-bold">{who}</strong> {action}
            {!n.read && <span className="sr-only"> (new)</span>}
          </span>
          {detail && <span className="mt-0.5 block truncate text-[13px] text-subtle">{detail}</span>}
          <time dateTime={n.createdAt} className="mt-0.5 block text-[12px] text-subtle">{timeAgo(n.createdAt)}</time>
        </span>
        {n.post?.thumbUrl
          ? <img src={n.post.thumbUrl} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" />
          : !n.read && <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-red" />}
      </Link>
    </li>
  );
}

function Empty() {
  return (
    <div className="px-4 py-10 text-center">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-canvas"><Bell size={24} aria-hidden="true" /></span>
      <p className="font-bold">Nothing new yet</p>
      <p className="mt-1 text-[14px] text-subtle">Likes, comments, replies and new followers show up here.</p>
    </div>
  );
}

/**
 * The list, shared by the popover and the page. Loads the first page when it
 * mounts, marks the unread ones it shows as read, and can load more.
 */
function NotificationList({ pageMode, onOpen }: { pageMode: boolean; onOpen?: () => void }) {
  const [pages, setPages] = useState<NotificationPage[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const markRead = useMarkRead();
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const load = async (cursor?: string) => {
    const page = await listNotifications(cursor ? { cursor } : undefined);
    setPages(old => (cursor ? [...old, page] : [page]));
    void markReadRef.current(page.items.filter(i => !i.read).map(i => i.id));
  };
  useEffect(() => {
    let live = true;
    load().then(() => { if (live) setState('ready'); }, () => { if (live) setState('error'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = pages.flatMap(p => p.items);
  const next = pages[pages.length - 1]?.nextCursor ?? null;
  if (state === 'loading') return <p role="status" className="flex items-center justify-center gap-2 py-10 text-[14px] text-subtle"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading</p>;
  if (state === 'error') return <p role="alert" className="px-4 py-8 text-center text-[14px] font-semibold text-red-ink">Notifications didn't load. Try again in a moment.</p>;
  if (!items.length) return <Empty />;
  return (
    <>
      <ul className="space-y-0.5">
        {items.map(n => <NotificationRow key={n.id} n={n} onOpen={onOpen} compact={!pageMode} />)}
      </ul>
      {pageMode && next && (
        <div className="pt-4 text-center">
          <button type="button" disabled={more} onClick={async () => { setMore(true); try { await load(next); } finally { setMore(false); } }}
            className="btn btn-line inline-flex min-h-[44px] items-center gap-2">
            {more && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
          </button>
        </div>
      )}
    </>
  );
}

function BellIcon({ count }: { count: number }) {
  return (
    <span className="relative grid place-items-center">
      <Bell size={20} aria-hidden="true" />
      {count > 0 && (
        <span aria-hidden="true" className="absolute -right-2 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}

const bellLabel = (count: number) => (count ? `Notifications, ${count} new` : 'Notifications');

/** Phones: the bell is a link to the Notifications page (sits before ☰). */
export function NotificationBellMobile({ className = '' }: { className?: string }) {
  const count = useUnreadNotifications();
  return (
    <Link href="/notifications" aria-label={bellLabel(count)} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink md:hidden ${className}`}>
      <BellIcon count={count} />
    </Link>
  );
}

/**
 * Desktop (768 px up): the bell opens a 380 px popover under it with the latest
 * notifications and "See all". Non-modal, like the account menu: Escape, a
 * click outside or choosing one closes it, and focus goes back to the bell.
 */
export function NotificationBellDesktop() {
  const count = useUnreadNotifications();
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
      <button ref={trigger} type="button" aria-label={bellLabel(count)} aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}
        className={`grid h-11 w-11 place-items-center rounded-full ${open ? 'bg-yellow' : 'hover:bg-canvas'}`}>
        <BellIcon count={count} />
      </button>
      {open && <BellPanel id={id} close={close} />}
    </div>
  );
}

function BellPanel({ id, close }: { id: string; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useModal(panel, close, { modal: false });
  return (
    <div ref={panel} id={id} role="dialog" aria-label="Notifications"
      className="account-pop absolute right-0 top-full z-50 mt-2 flex max-h-[min(560px,calc(100dvh-120px))] w-[380px] flex-col rounded-[24px] bg-white p-3 text-ink shadow-float outline outline-1 outline-line">
      <div className="flex items-center justify-between px-2.5 pb-2">
        <h2 className="font-display text-[18px] tracking-[-.03em]">Notifications</h2>
        <Link href="/notifications" onClick={close} className="text-[13px] font-bold underline underline-offset-2">See all</Link>
      </div>
      <div className="-mx-1 overflow-y-auto px-1">
        <NotificationList pageMode={false} onOpen={close} />
      </div>
    </div>
  );
}

/** The /notifications page (signed in). */
export function NotificationsPage() {
  return (
    <div className="mx-auto max-w-[640px]">
      <section aria-label="Your notifications" className="rounded-[30px] bg-white p-2.5 md:p-4">
        <NotificationList pageMode />
      </section>
      <p className="mt-4 px-2 text-center text-[13px] text-subtle">Only you see these. Nothing shows from people you've blocked or who blocked you.</p>
    </div>
  );
}
