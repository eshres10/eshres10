import { useInfiniteQuery } from '@tanstack/react-query';
import type { FeedPage } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/common';
import { PostCard } from '@/components/feed/PostCard';

/** Paged list of posts with a "Load more" button. */
export function FeedList({ queryKey, fetchPage, empty }: {
  queryKey: readonly unknown[];
  fetchPage: (cursor: string | undefined) => Promise<FeedPage>;
  empty: ReactNode;
}) {
  const feed = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  if (feed.isLoading) return <div className="grid place-items-center py-16" role="status" aria-label="Loading posts"><Loader2 className="animate-spin" /></div>;
  if (feed.isError) return <ErrorState retry={() => feed.refetch()} />;
  const posts = feed.data?.pages.flatMap(page => page.items) ?? [];
  if (!posts.length) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-4">
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      {feed.hasNextPage && (
        <button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="btn btn-line mx-auto">
          {feed.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
        </button>
      )}
    </div>
  );
}
