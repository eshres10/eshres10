import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getExploreFeed, type FeedPost } from '@workspace/api-client-react';
import { Loader2, Images } from 'lucide-react';
import { Link } from 'wouter';
import { ErrorState } from '@/components/common';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { CaptionText } from '@/components/feed/CaptionText';

const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'photo', label: 'Photos' },
  { id: 'make', label: 'Makes' },
  { id: 'status', label: 'Words' },
] as const;
type Kind = (typeof KINDS)[number]['id'];
const SORTS = [
  { id: 'recent', label: 'Newest' },
  { id: 'popular', label: 'Popular' },
] as const;
type Sort = (typeof SORTS)[number]['id'];

/** A post as a grid tile (Explore, hashtag pages). */
export function PostTile({ post }: { post: FeedPost }) {
  const cover = post.media[0];
  if (!cover) {
    return (
      <Link href={`/posts/${post.id}`} className="mb-2.5 block break-inside-avoid rounded-[22px] bg-white p-5 text-ink no-underline hover:bg-yellow">
        <p className="line-clamp-6 font-display text-lg leading-snug tracking-[-.03em]"><CaptionText text={post.caption} linked={false} /></p>
        <p className="mt-3 text-xs font-semibold text-subtle">@{post.author.handle}</p>
      </Link>
    );
  }
  return (
    <Link href={`/posts/${post.id}`} aria-label={`Post by @${post.author.handle}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`}
      className="relative mb-2.5 block break-inside-avoid overflow-hidden rounded-[22px] bg-line">
      <img src={cover.thumbUrl} alt="" width={cover.width} height={cover.height} loading="lazy" decoding="async"
        style={{ aspectRatio: `${cover.width} / ${cover.height}`, backgroundColor: cover.color ?? undefined }} className="block w-full object-cover" />
      {post.media.length > 1 && <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white"><Images size={12} aria-hidden="true" />{post.media.length}</span>}
      {post.tags.some(t => t.kind === 'make') && <span className="absolute left-2.5 top-2.5 rounded-full bg-yellow px-2 py-0.5 text-[11px] font-bold text-ink">Make</span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent px-3 pb-2.5 pt-8 text-xs font-semibold text-white">@{post.author.handle}</span>
    </Link>
  );
}

/** Explore: everyone's public posts as a photo grid. Works signed out. */
export function ExplorePage() {
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('recent');
  useEffect(() => { document.title = 'Explore · Seams Club'; }, []);
  const feed = useInfiniteQuery({
    queryKey: FEED_KEYS.explore(kind, sort),
    queryFn: ({ pageParam }) => getExploreFeed({ kind, sort, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  const posts = feed.data?.pages.flatMap(page => page.items) ?? [];
  return (
    <div className="mx-auto max-w-[1232px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Explore</p>
          <h1 className="mt-1 font-display text-[34px] leading-tight tracking-[-.05em]">Fresh from sewing tables</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
        <div className="flex gap-1 rounded-full bg-white p-1" role="group" aria-label="Order">
          {SORTS.map(o => (
            <button key={o.id} type="button" aria-pressed={sort === o.id} onClick={() => setSort(o.id)}
              className={`min-h-[40px] rounded-full px-4 text-sm font-bold ${sort === o.id ? 'bg-yellow text-ink' : 'text-ink'}`}>{o.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {KINDS.map(k => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${kind === k.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>{k.label}</button>
          ))}
        </div>
        </div>
      </div>
      {sort === 'popular' && <p className="mt-3 text-sm text-subtle">Most liked in the last two weeks.</p>}
      <div className="mt-5">
        {feed.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
          : feed.isError ? <ErrorState retry={() => feed.refetch()} />
          : posts.length === 0 ? <div className="rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle">Nothing here yet.</div>
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
