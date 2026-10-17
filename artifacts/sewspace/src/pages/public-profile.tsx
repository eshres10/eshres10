import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  followProfile,
  getGetProfileMakesQueryKey,
  getGetProfileUsedQueryKey,
  getGetPublicProfileQueryKey,
  getProfilePosts,
  unfollowProfile,
  useGetProfileMakes,
  useGetProfileUsed,
  useGetPublicProfile,
  type FeedPost,
  type MakeSummary,
  type ProfileStats,
  type UsedProduct,
} from '@workspace/api-client-react';
import { BookOpen, Check, Grid3x3, Layers, Loader2, Lock, Pencil, Plus, Scissors, ShoppingBag, Spool, UserCheck, UserPlus } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { ErrorState, Loading } from '@/components/common';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { AdaptiveLayout } from '@/components/shell/Shell';
import { SafetyMenu } from '@/components/social/SafetyMenu';
import { VisibilityBadge } from '@/components/visibility';
import { swatch } from '@/lib/swatch';
import NotFound from '@/pages/not-found';
import { CaptionText } from '@/components/feed/CaptionText';

const TABS = [
  { id: 'posts', label: 'Posts', icon: Grid3x3 },
  { id: 'makes', label: 'Makes', icon: Scissors },
  { id: 'used', label: 'Used', icon: ShoppingBag },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STAGES: Record<string, string> = { planning: 'Planning', cutting: 'Cutting', sewing: 'Sewing', fitting: 'Fitting', finished: 'Finished' };

function monthYear(date: string | Date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function compact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function ShareButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) await navigator.share({ title: `${name} on Seams Club`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };
  return (
    <button type="button" onClick={share} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-semibold text-white">
      {copied && <Check size={16} aria-hidden="true" />}{copied ? 'Link copied' : 'Share profile'}
    </button>
  );
}

/** Follow / Following. Signed-out visitors are asked to sign in and come back here. */
function FollowButton({ handle, name, following }: { handle: string; name: string; following: boolean }) {
  const ask = useRequireSignIn();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!ask({ title: `Sign in to follow ${name}`, body: "You'll see their posts in your Home feed. You'll come straight back here." })) return;
    setBusy(true);
    try {
      await (following ? unfollowProfile(handle) : followProfile(handle));
      // Counts, followers-only posts and the Home feed all change.
      await client.invalidateQueries({ queryKey: getGetPublicProfileQueryKey(handle) });
      client.invalidateQueries({ queryKey: FEED_KEYS.all });
      client.invalidateQueries({ queryKey: getGetProfileMakesQueryKey(handle) });
      client.invalidateQueries({ queryKey: getGetProfileUsedQueryKey(handle) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={following}
      className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-bold disabled:opacity-60 ${following ? 'border border-ink bg-white text-ink' : 'bg-yellow text-ink'}`}>
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : following ? <UserCheck size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

function Stats({ stats }: { stats: ProfileStats }) {
  const items = [
    { count: stats.posts, label: stats.posts === 1 ? 'post' : 'posts' },
    { count: stats.followers, label: stats.followers === 1 ? 'follower' : 'followers' },
    { count: stats.following, label: 'following' },
  ];
  return (
    <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 text-center">
      {items.map(item => (
        <div key={item.label} className="min-w-0">
          <div className="font-display text-[22px] font-bold leading-tight sm:text-2xl">{compact(item.count)}</div>
          <div className="truncate text-xs text-subtle sm:text-sm">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/** "Some of Ana's posts are for followers only", with a sign-in link for visitors. */
function LockNotice({ count, what, name }: { count: number; what: 'post' | 'make'; name: string }) {
  const { isSignedIn } = useAuth();
  const ask = useRequireSignIn();
  if (!count) return null;
  return (
    <div className="mt-3.5 flex items-center gap-3 rounded-[24px] bg-white px-5 py-4 text-sm">
      <Lock size={20} aria-hidden="true" className="shrink-0" />
      <span className="flex-1">{plural(count, what)} by {name} {count === 1 ? 'is' : 'are'} for followers only.</span>
      {!isSignedIn
        ? (
          <button type="button" className="min-h-[44px] font-bold underline" onClick={() => ask({ title: `Sign in to follow ${name}`, body: "Followers-only posts show once you follow. You'll come straight back here." })}>
            Sign in to follow
          </button>
        )
        : <span className="text-subtle">Follow to see them.</span>}
    </div>
  );
}

function Empty({ icon: Icon, title, body, action }: { icon: typeof Grid3x3; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[30px] border border-line bg-white px-6 py-14 text-center">
      <Icon size={28} aria-hidden="true" />
      <p className="mt-3 font-display text-xl tracking-[-.03em]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-subtle">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function PostTile({ post, showVisibility }: { post: FeedPost; showVisibility: boolean }) {
  const cover = post.media[0];
  const label = post.caption ? post.caption.slice(0, 120) : post.kind === 'photo' ? 'Photo post' : 'Post';
  return (
    <Link href={`/posts/${post.id}`} aria-label={label}
      className="relative block aspect-square overflow-hidden rounded-[22px] bg-line text-ink no-underline"
      style={cover?.color ? { backgroundColor: cover.color } : undefined}>
      {cover
        ? <img src={cover.thumbUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        : <span className="absolute inset-0 flex items-center bg-white p-[clamp(12px,3vw,22px)] font-display text-[clamp(14px,2.4vw,19px)] font-semibold leading-[1.3] tracking-[-.03em]">
            <span className="line-clamp-5"><CaptionText text={post.caption} linked={false} /></span>
          </span>}
      {post.media.length > 1 && <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-white">1/{post.media.length}</span>}
      {showVisibility && post.visibility !== 'public' && (
        <span className="absolute bottom-2 left-2"><VisibilityBadge value={post.visibility} /></span>
      )}
    </Link>
  );
}

function PostsTab({ handle, name, isMe, locked }: { handle: string; name: string; isMe: boolean; locked: number }) {
  const posts = useInfiniteQuery({
    queryKey: [...FEED_KEYS.all, 'profile', handle.toLowerCase()],
    queryFn: ({ pageParam }) => getProfilePosts(handle, pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  if (posts.isLoading) return <div className="grid place-items-center py-16" role="status" aria-label="Loading posts"><Loader2 className="animate-spin" /></div>;
  if (posts.isError) return <ErrorState retry={() => posts.refetch()} />;
  const items = posts.data?.pages.flatMap(page => page.items) ?? [];
  return (
    <>
      {items.length
        ? <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-2.5">
            {items.map(post => <PostTile key={post.id} post={post} showVisibility={isMe} />)}
          </div>
        : <Empty icon={Grid3x3} title={isMe ? 'Share your first post' : 'No posts yet'}
            body={isMe ? 'Photos of a make, a work in progress or a question for the community.' : `When ${name} posts, it shows up here.`}
            action={isMe && <Link href="/new" className="btn btn-primary"><Plus size={16} aria-hidden="true" />New post</Link>} />}
      {posts.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => posts.fetchNextPage()} disabled={posts.isFetchingNextPage} className="btn btn-line">
            {posts.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
          </button>
        </div>
      )}
      <LockNotice count={locked} what="post" name={name} />
    </>
  );
}

function MakeCard({ make, isMe }: { make: MakeSummary; isMe: boolean }) {
  const pattern = make.materials.find(m => m.kind === 'pattern');
  const fabric = make.materials.find(m => m.kind === 'fabric');
  const thread = make.materials.find(m => m.kind === 'thread');
  const finished = make.status === 'finished';
  const rows: Array<[string, string | null | undefined]> = [
    ['Pattern', pattern?.name],
    ['Fabric', fabric?.name],
    ['Thread', thread?.name],
    ['Size', make.size],
    ['Alterations', make.alterations],
  ];
  return (
    <article className="flex flex-col overflow-hidden rounded-[30px] bg-white">
      <Link href={`/makes/${make.id}`} className="relative block aspect-[4/3] overflow-hidden bg-line no-underline" aria-label={make.name}>
        {make.coverImageUrl
          ? <img src={make.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-[center_25%]" />
          : <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-peach-soft"><Scissors size={36} /></span>}
        {!finished && (
          <span className="absolute left-3 top-3 rounded-full bg-yellow px-3 py-1 text-xs font-bold text-ink">{STAGES[make.status] ?? make.status} · {make.progress}%</span>
        )}
        {isMe && make.visibility !== 'public' && <span className="absolute bottom-3 left-3"><VisibilityBadge value={make.visibility} /></span>}
      </Link>
      <div className="px-[22px] pb-6 pt-5">
        <h3 className="font-display text-[22px] leading-tight tracking-[-.04em]">
          <Link href={`/makes/${make.id}`} className="text-ink no-underline hover:underline">{make.name}</Link>
        </h3>
        <p className="mt-1 text-[13px] text-subtle">
          {finished ? (make.completedAt ? `Finished ${monthYear(make.completedAt)}` : 'Finished') : 'In progress'}
        </p>
        {rows.some(([, v]) => v) && (
          <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
            {rows.filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-subtle">{label}</dt>
                <dd className={`min-w-0 ${label === 'Alterations' ? 'line-clamp-3' : 'truncate font-semibold'}`}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

function MakesTab({ handle, name, isMe, locked }: { handle: string; name: string; isMe: boolean; locked: number }) {
  const makes = useGetProfileMakes(handle);
  if (makes.isLoading) return <Loading />;
  if (makes.isError || !makes.data) return <ErrorState retry={() => makes.refetch()} />;
  const { finished, inProgress } = makes.data;
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4';
  return (
    <>
      {finished.length
        ? <div className={grid}>{finished.map(m => <MakeCard key={m.id} make={m} isMe={isMe} />)}</div>
        : <Empty icon={Scissors} title={isMe ? 'No shared finished makes' : 'No finished makes yet'}
            body={isMe ? 'Mark a make as finished and choose who can see it, from Projects & makes.' : `Finished makes ${name} shares will show here.`}
            action={isMe && <Link href="/projects" className="btn btn-line">Open my projects</Link>} />}
      {inProgress.length > 0 && (
        <section aria-labelledby="in-progress" className="mt-8">
          <h2 id="in-progress" className="eyebrow mb-3">On the table</h2>
          <div className={grid}>{inProgress.map(m => <MakeCard key={m.id} make={m} isMe={isMe} />)}</div>
        </section>
      )}
      <LockNotice count={locked} what="make" name={name} />
    </>
  );
}

const USED_GROUPS = [
  { kind: 'pattern', title: 'Patterns', icon: BookOpen, chip: 'bg-yellow text-ink' },
  { kind: 'fabric', title: 'Fabrics', icon: Layers, chip: 'bg-peach text-ink' },
  { kind: 'thread', title: 'Threads', icon: Spool, chip: 'bg-blue text-white' },
] as const;

function UsedItem({ item }: { item: UsedProduct }) {
  return (
    <li className="flex gap-3 border-t border-line py-3">
      {item.imageUrl
        ? <img src={item.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[14px] object-cover" />
        : item.kind === 'pattern'
          ? <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-canvas"><BookOpen size={20} /></span>
          : <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-[14px] border border-line" style={{ background: swatch(item.color) }} />}
      <span className="min-w-0 flex-1">
        {item.catalog
          ? <Link href={`/catalog/${item.catalog.kind}/${item.catalog.slug}`} className="block truncate font-semibold text-blue-ink">{item.name}</Link>
          : <span className="block truncate font-semibold">{item.name}</span>}
        {item.detail && <span className="block truncate text-xs text-subtle">{item.detail}</span>}
        <span className="mt-1 block text-xs text-subtle">
          Used in{' '}
          {item.makes.map((m, i) => (
            <span key={m.id}>{i > 0 && ', '}<Link href={`/makes/${m.id}`} className="font-semibold text-blue-ink">{m.name}</Link></span>
          ))}
        </span>
      </span>
    </li>
  );
}

function UsedTab({ handle, name, isMe }: { handle: string; name: string; isMe: boolean }) {
  const used = useGetProfileUsed(handle);
  if (used.isLoading) return <Loading />;
  if (used.isError || !used.data) return <ErrorState retry={() => used.refetch()} />;
  const groups = USED_GROUPS.map(g => ({ ...g, items: used.data.items.filter(i => i.kind === g.kind) })).filter(g => g.items.length);
  if (!groups.length) {
    return <Empty icon={ShoppingBag} title="Nothing to show yet"
      body={isMe
        ? 'Patterns, fabrics and threads show here when they are linked to a shared make and are shared themselves. Stash and patterns are private until you choose otherwise.'
        : `Patterns, fabrics and threads ${name} shares from their makes will show here.`} />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-4">
      {groups.map(g => (
        <section key={g.kind} aria-labelledby={`used-${g.kind}`} className="rounded-[30px] bg-white p-6">
          <div className="flex items-center gap-2.5">
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${g.chip}`}><g.icon size={18} aria-hidden="true" /></span>
            <h2 id={`used-${g.kind}`} className="font-display text-[21px] tracking-[-.04em]">{g.title}</h2>
          </div>
          <ul className="mt-3.5">{g.items.map(item => <UsedItem key={`${item.kind}-${item.id}`} item={item} />)}</ul>
        </section>
      ))}
    </div>
  );
}

/** Public profile at /@handle, with Posts, Makes and Used tabs. Readable by anyone; each list holds only what the viewer may see. */
export function PublicProfilePage({ handle }: { handle: string }) {
  const profile = useGetPublicProfile(handle, { query: { retry: false } });
  const [location, setLocation] = useLocation();
  const search = new URLSearchParams(useSearch());
  const tab: TabId = TABS.some(t => t.id === search.get('tab')) ? search.get('tab') as TabId : 'posts';
  const setTab = (next: TabId) => setLocation(next === 'posts' ? location : `${location}?tab=${next}`, { replace: true });
  const p = profile.data;

  useEffect(() => {
    if (p) document.title = `${p.name} (@${p.handle}) · Seams Club`;
  }, [p]);

  if (profile.isLoading) return <AdaptiveLayout><Loading /></AdaptiveLayout>;
  if (!p) return <NotFound />;

  return (
    <AdaptiveLayout>
      <section className="rounded-[30px] bg-white p-5 sm:p-7">
        <div className="flex items-center gap-4 sm:gap-6">
          {p.avatarUrl
            ? <img src={p.avatarUrl} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover sm:h-32 sm:w-32" />
            : <span aria-hidden="true" className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-ink font-display text-[34px] tracking-[-.04em] text-yellow sm:h-32 sm:w-32 sm:text-[52px]">{p.name.charAt(0).toUpperCase()}</span>}
          <Stats stats={p.stats} />
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <h1 className="font-sans text-lg font-bold leading-tight">{p.name}</h1>
          {!p.isMe && <SafetyMenu kind="profile" targetId={p.handle} what="profile" authorHandle={p.handle} label="More: report or block" leaveOnBlock="/feed" />}
        </div>
        {p.bio && <p className="mt-1 whitespace-pre-line text-[15px] leading-6">{p.bio}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {p.isMe
            ? <Link href="/settings" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-yellow px-4 text-[15px] font-bold text-ink no-underline"><Pencil size={16} aria-hidden="true" />Edit profile</Link>
            : <FollowButton handle={p.handle} name={p.name} following={p.followedByMe} />}
          <ShareButton name={p.name} />
        </div>
      </section>

      <div role="tablist" aria-label="Profile sections" className="mt-3 flex w-full max-w-[520px] gap-1 rounded-full bg-white p-[5px] sm:mt-[22px]">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="profile-panel" onClick={() => setTab(t.id)}
            className={`min-h-[44px] flex-1 rounded-full text-[15px] font-bold ${tab === t.id ? 'bg-ink text-white' : 'text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <section id="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === 'posts' && <PostsTab handle={p.handle} name={p.name} isMe={p.isMe} locked={p.stats.followersOnlyPosts} />}
        {tab === 'makes' && <MakesTab handle={p.handle} name={p.name} isMe={p.isMe} locked={p.stats.followersOnlyMakes} />}
        {tab === 'used' && <UsedTab handle={p.handle} name={p.name} isMe={p.isMe} />}
      </section>
    </AdaptiveLayout>
  );
}
