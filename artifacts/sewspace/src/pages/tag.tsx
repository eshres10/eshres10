import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getTagPosts, useListForumTopics, useSearchTags, type FeedPost } from '@workspace/api-client-react';
import { Hash, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { ErrorState } from '@/components/common';
import { CaptionText } from '@/components/feed/CaptionText';
import { KINDS } from '@/components/forum/parts';
import { shortCount } from '@/lib/hashtags';
import NotFound from '@/pages/not-found';

/** A post as a square tile: its first photo, or the caption on white. */
function SquareTile({ post }: { post: FeedPost }) {
  const cover = post.media[0];
  return (
    <Link href={`/posts/${post.id}`} aria-label={`Post by @${post.author.handle}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`}
      className="relative block aspect-square overflow-hidden rounded-[18px] bg-white text-ink no-underline hover:outline hover:outline-2 hover:outline-ink"
      style={cover?.color ? { backgroundColor: cover.color } : undefined}>
      {cover
        ? <img src={cover.thumbUrl} alt={cover.altText || ''} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        : <span className="absolute inset-0 flex items-center p-[clamp(12px,2.4vw,22px)] font-display text-[clamp(14px,1.9vw,19px)] font-semibold leading-[1.3] tracking-[-.03em]"><span className="line-clamp-5"><CaptionText text={post.caption} linked={false} /></span></span>}
      {post.media.length > 1 && <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">1/{post.media.length}</span>}
    </Link>
  );
}

/** Forum topics carrying the same tag. */
function ForumTopicsTagged({ tag }: { tag: string }) {
  const topics = useListForumTopics({ tag, sort: 'hot' });
  const items = (topics.data?.items ?? []).slice(0, 4);
  if (!items.length) return null;
  return (
    <section aria-labelledby="tag-topics" className="rounded-[30px] bg-white p-5 sm:p-6">
      <h2 id="tag-topics" className="font-display text-[22px] leading-tight tracking-[-.04em]">Forum topics tagged #{tag}</h2>
      <ul className="mt-2 divide-y divide-line">
        {items.map(t => (
          <li key={t.id} className="py-3">
            <Link href={`/forum/topics/${t.id}`} className="block text-[15px] font-semibold text-ink no-underline hover:underline">{t.title}</Link>
            <p className="mt-0.5 text-xs text-subtle">{[KINDS[t.kind].label, t.solved && 'solved', t.pinned && 'pinned', `${t.replies} ${t.replies === 1 ? 'reply' : 'replies'}`].filter(Boolean).join(' · ')}</p>
          </li>
        ))}
      </ul>
      {(topics.data?.items.length ?? 0) > 4 && <Link href={`/forum?tag=${encodeURIComponent(tag)}`} className="mt-1 inline-block text-sm font-semibold text-ink underline underline-offset-4">All forum topics</Link>}
    </section>
  );
}

/** A hashtag: public posts that use it, newest first, with related tags and forum topics. Works signed out. */
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
  // Longer tags starting with this one (#linen → #linenskirt), busiest first.
  const related = useSearchTags({ q: clean }, { query: { enabled: clean.length >= 2 } });
  if (feed.isError && (feed.error as { status?: number })?.status === 404) return <NotFound embedded />;
  const first = feed.data?.pages[0];
  const posts = feed.data?.pages.flatMap(p => p.items) ?? [];
  const cover = posts.find(p => p.media.length)?.media[0];
  const others = (related.data ?? []).filter(t => t.tag !== clean).slice(0, 8);
  return (
    <div className="mx-auto max-w-[1232px]">
      <header className="flex items-center gap-5 sm:gap-7">
        {cover
          ? <img src={cover.thumbUrl} alt="" className="h-[84px] w-[84px] shrink-0 rounded-full border-4 border-white object-cover sm:h-[130px] sm:w-[130px]" style={{ backgroundColor: cover.color ?? undefined }} />
          : <span aria-hidden="true" className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full border-4 border-white bg-yellow sm:h-[130px] sm:w-[130px]"><Hash size={40} /></span>}
        <div className="min-w-0">
          <h1 className="truncate font-display text-[clamp(40px,6vw,76px)] leading-none tracking-[-.06em]">#{clean}</h1>
          {first && <p className="mt-2 text-[17px]"><b>{shortCount(first.posts)}</b> public post{first.posts === 1 ? '' : 's'}</p>}
        </div>
      </header>

      {others.length > 0 && (
        <nav aria-label="Related hashtags" className="-mx-3 mt-6 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <span className="shrink-0 text-sm font-semibold text-subtle">Related</span>
          {others.map(t => <Link key={t.tag} href={`/tags/${t.tag}`} className="inline-flex min-h-[40px] shrink-0 items-center rounded-full bg-white px-4 text-sm font-bold text-ink no-underline hover:bg-yellow">#{t.tag}</Link>)}
        </nav>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div>
          {feed.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
            : feed.isError ? <ErrorState retry={() => feed.refetch()} />
            : posts.length === 0 ? <div className="rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle">No public posts use #{clean} yet.</div>
            : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{posts.map(post => <SquareTile key={post.id} post={post} />)}</div>}
          {feed.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="btn btn-line">
                {feed.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
              </button>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <ForumTopicsTagged tag={clean} />
          <section aria-labelledby="how-tags" className="rounded-[30px] bg-ink p-6 text-white">
            <h2 id="how-tags" className="font-display text-[22px] tracking-[-.04em]">How hashtags work</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-snug">
              <li>Type # in any caption.</li>
              <li>Every tag is tappable and has its own page like this one.</li>
              <li>Only public posts appear here.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
