import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetPublicPostQueryKey, useDeletePost, type FeedPost } from '@workspace/api-client-react';
import { BookOpen, ChevronLeft, ChevronRight, Layers, Loader2, MessagesSquare, MoreHorizontal, Pencil, Scissors, Trash2, Trophy, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { VisibilityBadge } from '@/components/visibility';
import { CaptionText } from '@/components/feed/CaptionText';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { PostActions } from '@/components/feed/PostActions';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { Sheet, SheetButton } from '@/components/social/Sheet';
import { aspectRatio } from '@/lib/hashtags';
import { timeAgo } from '@/lib/time';

const TAG_ICON = { make: Scissors, pattern: BookOpen, fabric: Layers } as const;
const TAG_LABEL = { make: 'Make', pattern: 'Pattern', fabric: 'Fabric' } as const;

function Photos({ post }: { post: FeedPost }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The shape chosen when posting (4:5, 1:1, or the first photo's own, kept
  // between 4:5 and 1.91:1). Photos are cropped with object-fit, never re-cut.
  const ratio = aspectRatio(post.aspect, post.media[0]);
  const go = (next: number) => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="relative bg-line" style={{ aspectRatio: String(ratio) }}>
      <div ref={strip} onScroll={e => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {post.media.map((m, i) => (
          <img key={m.id} src={m.url} alt={m.altText || (i === 0 && post.caption ? post.caption.slice(0, 120) : '')} width={m.width} height={m.height}
            loading={i === 0 ? 'eager' : 'lazy'} decoding="async" style={{ backgroundColor: m.color ?? undefined }}
            className="h-full w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {post.media.length > 1 && <>
        <span className="absolute right-3.5 top-3.5 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-semibold text-white">{index + 1}/{post.media.length}</span>
        <span className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
          {post.media.map((m, i) => <span key={m.id} className={`h-2 w-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`} />)}
        </span>
        {index > 0 && <button type="button" onClick={() => go(index - 1)} aria-label="Previous photo" className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 md:grid"><ChevronLeft size={20} /></button>}
        {index < post.media.length - 1 && <button type="button" onClick={() => go(index + 1)} aria-label="Next photo" className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 md:grid"><ChevronRight size={20} /></button>}
      </>}
    </div>
  );
}

function Caption({ post, full }: { post: FeedPost; full: boolean }) {
  const [open, setOpen] = useState(full);
  const long = post.caption.length > 220;
  const text = open || !long ? post.caption : `${post.caption.slice(0, 200).trimEnd()}…`;
  if (!post.caption) return null;
  return (
    <p className="mt-1.5 whitespace-pre-line break-words text-[15px] leading-relaxed">
      <Link href={`/@${post.author.handle}`} className="mr-1.5 font-bold text-ink no-underline">{post.author.handle}</Link><CaptionText text={text} />
      {long && !open && <button type="button" onClick={() => setOpen(true)} className="ml-1 font-semibold text-subtle">more</button>}
    </p>
  );
}

function OwnerMenu({ post, onDeleted }: { post: FeedPost; onDeleted?: () => void }) {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeletePost();
  const close = () => { setOpen(false); setConfirmDelete(false); };
  const refresh = () => {
    client.invalidateQueries({ queryKey: FEED_KEYS.all });
    client.invalidateQueries({ queryKey: getGetPublicPostQueryKey(post.id) });
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Post options" className="grid h-11 w-11 place-items-center rounded-full hover:bg-canvas"><MoreHorizontal size={20} /></button>
      {open && (
        <Sheet label="Post options" onClose={close}>
          {confirmDelete ? (
            <div className="space-y-4">
              <h2 className="font-display text-2xl">Delete this post?</h2>
              <p className="text-sm text-subtle">It disappears for everyone. Your photos and makes in the studio aren't affected.</p>
              {remove.isError && <p role="alert" className="text-sm font-semibold text-red-ink">That didn't delete. Try again.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-line flex-1">Keep it</button>
                <button type="button" disabled={remove.isPending} onClick={() => remove.mutate({ id: post.id }, { onSuccess: () => { refresh(); close(); onDeleted?.(); } })} className="btn flex-1 bg-red text-white">{remove.isPending && <Loader2 size={15} className="animate-spin" />}Delete</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <SheetButton icon={Pencil} onClick={() => { close(); setLocation(`/posts/${post.id}/edit`); }}>Edit post</SheetButton>
              <SheetButton icon={Trash2} danger onClick={() => setConfirmDelete(true)}>Delete post</SheetButton>
              <SheetButton icon={X} onClick={close}>Cancel</SheetButton>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/** A post in a feed or on its own page. */
export function PostCard({ post, full = false, onDeleted, onComment }: { post: FeedPost; full?: boolean; onDeleted?: () => void; onComment?: () => void }) {
  return (
    <article className="overflow-hidden rounded-[30px] bg-white" aria-labelledby={`post-${post.id}-author`}>
      <header className="flex items-center gap-3 px-[18px] py-3.5">
        <Link href={`/@${post.author.handle}`} aria-hidden="true" tabIndex={-1}><UserAvatar name={post.author.name} avatarUrl={post.author.avatarUrl} size={42} /></Link>
        <div className="min-w-0 flex-1">
          <Link id={`post-${post.id}-author`} href={`/@${post.author.handle}`} className="block truncate text-[15px] font-bold text-ink no-underline">{post.author.handle}</Link>
          <div className="flex items-center gap-1.5 text-[13px] text-subtle">
            <Link href={`/posts/${post.id}`} className="text-subtle no-underline hover:underline"><time dateTime={String(post.createdAt)}>{timeAgo(post.createdAt)}</time></Link>
            {post.visibility !== 'public' && <><span aria-hidden="true">·</span><VisibilityBadge value={post.visibility} /></>}
          </div>
        </div>
        {post.isOwner
          ? <OwnerMenu post={post} onDeleted={onDeleted} />
          : <SafetyMenu kind="post" targetId={String(post.id)} what="post" authorHandle={post.author.handle} label="Post options" />}
      </header>
      {post.kind === 'photo' && post.media.length > 0 && <><Photos post={post} /><PostActions post={post} onComment={onComment} /></>}
      <div className={post.kind === 'status' ? 'px-[18px] pb-2' : 'px-[18px] pb-[18px] pt-1'}>
        {post.kind === 'status'
          ? <p className={`whitespace-pre-line break-words ${post.caption.length < 140 ? 'font-display text-[22px] leading-snug tracking-[-.03em]' : 'text-[15px] leading-relaxed'}`}><CaptionText text={post.caption} /></p>
          : <Caption post={post} full={full} />}
        {post.forumTopic && (
          <Link href={`/forum/topics/${post.forumTopic.id}`} className="mt-3 flex min-h-[44px] items-center gap-2 rounded-[18px] bg-canvas px-3 py-2 text-sm text-ink no-underline hover:bg-line">
            <MessagesSquare size={16} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1"><span className="font-bold">Discussed in the forum</span><span className="text-subtle"> · {post.forumTopic.replies ? `${post.forumTopic.replies} ${post.forumTopic.replies === 1 ? 'reply' : 'replies'}` : 'join the thread'}</span></span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
          </Link>
        )}
        {post.challenges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.challenges.map(c => (
              <Link key={c.slug} href={`/challenges/${c.slug}`} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-yellow px-3 text-xs font-bold text-ink no-underline">
                <Trophy size={13} aria-hidden="true" />#{c.tag}
              </Link>
            ))}
          </div>
        )}
        {post.tags.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {post.tags.map(tag => {
              const Icon = TAG_ICON[tag.kind];
              const body = <><Icon size={16} aria-hidden="true" /><span className="min-w-0"><span className="block text-[11px] font-bold uppercase tracking-[.14em] text-red-ink">{TAG_LABEL[tag.kind]}</span><span className="block truncate text-sm font-bold">{tag.name}</span></span></>;
              return tag.kind === 'make'
                ? <Link key={`${tag.kind}-${tag.id}`} href={`/makes/${tag.id}`} className="flex max-w-full items-center gap-2.5 rounded-[22px] bg-canvas px-3 py-2 text-ink no-underline hover:bg-line">{body}</Link>
                : <span key={`${tag.kind}-${tag.id}`} className="flex max-w-full items-center gap-2.5 rounded-[22px] bg-canvas px-3 py-2">{body}</span>;
            })}
          </div>
        )}
      </div>
      {post.kind === 'status' && <div className="pb-2"><PostActions post={post} onComment={onComment} /></div>}
    </article>
  );
}
