import { useEffect, useState } from 'react';
import { useGetPublicPost } from '@workspace/api-client-react';
import { Loading } from '@/components/common';
import { PostFlow } from '@/components/post-flow/PostFlow';
import NotFound from '@/pages/not-found';

/** /new (keeps ?type=status, ?make=, ?challenge=). */
export function NewPostPage() {
  const [run, setRun] = useState(0);
  useEffect(() => { document.title = 'New post · Seams Club'; }, []);
  return <PostFlow key={run} onRestart={() => setRun(r => r + 1)} />;
}

/** /posts/:id/edit: the same flow, opening at Details. Only the author can edit. */
export function EditPostPage({ id }: { id: number }) {
  const post = useGetPublicPost(id, { query: { retry: false, enabled: Number.isFinite(id), staleTime: Infinity } });
  useEffect(() => { document.title = 'Edit post · Seams Club'; }, []);
  if (post.isLoading) return <Loading />;
  if (!post.data?.isOwner) return <NotFound embedded />;
  return <PostFlow editing={post.data} />;
}
