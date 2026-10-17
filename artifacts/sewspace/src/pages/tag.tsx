import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getTagPosts } from '@workspace/api-client-react';
import { Hash, Loader2 } from 'lucide-react';
import { ErrorState } from '@/components/common';
import { shortCount } from '@/lib/hashtags';
import NotFound from '@/pages/not-found';
import { PostTile } from '@/pages/explore';

/**
 * A hashtag: public posts that use it, newest first. Works signed out.
 * (Following a hashtag and the full design come in a later phase.)
 */
export function TagPage({ tag }: { tag: string }) {
  const clean = tag.replace(/^#/, '').toLowerCase();
  useEffect(() => { document.title = `#${clean} · Seams Club`; }, [clean]);
  const feed = useInfiniteQuery({
    queryKey: ['/api/public/tags', clean],
    queryFn: ({ pageParam }) => getTagPosts(clean, pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    retry: false,
  });
  if (feed.isError && (feed.error as { status?: number })?.status === 404) return <NotFound embedded />;
  const first = feed.data?.pages[0];
  const posts = feed.data?.pages.flatMap(p => p.items) ?? [];
  return (
    <div className="mx-auto max-w-[1232px]">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-yellow" aria-hidden="true"><Hash size={30} /></span>
        <div className="min-w-0">
          <p className="eyebrow">Hashtag</p>
          <h1 className="truncate font-display text-[34px] leading-tight tracking-[-.05em]">#{clean}</h1>
          {first && <p className="text-sm text-subtle">{shortCount(first.posts)} public post{first.posts === 1 ? '' : 's'}</p>}
        </div>
      </div>
      <div className="mt-5">
        {feed.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
          : feed.isError ? <ErrorState retry={() => feed.refetch()} />
          : posts.length === 0 ? <div className="rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle">No public posts use #{clean} yet.</div>
          : <div className="columns-2 gap-2.5 sm:columns-3 lg:columns-4">{posts.map(post => <PostTile key={post.id} post={post} />)}</div>}
        {feed.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="btn btn-line">
              {feed.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
