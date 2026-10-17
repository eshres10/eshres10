import { useEffect, useRef } from 'react';
import { useGetPublicPost } from '@workspace/api-client-react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Loading } from '@/components/common';
import { PostCard } from '@/components/feed/PostCard';
import { Comments, type CommentsHandle } from '@/components/social/Comments';
import NotFound from '@/pages/not-found';

/** One post at /posts/:id, with its comments. Works signed out for public posts. */
export function PostPage({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const comments = useRef<CommentsHandle>(null);
  const post = useGetPublicPost(id, { query: { retry: false, enabled: Number.isFinite(id) } });
  useEffect(() => {
    const p = post.data;
    if (p) document.title = p.caption ? `${p.author.name} on Seams Club: “${p.caption.slice(0, 60)}”` : `@${p.author.handle} on Seams Club`;
  }, [post.data]);
  if (post.isLoading) return <Loading />;
  if (!post.data) return <NotFound embedded />;
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[620px] flex-col md:block md:h-auto">
      <header className="sticky top-0 z-30 -mx-3 flex h-[58px] shrink-0 items-center gap-3 bg-canvas px-3 md:hidden">
        <Link href="/feed" aria-label="Back to feed" className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink no-underline"><ArrowLeft size={20} aria-hidden="true" /></Link>
        <h1 className="flex-1 font-display text-[19px] tracking-[-.035em]">Comments</h1>
      </header>
      <PostCard post={post.data} full mobileCompact onDeleted={() => setLocation('/feed')} onComment={() => comments.current?.focus()} />
      <div className="min-h-0 flex-1">
        <Comments ref={comments} postId={post.data.id} />
      </div>
    </div>
  );
}
