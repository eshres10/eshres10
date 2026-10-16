import { useEffect, useRef } from 'react';
import { useGetPublicPost } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
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
    if (p) document.title = p.caption ? `${p.author.name} on SewSpace: “${p.caption.slice(0, 60)}”` : `@${p.author.handle} on SewSpace`;
  }, [post.data]);
  if (post.isLoading) return <Loading />;
  if (!post.data) return <NotFound embedded />;
  return (
    <div className="mx-auto max-w-[620px]">
      <PostCard post={post.data} full onDeleted={() => setLocation('/feed')} onComment={() => comments.current?.focus()} />
      <Comments ref={comments} postId={post.data.id} />
    </div>
  );
}
