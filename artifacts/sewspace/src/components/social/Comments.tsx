import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetPostCommentsQueryKey,
  getGetPublicPostQueryKey,
  useCreateComment,
  useDeleteComment,
  useGetPostComments,
  useGetProfile,
  type Comment,
  type CommentReply,
} from '@workspace/api-client-react';
import { Loader2, Trash2, X } from 'lucide-react';
import { Link } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { UserAvatar } from '@/components/avatar';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { timeAgo } from '@/lib/time';

const MAX = 1000;

function errorText(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error ?? fallback;
}

function CommentRow({ comment, myHandle, onReply, isReply }: {
  comment: Comment | CommentReply;
  myHandle: string | null;
  onReply?: () => void;
  isReply?: boolean;
}) {
  const client = useQueryClient();
  const remove = useDeleteComment();
  const [confirm, setConfirm] = useState(false);
  const mine = myHandle !== null && comment.author.handle === myHandle;
  const refresh = () => {
    client.invalidateQueries({ queryKey: getGetPostCommentsQueryKey(comment.postId) });
    client.invalidateQueries({ queryKey: getGetPublicPostQueryKey(comment.postId) });
    client.invalidateQueries({ queryKey: FEED_KEYS.all });
  };
  return (
    <div id={`comment-${comment.id}`} className="flex scroll-mt-28 gap-2.5">
      <Link href={`/@${comment.author.handle}`} aria-hidden="true" tabIndex={-1} className="shrink-0">
        <UserAvatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} size={isReply ? 28 : 34} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">
          <Link href={`/@${comment.author.handle}`} className="mr-1.5 font-bold text-ink no-underline">{comment.author.handle}</Link>{comment.body}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-subtle">
          <time dateTime={String(comment.createdAt)}>{timeAgo(comment.createdAt)}</time>
          {onReply && <button type="button" onClick={onReply} className="min-h-[36px] font-bold text-subtle">Reply</button>}
          {comment.canDelete && !confirm && (
            <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-[36px] items-center gap-1 font-bold text-subtle"><Trash2 size={13} aria-hidden="true" />Delete</button>
          )}
          {confirm && (
            <span className="inline-flex min-h-[36px] items-center gap-2">
              <span>Delete{isReply ? '' : ' with its replies'}?</span>
              <button type="button" disabled={remove.isPending} onClick={() => remove.mutate({ id: comment.id }, { onSuccess: refresh })} className="font-bold text-red-ink">
                {remove.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Delete'}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="font-bold">Keep</button>
            </span>
          )}
        </div>
      </div>
      {!mine && (
        <SafetyMenu kind="comment" targetId={String(comment.id)} what="comment" authorHandle={comment.author.handle} label={`Options for comment by @${comment.author.handle}`} size={36} />
      )}
    </div>
  );
}

export interface CommentsHandle { focus: () => void }

/** Comments on a post, oldest first, with one level of replies and a composer. */
export const Comments = forwardRef<CommentsHandle, { postId: number }>(function Comments({ postId }, ref) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const me = useGetProfile({ query: { enabled: Boolean(isSignedIn) } });
  const comments = useGetPostComments(postId);
  const create = useCreateComment();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; handle: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const myHandle = me.data?.handle ?? null;

  const focus = () => {
    if (!ask({ title: 'Sign in to comment', body: "Join the conversation. You'll come straight back to this post." })) return;
    input.current?.focus();
  };
  useImperativeHandle(ref, () => ({ focus }));
  // Arriving from a "comments" link: bring the list into view.
  useEffect(() => {
    if (window.location.hash === '#comments' || window.location.hash.startsWith('#comment-')) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
    }
  }, [comments.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask({ title: 'Sign in to comment' })) return;
    const text = body.trim();
    if (!text) return;
    create.mutate({ id: postId, data: { body: text, parentId: replyTo?.id ?? null } }, {
      onSuccess: () => {
        setBody('');
        setReplyTo(null);
        client.invalidateQueries({ queryKey: getGetPostCommentsQueryKey(postId) });
        client.invalidateQueries({ queryKey: getGetPublicPostQueryKey(postId) });
        client.invalidateQueries({ queryKey: FEED_KEYS.all });
      },
    });
  };

  const list = comments.data ?? [];
  return (
    <section id="comments" aria-label="Comments" className="mt-4 scroll-mt-28 rounded-[30px] bg-white p-[18px]">
      <h2 className="eyebrow">Comments{list.length ? ` · ${list.reduce((n, c) => n + 1 + c.replies.length, 0)}` : ''}</h2>
      {comments.isLoading
        ? <div className="grid place-items-center py-8" role="status" aria-label="Loading comments"><Loader2 className="animate-spin" /></div>
        : list.length === 0
          ? <p className="py-4 text-sm text-subtle">No comments yet. Say something kind or ask a question.</p>
          : (
            <ul className="mt-3 space-y-4">
              {list.map(c => (
                <li key={c.id}>
                  <CommentRow comment={c} myHandle={myHandle}
                    onReply={() => { setReplyTo({ id: c.id, handle: c.author.handle }); focus(); }} />
                  {c.replies.length > 0 && (
                    <ul className="ml-11 mt-3 space-y-3">
                      {c.replies.map(r => <li key={r.id}><CommentRow comment={r} myHandle={myHandle} isReply /></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

      <form onSubmit={submit} className="mt-4 border-t border-line pt-4">
        {replyTo && (
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-subtle">
            Replying to @{replyTo.handle}
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="grid h-8 w-8 place-items-center rounded-full hover:bg-canvas"><X size={14} /></button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`comment-input-${postId}`}>Add a comment</label>
          <textarea id={`comment-input-${postId}`} ref={input} value={body} rows={1}
            onFocus={() => { if (!isSignedIn) { input.current?.blur(); focus(); } }}
            onChange={e => setBody(e.target.value.slice(0, MAX))}
            placeholder={replyTo ? `Reply to @${replyTo.handle}` : 'Add a comment…'}
            className="field min-h-[48px] flex-1 resize-none py-3" />
          <button type="submit" disabled={!body.trim() || create.isPending} className="btn btn-primary min-h-[48px] disabled:opacity-50">
            {create.isPending && <Loader2 size={15} className="animate-spin" />}Post
          </button>
        </div>
        {create.isError && <p role="alert" className="mt-2 text-sm font-semibold text-red-ink">{errorText(create.error, "That didn't post. Try again.")}</p>}
      </form>
    </section>
  );
});
