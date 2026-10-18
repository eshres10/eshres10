import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  createComment, deleteComment, followProfile, getGetPostCommentsPageQueryKey, getGetPublicPostQueryKey, getGetPublicProfileQueryKey,
  getPostCommentsPage, likeComment, likePost, unfollowProfile, unlikeComment, unlikePost, useGetProfile, useGetPublicPost, useGetPublicProfile,
  type Comment, type CommentReply, type CommentsPage, type FeedPost,
} from '@workspace/api-client-react';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Loader2, MessageCircle, Pencil, Send, X } from 'lucide-react';
import { Link } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { PinIcon } from '@/components/explore/actions';
import { CaptionText } from '@/components/feed/CaptionText';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { PostLink } from '@/components/feed/PostLink';
import { postUrl, shareLink } from '@/components/feed/PostActions';
import { useModal } from '@/components/flow/modal';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { toast } from '@/hooks/use-toast';
import { timeAgo } from '@/lib/time';

// The post view (Explore step 5): a post opened over Explore. From 768 px a
// modal (photo left on black, caption, comments and actions in a 420 px
// column); below that a full-screen page. Comments come 20 at a time with
// their replies; posting shows straight away and rolls back if it fails.
// Liking, commenting, following and saving ask signed-out visitors to sign in.

const FABRIC_LABEL: Record<string, string> = { linen: 'Linen', cotton: 'Cotton', satin: 'Satin', viscose: 'Viscose', crepe: 'Crepe', haul: 'Fabric haul' };
const MAX_COMMENT = 1000;

function useWide(): boolean {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return wide;
}

function failText(err: unknown, fallback: string): string {
  const e = err as { status?: number; data?: { error?: string } };
  return e?.data?.error ?? (e?.status === 429 ? 'That’s a lot for one hour. Try again later.' : fallback);
}

export interface PostViewProps {
  postId: number;
  onClose: () => void;
  /** Previous / next post in the feed's order, if any. */
  prevId?: number | null;
  nextId?: number | null;
  onStep?: (id: number) => void;
  /** Save to collection (Explore's picker) and whether it's already saved. */
  saved?: boolean;
  onSave?: () => void;
}

export function PostView(props: PostViewProps) {
  const wide = useWide();
  const panel = useRef<HTMLDivElement>(null);
  const post = useGetPublicPost(props.postId, { query: { retry: false } });
  useModal(panel, props.onClose, { focusContainer: true });
  const p = post.data;
  useEffect(() => {
    if (!p) return;
    const before = document.title;
    document.title = p.caption ? `${p.author.name} on Seams Club: “${p.caption.slice(0, 60)}”` : `@${p.author.handle} on Seams Club`;
    return () => { document.title = before; };
  }, [p]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest('input, textarea, [role=menu]');
    if (typing || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft' && props.prevId) { e.preventDefault(); props.onStep?.(props.prevId); }
    if (e.key === 'ArrowRight' && props.nextId) { e.preventDefault(); props.onStep?.(props.nextId); }
  };
  const label = p ? `Post by @${p.author.handle}` : 'Post';
  const body = post.isLoading
    ? <div className="grid h-full place-items-center" role="status" aria-label="Loading post"><Loader2 className="animate-spin" aria-hidden="true" /></div>
    : !p
      ? <div className="grid h-full place-items-center p-8 text-center text-subtle">This post isn’t available. It may have been deleted or made private.</div>
      : null;

  if (wide) {
    return createPortal(
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}
        className="fixed inset-0 z-[80] bg-ink/70 outline-none" onMouseDown={e => { if (e.target === e.currentTarget) props.onClose(); }}>
        <button type="button" onClick={props.onClose} aria-label="Close" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10"><X size={26} aria-hidden="true" /></button>
        {props.prevId && <StepButton side="left" onClick={() => props.onStep?.(props.prevId!)} />}
        {props.nextId && <StepButton side="right" onClick={() => props.onStep?.(props.nextId!)} />}
        <div className="absolute left-1/2 top-1/2 grid h-[min(780px,calc(100%-80px))] w-[min(1140px,calc(100%-160px))] -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)_420px] overflow-hidden rounded-[18px] bg-white">
          {body ?? <>
            <Media post={p!} wide />
            <div className="flex min-h-0 flex-col">
              <PostHeader post={p!} />
              <Discussion post={p!} wide saved={props.saved} onSave={props.onSave} />
            </div>
          </>}
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="fixed inset-0 z-[80] flex flex-col bg-white outline-none">
      <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={props.onClose} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full"><ArrowLeft size={22} aria-hidden="true" /></button>
        <h1 className="font-display text-[19px] tracking-[-.035em]">Post</h1>
      </header>
      {body ?? <Discussion post={p!} wide={false} saved={props.saved} onSave={props.onSave} top={<><PostHeader post={p!} /><Media post={p!} wide={false} /></>} />}
    </div>,
    document.body,
  );
}

function StepButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button type="button" onClick={onClick} aria-label={side === 'left' ? 'Previous post' : 'Next post'}
      className={`absolute top-1/2 -mt-[22px] grid h-11 w-11 place-items-center rounded-full bg-white text-ink ${side === 'left' ? 'left-[22px]' : 'right-[22px]'}`}>
      <Icon size={22} aria-hidden="true" />
    </button>
  );
}

/** The photo(s): contained on black in the modal, 4:5 on phones. Words posts show their text on yellow. */
function Media({ post, wide }: { post: FeedPost; wide: boolean }) {
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [post.id]);
  const media = post.media;
  if (!media.length) {
    return (
      <div className={`flex items-center justify-center bg-yellow p-8 ${wide ? 'min-h-0' : 'aspect-[4/5]'}`}>
        <p className={`whitespace-pre-line font-display leading-tight tracking-[-.03em] ${wide ? 'max-w-[520px] text-[34px]' : 'text-[26px]'}`}><CaptionText text={post.caption} linked={false} /></p>
      </div>
    );
  }
  const photo = media[Math.min(at, media.length - 1)];
  return (
    <div className={`relative ${wide ? 'grid min-h-0 place-items-center bg-ink' : 'aspect-[4/5] bg-line'}`}>
      <img src={photo.url} alt={photo.altText || (at === 0 ? post.caption.slice(0, 120) : '')} draggable={false}
        className={`h-full w-full ${wide ? 'object-contain' : 'object-cover'}`} style={wide ? undefined : { background: photo.color ?? undefined }} />
      {media.length > 1 && (
        <>
          {at > 0 && <button type="button" onClick={() => setAt(at - 1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -mt-4 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink"><ChevronLeft size={18} aria-hidden="true" /></button>}
          {at < media.length - 1 && <button type="button" onClick={() => setAt(at + 1)} aria-label="Next photo" className="absolute right-2 top-1/2 -mt-4 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink"><ChevronRight size={18} aria-hidden="true" /></button>}
          <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
            {media.map((m, i) => <span key={m.id} className={`h-1.5 w-1.5 rounded-full ${i === at ? 'bg-white' : 'bg-white/50'}`} />)}
          </span>
          <span className="sr-only" aria-live="polite">Photo {at + 1} of {media.length}</span>
        </>
      )}
    </div>
  );
}

function PostHeader({ post }: { post: FeedPost }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 py-3">
      <Link href={`/@${post.author.handle}`} aria-hidden="true" tabIndex={-1}><UserAvatar name={post.author.name} avatarUrl={post.author.avatarUrl} size={34} /></Link>
      <Link href={`/@${post.author.handle}`} className="truncate text-[14px] font-bold text-ink no-underline">{post.author.handle}</Link>
      {!post.isOwner && <><span aria-hidden="true" className="text-subtle">·</span><FollowLink handle={post.author.handle} /></>}
      <span className="flex-1" />
      {post.isOwner
        ? <Link href={`/posts/${post.id}/edit`} aria-label="Edit post" className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-canvas"><Pencil size={16} aria-hidden="true" /></Link>
        : <SafetyMenu kind="post" targetId={String(post.id)} what="post" authorHandle={post.author.handle} label="More options" size={36} />}
    </div>
  );
}

function FollowLink({ handle }: { handle: string }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const profile = useGetPublicProfile(handle, { query: { enabled: Boolean(isSignedIn) } });
  const [busy, setBusy] = useState(false);
  const following = Boolean(profile.data?.followedByMe);
  const toggle = async () => {
    if (!ask({ title: `Sign in to follow @${handle}`, body: "You'll see their posts on Home. You'll come straight back here." })) return;
    setBusy(true);
    try {
      await (following ? unfollowProfile(handle) : followProfile(handle));
      await client.invalidateQueries({ queryKey: getGetPublicProfileQueryKey(handle) });
    } catch (err) {
      toast({ title: 'That didn’t work', description: failText(err, 'Try again.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={following}
      className={`min-h-9 text-[14px] font-bold disabled:opacity-50 ${following ? 'text-subtle' : 'text-blue-ink'}`}>
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

type Draft = { id: number; handle: string } | null;
type Pages = InfiniteData<CommentsPage, string | undefined>;

/** Caption, comments, actions and the comment box. On phones `top` (header + photo) scrolls with them. */
function Discussion({ post, wide, saved, onSave, top }: { post: FeedPost; wide: boolean; saved?: boolean; onSave?: () => void; top?: ReactNode }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const me = useGetProfile({ query: { enabled: Boolean(isSignedIn) } });
  const key = [...getGetPostCommentsPageQueryKey(post.id), 'pages'];
  const comments = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => getPostCommentsPage(post.id, pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Draft>(null);
  const [posting, setPosting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const postKey = getGetPublicPostQueryKey(post.id);

  const signInToComment = () => ask({ title: 'Sign in to comment', body: "Join the conversation. You'll come straight back to this post." });
  const focusInput = () => { if (signInToComment()) input.current?.focus(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || posting || !signInToComment()) return;
    const author = { handle: me.data?.handle ?? '', name: me.data?.name ?? '', avatarUrl: me.data?.avatarUrl ?? null };
    const tempId = -Date.now();
    const temp: Comment = { id: tempId, postId: post.id, parentId: replyTo?.id ?? null, body, createdAt: new Date().toISOString(), author, canDelete: false, likeCount: 0, likedByMe: false, replies: [] };
    const parent = replyTo;
    // Show it straight away: a reply under its comment, a new comment at the end of what's loaded.
    client.setQueryData<Pages>(key, data => {
      if (!data) return data;
      const pages = data.pages.map(pg => ({ ...pg, items: pg.items.map(c => (parent && c.id === parent.id ? { ...c, replies: [...c.replies, temp] } : c)) }));
      if (!parent) pages[pages.length - 1] = { ...pages[pages.length - 1], items: [...pages[pages.length - 1].items, temp] };
      return { ...data, pages };
    });
    setText('');
    setReplyTo(null);
    setPosting(true);
    try {
      await createComment(post.id, { body, parentId: parent?.id ?? null });
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: postKey });
      void client.invalidateQueries({ queryKey: FEED_KEYS.all });
    } catch (err) {
      // Roll back and give the words back.
      client.setQueryData<Pages>(key, data => data && { ...data, pages: data.pages.map(pg => ({ ...pg, items: pg.items.filter(c => c.id !== tempId).map(c => ({ ...c, replies: c.replies.filter(r => r.id !== tempId) })) })) });
      setText(body);
      setReplyTo(parent);
      toast({ title: 'Comment not posted', description: failText(err, "That didn't post. Try again.") });
    } finally {
      setPosting(false);
    }
  };

  const items = comments.data?.pages.flatMap(pg => pg.items) ?? [];
  const total = comments.data?.pages[0]?.total ?? post.commentCount;
  const pattern = post.tags.find(t => t.kind === 'pattern');

  const caption = (
    <div className="flex gap-2.5">
      {wide && <UserAvatar name={post.author.name} avatarUrl={post.author.avatarUrl} size={32} />}
      <div className="min-w-0 text-[14px] leading-[1.45]">
        {(wide || post.media.length > 0) && post.caption && <p className="whitespace-pre-line break-words"><b className="mr-1.5">{post.author.handle}</b><CaptionText text={post.caption} /></p>}
        {post.linkUrl && <div className="mt-2"><PostLink url={post.linkUrl} /></div>}
        {(pattern || post.fabric) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pattern && <Link href={`/search?tab=patterns&q=${encodeURIComponent(pattern.name)}`} className="inline-flex min-h-8 items-center rounded-full bg-yellow px-3 text-[12px] font-bold text-ink no-underline">Pattern: {pattern.name}</Link>}
            {post.fabric && <span className="inline-flex min-h-8 items-center rounded-full bg-blue-soft px-3 text-[12px] font-bold">Fabric: {FABRIC_LABEL[post.fabric] ?? post.fabric}</span>}
          </div>
        )}
        {wide && <p className="mt-1.5 text-[12px] text-subtle"><time dateTime={String(post.createdAt)}>{timeAgo(post.createdAt)}</time></p>}
      </div>
    </div>
  );
  const list = (
    <section aria-label="Comments" className="space-y-4">
      {!wide && <h2 className="text-[14px] font-semibold text-subtle">{total === 1 ? '1 comment' : `${total.toLocaleString()} comments`}</h2>}
      {comments.isLoading
        ? <div className="grid place-items-center py-6" role="status" aria-label="Loading comments"><Loader2 className="animate-spin" aria-hidden="true" /></div>
        : items.length === 0
          ? <p className="text-[14px] text-subtle">No comments yet. Say something kind or ask a question.</p>
          : (
            <ul className="space-y-4">
              {items.map(c => (
                <li key={c.id} id={`comment-${c.id}`}>
                  <CommentRow comment={c} postId={post.id} cacheKey={key} onReply={() => { setReplyTo({ id: c.id, handle: c.author.handle }); focusInput(); }} />
                  {c.replies.length > 0 && (
                    <ul className="ml-[42px] mt-3 space-y-3">
                      {c.replies.map(r => <li key={r.id} id={`comment-${r.id}`}><CommentRow comment={r} postId={post.id} cacheKey={key} /></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
      {comments.hasNextPage && (
        <button type="button" onClick={() => void comments.fetchNextPage()} disabled={comments.isFetchingNextPage}
          className="inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-subtle">
          {comments.isFetchingNextPage && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}View more comments
        </button>
      )}
    </section>
  );
  const actions = <Actions post={post} saved={saved} onSave={onSave} onComment={focusInput} />;
  const box = (
    <form onSubmit={submit} className={`shrink-0 border-t border-line bg-white ${wide ? 'px-3.5 py-2' : 'px-3 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2'}`}>
      {replyTo && (
        <p className="flex items-center gap-1 text-[12px] font-semibold text-subtle">
          Replying to @{replyTo.handle}
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="grid h-8 w-8 place-items-center rounded-full hover:bg-canvas"><X size={14} aria-hidden="true" /></button>
        </p>
      )}
      <div className="flex items-center gap-2">
        <UserAvatar name={me.data?.name} avatarUrl={me.data?.avatarUrl} size={30} />
        <input ref={input} id={`post-view-comment-${post.id}`} type="text" value={text} maxLength={MAX_COMMENT}
          onChange={e => setText(e.target.value)} onFocus={() => { if (!isSignedIn) { input.current?.blur(); signInToComment(); } }}
          aria-label={replyTo ? `Reply to @${replyTo.handle}` : 'Add a comment'} placeholder={replyTo ? `Reply to @${replyTo.handle}…` : 'Add a comment…'}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle" />
        <button type="submit" disabled={!text.trim() || posting} className="min-h-11 px-2 text-[14px] font-bold text-blue-ink disabled:opacity-40">Post</button>
      </div>
    </form>
  );

  if (wide) {
    return (
      <>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3.5">{caption}{list}</div>
        <div className="shrink-0 border-t border-line px-3.5 pb-2.5 pt-1.5">{actions}</div>
        {box}
      </>
    );
  }
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {top}
        <div className="space-y-3 px-3.5 pb-6 pt-1">{actions}{caption}{list}</div>
      </div>
      {box}
    </>
  );
}

function Actions({ post, saved, onSave, onComment }: { post: FeedPost; saved?: boolean; onSave?: () => void; onComment: () => void }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const key = getGetPublicPostQueryKey(post.id);
  const [busy, setBusy] = useState(false);
  const toggleLike = async () => {
    if (!ask({ title: 'Sign in to like this post', body: "It's free. You'll come straight back to this post." }) || busy) return;
    const next = !post.likedByMe;
    const patch = (liked: boolean, likeCount: number) => client.setQueryData<FeedPost>(key, d => d && { ...d, likedByMe: liked, likeCount });
    patch(next, post.likeCount + (next ? 1 : -1));
    setBusy(true);
    try {
      const state = await (next ? likePost(post.id) : unlikePost(post.id));
      patch(state.liked, state.likeCount);
      void client.invalidateQueries({ queryKey: FEED_KEYS.all });
    } catch (err) {
      patch(post.likedByMe, post.likeCount);
      toast({ title: 'That didn’t work', description: failText(err, 'Try again.') });
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (await shareLink(postUrl(post.id), `Post by @${post.author.handle} on Seams Club`)) toast({ title: 'Link copied' });
  };
  const likes = post.likeCount;
  const date = new Date(post.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={toggleLike} aria-pressed={post.likedByMe} aria-label="Like" className="-ml-2.5 grid h-11 w-11 place-items-center">
          <Heart size={24} aria-hidden="true" className={post.likedByMe ? 'fill-red text-red' : ''} />
        </button>
        <button type="button" onClick={onComment} aria-label="Comment" className="grid h-11 w-11 place-items-center"><MessageCircle size={24} aria-hidden="true" /></button>
        <button type="button" onClick={() => void share()} aria-label="Share" className="grid h-11 w-11 place-items-center"><Send size={22} aria-hidden="true" /></button>
        <span className="flex-1" />
        {onSave && (
          <button type="button" onClick={onSave} aria-pressed={Boolean(saved)} aria-label={saved ? 'Saved. Save to another collection' : 'Save to collection'}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-red pl-2.5 pr-3.5 text-[13px] font-bold text-white">
            <PinIcon size={16} />{saved ? 'Saved' : 'Save'}
          </button>
        )}
      </div>
      <p className="text-[14px] font-bold">{likes === 1 ? '1 like' : `${likes.toLocaleString()} likes`}</p>
      {post.likedBy && (
        <p className="mt-0.5 text-[12px] text-subtle">Liked by <b className="text-ink">{post.likedBy.handle}</b>{likes > 1 ? ' and others' : ''}</p>
      )}
      <p className="mt-0.5 text-[11px] uppercase tracking-[.04em] text-subtle"><time dateTime={String(post.createdAt)}>{date}</time></p>
    </div>
  );
}

function CommentRow({ comment, postId, cacheKey, onReply }: { comment: Comment | CommentReply; postId: number; cacheKey: readonly unknown[]; onReply?: () => void }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = comment.id < 0;
  const patch = (fn: (c: CommentReply) => CommentReply) => client.setQueryData<Pages>(cacheKey, data => data && {
    ...data,
    pages: data.pages.map(pg => ({ ...pg, items: pg.items.map(c => ({ ...(c.id === comment.id ? fn(c) as Comment : c), replies: c.replies.map(r => (r.id === comment.id ? fn(r) : r)) })) })),
  });
  const toggleLike = async () => {
    if (pending || busy || !ask({ title: 'Sign in to like comments', body: "You'll come straight back to this post." })) return;
    const next = !comment.likedByMe;
    const before = { likedByMe: comment.likedByMe, likeCount: comment.likeCount };
    patch(c => ({ ...c, likedByMe: next, likeCount: c.likeCount + (next ? 1 : -1) }));
    setBusy(true);
    try {
      const state = await (next ? likeComment(comment.id) : unlikeComment(comment.id));
      patch(c => ({ ...c, likedByMe: state.liked, likeCount: state.likeCount }));
    } catch (err) {
      patch(c => ({ ...c, ...before }));
      toast({ title: 'That didn’t work', description: failText(err, 'Try again.') });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteComment(comment.id);
      void client.invalidateQueries({ queryKey: cacheKey });
      void client.invalidateQueries({ queryKey: getGetPublicPostQueryKey(postId) });
    } catch (err) {
      toast({ title: 'Not deleted', description: failText(err, 'Try again.') });
      setBusy(false);
    }
  };
  const likes = comment.likeCount;
  return (
    <div className={`flex items-start gap-2.5 ${pending ? 'opacity-60' : ''}`}>
      <Link href={`/@${comment.author.handle}`} aria-hidden="true" tabIndex={-1} className="shrink-0"><UserAvatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} size={32} /></Link>
      <div className="min-w-0 flex-1 text-[14px] leading-[1.45]">
        <p className="whitespace-pre-line break-words"><Link href={`/@${comment.author.handle}`} className="mr-1.5 font-bold text-ink no-underline">{comment.author.handle}</Link>{comment.body}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] font-semibold text-subtle">
          {pending ? <span>Posting…</span> : <time dateTime={String(comment.createdAt)}>{timeAgo(comment.createdAt)}</time>}
          {likes > 0 && <span>{likes === 1 ? '1 like' : `${likes} likes`}</span>}
          {onReply && !pending && <button type="button" onClick={onReply} className="min-h-8">Reply</button>}
          {comment.canDelete && !confirm && <button type="button" onClick={() => setConfirm(true)} className="min-h-8">Delete</button>}
          {confirm && (
            <span className="inline-flex min-h-8 items-center gap-2">
              Delete{onReply ? ' with its replies' : ''}?
              <button type="button" onClick={() => void remove()} disabled={busy} className="font-bold text-red-ink">Delete</button>
              <button type="button" onClick={() => setConfirm(false)} className="font-bold text-ink">Keep</button>
            </span>
          )}
        </div>
      </div>
      <button type="button" onClick={() => void toggleLike()} aria-pressed={comment.likedByMe} aria-label={`Like comment by @${comment.author.handle}`} disabled={pending}
        className="grid h-8 w-8 shrink-0 place-items-center">
        <Heart size={13} aria-hidden="true" className={comment.likedByMe ? 'fill-red text-red' : 'text-subtle'} />
      </button>
    </div>
  );
}
