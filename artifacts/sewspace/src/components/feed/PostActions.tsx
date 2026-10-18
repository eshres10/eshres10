import { useEffect, useState } from 'react';
import { likePost, savePost, unlikePost, unsavePost, type FeedPost } from '@workspace/api-client-react';
import { Bookmark, Check, Heart, MessageCircle, Send } from 'lucide-react';
import { Link } from 'wouter';
import { CommentsSheet } from '@/components/post-view/PostView';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';

/** The full link to a post, for sharing. */
export function postUrl(id: number): string {
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/posts/${id}`;
}

/** Share sheet where the device has one, otherwise copy the link. Returns true when copied. */
export async function shareLink(url: string, title: string): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return false;
    }
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false; // Share sheet dismissed, or clipboard refused.
  }
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Like, comment, share and save. Likes and saves update straight away and
 * roll back if the server says no. Signed-out visitors get the sign-in sheet.
 */
export function PostActions({ post, onComment }: { post: FeedPost; onComment?: () => void }) {
  const ask = useRequireSignIn();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.savedByMe);
  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState(false);
  // Phones open the comments from the bottom of the screen (like Instagram); wider screens go to the post page.
  const openComments = (e: React.MouseEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setComments(true);
  };
  useEffect(() => { setLiked(post.likedByMe); setLikes(post.likeCount); setSaved(post.savedByMe); }, [post.likedByMe, post.likeCount, post.savedByMe]);

  const toggleLike = async () => {
    if (!ask({ title: 'Sign in to like this post', body: "It's free. You'll come straight back to this post." })) return;
    const next = !liked;
    setLiked(next);
    setLikes(n => n + (next ? 1 : -1));
    try {
      const state = next ? await likePost(post.id) : await unlikePost(post.id);
      setLikes(state.likeCount);
    } catch {
      setLiked(!next);
      setLikes(n => n + (next ? -1 : 1));
    }
  };
  const toggleSave = async () => {
    if (!ask({ title: 'Sign in to save this post', body: 'Saved posts wait for you under Saved.' })) return;
    const next = !saved;
    setSaved(next);
    try {
      await (next ? savePost(post.id) : unsavePost(post.id));
    } catch {
      setSaved(!next);
    }
  };
  const share = async () => {
    if (await shareLink(postUrl(post.id), `@${post.author.handle} on Seams Club`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const iconButton = 'grid h-11 w-11 place-items-center rounded-full hover:bg-canvas';
  return (
    <div className="flex items-center gap-0.5 px-2.5 pb-1 pt-1.5">
      <button type="button" onClick={toggleLike} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'} className={iconButton}>
        <Heart size={24} aria-hidden="true" className={liked ? 'fill-red text-red' : ''} />
      </button>
      {onComment
        ? <button type="button" onClick={onComment} aria-label="Comment" className={iconButton}><MessageCircle size={24} aria-hidden="true" /></button>
        : <Link href={`/posts/${post.id}#comments`} onClick={openComments} aria-label={`Comments (${post.commentCount})`} className={`${iconButton} text-ink`}><MessageCircle size={24} aria-hidden="true" /></Link>}
      <button type="button" onClick={share} aria-label={copied ? 'Link copied' : 'Share'} className={iconButton}>
        {copied ? <Check size={22} aria-hidden="true" /> : <Send size={22} aria-hidden="true" />}
      </button>
      <span className="min-w-0 flex-1 truncate px-1.5 text-sm" aria-live="polite">
        {likes > 0 && <b>{plural(likes, 'like')}</b>}
        {likes > 0 && post.commentCount > 0 && <span className="text-subtle"> · </span>}
        {post.commentCount > 0 && (
          <Link href={`/posts/${post.id}#comments`} onClick={openComments} className="text-subtle no-underline hover:underline">{plural(post.commentCount, 'comment')}</Link>
        )}
        {copied && <span className="ml-1 font-semibold text-blue-ink">Link copied</span>}
      </span>
      <button type="button" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save'} className={iconButton}>
        <Bookmark size={23} aria-hidden="true" className={saved ? 'fill-ink' : ''} />
      </button>
      {comments && <CommentsSheet post={post} onClose={() => setComments(false)} />}
    </div>
  );
}
