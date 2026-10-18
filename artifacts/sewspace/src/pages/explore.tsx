import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getExploreFeed, useListCatalog, useListChallenges, type FeedPost } from '@workspace/api-client-react';
import { Heart, Images, Loader2, Search, Star, Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { challengeMeta } from '@/components/challenges/parts';
import { authHref } from '@/lib/navigation';
import { ErrorState } from '@/components/common';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { CaptionText } from '@/components/feed/CaptionText';
import { CommunityTabs } from '@/components/shell/CommunityTabs';

const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'photo', label: 'Photos' },
  { id: 'make', label: 'Makes' },
  { id: 'status', label: 'Words' },
] as const;
type Kind = (typeof KINDS)[number]['id'];
const SORTS = [
  { id: 'recent', label: 'Recent' },
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

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** A post as an Explore card: photo, caption, author and likes (the website design). */
function ExploreCard({ post }: { post: FeedPost }) {
  const cover = post.media[0];
  const challenge = post.challenges[0];
  const label = `Post by @${post.author.handle}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`;
  return (
    <Link href={`/posts/${post.id}`} aria-label={label}
      className="mb-3.5 block break-inside-avoid overflow-hidden rounded-[22px] bg-white text-ink no-underline hover:outline hover:outline-2 hover:outline-ink">
      {cover && (
        <span className="relative block bg-line">
          <img src={cover.thumbUrl} alt={cover.altText || ''} width={cover.width} height={cover.height} loading="lazy" decoding="async"
            style={{ aspectRatio: `${cover.width} / ${cover.height}`, backgroundColor: cover.color ?? undefined }} className="block max-h-[520px] w-full object-cover" />
          {challenge ? <span className="absolute left-2.5 top-2.5 max-w-[70%] truncate rounded-full bg-yellow px-2 py-0.5 text-[11px] font-bold">#{challenge.tag}</span>
            : post.tags.some(t => t.kind === 'make') && <span className="absolute left-2.5 top-2.5 rounded-full bg-yellow px-2 py-0.5 text-[11px] font-bold">Make</span>}
          {post.media.length > 1 && <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">1/{post.media.length}</span>}
        </span>
      )}
      <span className="block px-3.5 pb-3.5 pt-3">
        {post.caption && <span className={cover ? 'line-clamp-2 text-sm leading-snug' : 'line-clamp-6 font-display text-lg leading-snug tracking-[-.03em]'}><CaptionText text={post.caption} linked={false} /></span>}
        <span className="mt-2.5 flex items-center gap-2 text-[13px]">
          <UserAvatar name={post.author.name} avatarUrl={post.author.avatarUrl} size={22} />
          <b className="min-w-0 flex-1 truncate font-semibold">@{post.author.handle}</b>
          <span className="inline-flex items-center gap-1 text-subtle"><Heart size={14} aria-hidden="true" />{compact.format(post.likeCount)}<span className="sr-only"> likes</span></span>
        </span>
      </span>
    </Link>
  );
}

/** Signed out: what an account adds, with a way back here after signing in. */
export function GuestBanner() {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-[30px] bg-yellow p-5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <Heart size={22} aria-hidden="true" className="shrink-0" />
      <p className="flex-1 text-[15px] font-medium leading-snug">You're browsing as a guest. Sign in to like, comment, follow sewists and join challenges. We'll bring you right back here.</p>
      <Link href={authHref('sign-in', '/explore')} className="inline-flex min-h-[44px] shrink-0 items-center self-start rounded-full bg-ink px-5 text-[15px] font-semibold text-white no-underline sm:self-auto">Sign in or join</Link>
    </div>
  );
}

function SideCard({ title, more, children, dark = false }: { title: string; more?: { href: string; label: string }; children: React.ReactNode; dark?: boolean }) {
  return (
    <section className={`rounded-[30px] p-5 ${dark ? 'bg-ink text-white' : 'bg-white'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[20px] tracking-[-.04em]">{title}</h2>
        {more && <Link href={more.href} className="text-sm font-semibold text-ink underline underline-offset-4">{more.label}</Link>}
      </div>
      {children}
    </section>
  );
}

/** Running challenges with the most people, then upcoming ones. */
function TrendingChallenges() {
  const active = useListChallenges({ status: 'active' });
  const upcoming = useListChallenges({ status: 'upcoming' });
  const list = [...[...(active.data ?? [])].sort((a, b) => b.members - a.members), ...(upcoming.data ?? [])].slice(0, 3);
  if (list.length === 0) return null;
  return (
    <SideCard title="Trending challenges" more={{ href: '/challenges', label: 'All' }}>
      <ul className="mt-3">
        {list.map(c => {
          const [when, count] = challengeMeta(c);
          return (
            <li key={c.slug}>
              <Link href={`/challenges/${c.slug}`} className="flex items-center gap-3 rounded-[16px] py-2 text-ink no-underline hover:bg-canvas">
                <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-yellow"><Trophy size={20} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px]">#{c.tag}</b>
                  <span className="block truncate text-xs text-subtle">{c.status === 'upcoming' ? when : `${when} · ${count}`}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${c.status === 'active' ? 'bg-yellow' : 'border-2 border-blue text-blue-ink'}`}>{c.status === 'active' ? 'Active' : 'Soon'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SideCard>
  );
}

/** Shared pattern pages with the most reviews. */
function PopularPatterns() {
  const list = useListCatalog({ kind: 'pattern' });
  const items = (list.data?.items ?? []).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <SideCard title="Popular patterns" more={{ href: '/catalog', label: 'All' }}>
      <ul className="mt-2 divide-y divide-line">
        {items.map(p => (
          <li key={p.id}>
            <Link href={`/catalog/pattern/${p.slug}`} className="flex items-center gap-3 py-3 text-ink no-underline hover:underline">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px]">{p.name}</b>
                <span className="block truncate text-xs text-subtle">{[p.maker, `${p.stats.makes} ${p.stats.makes === 1 ? 'make' : 'makes'}`].filter(Boolean).join(' · ')}</span>
              </span>
              {p.stats.rating != null && <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold"><Star size={14} aria-hidden="true" className="fill-ink" />{p.stats.rating.toFixed(1)}<span className="sr-only"> out of 5</span></span>}
            </Link>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

/** Explore: everyone's public posts. Works signed out. */
export function ExplorePage() {
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const { isLoaded, isSignedIn } = useAuth();
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
      <CommunityTabs />
      {isLoaded && !isSignedIn && <GuestBanner />}
      {/* Signed in, the top bar already names the page: one toolbar row, no big heading (owner). */}
      {!isSignedIn && <div><p className="eyebrow eyebrow-red">Discover</p><h1 className="font-display text-[44px] leading-none tracking-[-.06em] sm:text-[56px]">Explore</h1></div>}
      <div className={`flex flex-wrap items-center gap-2 ${isSignedIn ? '' : 'mt-3'}`}>
        <div role="group" aria-label="Show" className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-1 sm:px-0">
          {KINDS.map(k => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
              className={`min-h-[44px] shrink-0 rounded-full px-4 text-[15px] font-semibold ${kind === k.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>{k.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Phones have the search icon in the header. */}
          <Link href="/search" className="hidden min-h-[48px] items-center gap-2 rounded-full bg-yellow px-5 text-[15px] font-bold text-ink no-underline sm:inline-flex"><Search size={18} aria-hidden="true" />Search Explore</Link>
          <div role="group" aria-label="Order" className="flex rounded-full bg-white p-1">
            {SORTS.map(o => (
              <button key={o.id} type="button" aria-pressed={sort === o.id} onClick={() => setSort(o.id)}
                className={`min-h-[40px] rounded-full px-4 text-[15px] font-semibold ${sort === o.id ? 'bg-ink text-white' : 'text-ink hover:bg-canvas'}`}>{o.label}</button>
            ))}
          </div>
        </div>
      </div>
      {sort === 'popular' && <p className="mt-3 text-sm text-subtle">Most liked in the last two weeks.</p>}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px] lg:items-start">
        <div>
          {feed.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
            : feed.isError ? <ErrorState retry={() => feed.refetch()} />
            : posts.length === 0 ? <div className="rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle">Nothing here yet.</div>
            : <div className="gap-3.5 sm:columns-2 xl:columns-3">{posts.map(post => <ExploreCard key={post.id} post={post} />)}</div>}
          {feed.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="btn btn-line">
                {feed.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
              </button>
            </div>
          )}
        </div>
        <aside aria-label="More to explore" className="grid gap-4">
          <TrendingChallenges />
          <PopularPatterns />
        </aside>
      </div>
    </div>
  );
}
