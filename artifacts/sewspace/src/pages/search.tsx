import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listForumTopics, searchPosts, useListCatalog, useSearchPeople, useSearchTags } from '@workspace/api-client-react';
import { Hash, Loader2 } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { ErrorState } from '@/components/common';
import { TopicCard } from '@/components/forum/parts';
import { SearchBox, searchHref } from '@/components/search/SearchBox';
import { FilterChips } from '@/components/studio/parts';
import { EntryCard } from '@/pages/catalog';
import { PostTile } from '@/pages/explore';

const TABS = [
  { value: 'posts', label: 'Posts' },
  { value: 'people', label: 'People' },
  { value: 'tags', label: 'Tags' },
  { value: 'forum', label: 'Forum' },
  { value: 'patterns', label: 'Patterns' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const isTab = (value: string | null): value is Tab => TABS.some(t => t.value === value);
const MIN = 2;

const box = 'rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle';
const spinner = <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>;

/**
 * Search from Explore: public posts, people, hashtags, forum topics and
 * pattern/product pages. Works signed out; the API returns public content only
 * and leaves out anyone on the other side of a block.
 */
export function SearchPage() {
  const params = new URLSearchParams(useSearch());
  const [, setLocation] = useLocation();
  const urlQ = params.get('q') ?? '';
  const tab: Tab = isTab(params.get('tab')) ? params.get('tab') as Tab : 'posts';
  const [text, setText] = useState(urlQ);
  const [q, setQ] = useState(urlQ.trim());
  // The tab at the moment the delayed search runs (it may change while typing).
  const tabNow = useRef(tab);
  tabNow.current = tab;
  useEffect(() => { document.title = q ? `“${q}” · Search · Seams Club` : 'Search · Seams Club'; }, [q]);

  // Search as you type (300 ms after the last key); the URL keeps the query so Back and sharing work.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = text.replace(/\s+/g, ' ').trim();
      if (next === q) return;
      setQ(next);
      setLocation(searchHref(next, tabNow.current), { replace: true });
    }, 300);
    return () => window.clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = q.length >= MIN;

  return (
    <div className="mx-auto max-w-[900px]">
      <SearchBox value={text} onChange={setText} autoFocus={!urlQ} onSubmit={value => { const next = value.trim(); setQ(next); setLocation(searchHref(next, tab), { replace: true }); }} />
      <div className="mt-3">
        <FilterChips label="Search in" value={tab} onChange={next => setLocation(searchHref(q, next), { replace: true })} options={TABS.map(t => ({ value: t.value, label: t.label }))} />
      </div>
      <div className="mt-4" aria-live="polite">
        {!q ? <p className={box}>Search posts, people, hashtags, the forum and patterns.</p>
          : !ready ? <p className={box}>Type at least {MIN} characters.</p>
          : tab === 'posts' ? <PostResults q={q} />
          : tab === 'people' ? <PeopleResults q={q} />
          : tab === 'tags' ? <TagResults q={q} />
          : tab === 'forum' ? <ForumResults q={q} />
          : <CatalogResults q={q} />}
      </div>
    </div>
  );
}

function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!query.hasNextPage) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="btn btn-line">
        {query.isFetchingNextPage && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Load more
      </button>
    </div>
  );
}

function PostResults({ q }: { q: string }) {
  const posts = useInfiniteQuery({
    queryKey: ['search', 'posts', q],
    queryFn: ({ pageParam }) => searchPosts({ q, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  const items = posts.data?.pages.flatMap(page => page.items) ?? [];
  if (posts.isLoading) return spinner;
  if (posts.isError) return <ErrorState retry={() => posts.refetch()} />;
  if (!items.length) return <p className={box}>No public posts mention “{q}”.</p>;
  return <>
    <div className="columns-2 gap-2.5 sm:columns-3">{items.map(post => <PostTile key={post.id} post={post} />)}</div>
    <LoadMore query={posts} />
  </>;
}

function PeopleResults({ q }: { q: string }) {
  const people = useSearchPeople({ q });
  if (people.isLoading) return spinner;
  if (people.isError) return <ErrorState retry={() => people.refetch()} />;
  if (!people.data?.length) return <p className={box}>Nobody matches “{q}”.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[30px] bg-white">
      {people.data.map(p => (
        <li key={p.handle}>
          <Link href={`/@${p.handle}`} className="flex min-h-[64px] items-center gap-3 px-5 py-2.5 text-ink no-underline hover:bg-canvas">
            <UserAvatar name={p.name} avatarUrl={p.avatarUrl} size={44} />
            <span className="min-w-0"><span className="block truncate font-bold">{p.name}</span><span className="block truncate text-sm text-subtle">@{p.handle}</span></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TagResults({ q }: { q: string }) {
  const tags = useSearchTags({ q });
  if (tags.isLoading) return spinner;
  if (tags.isError) return <ErrorState retry={() => tags.refetch()} />;
  if (!tags.data?.length) return <p className={box}>No hashtags start with “{q.replace(/^#/, '')}”.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[30px] bg-white">
      {tags.data.map(t => (
        <li key={t.tag}>
          <Link href={`/tags/${encodeURIComponent(t.tag)}`} className="flex min-h-[56px] items-center gap-3 px-5 py-2 text-ink no-underline hover:bg-canvas">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-yellow" aria-hidden="true"><Hash size={18} /></span>
            <span className="min-w-0 flex-1 truncate font-bold">#{t.tag}</span>
            <span className="text-sm text-subtle">{t.posts} post{t.posts === 1 ? '' : 's'}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ForumResults({ q }: { q: string }) {
  const topics = useInfiniteQuery({
    queryKey: ['search', 'forum', q],
    queryFn: ({ pageParam }) => listForumTopics({ sort: 'hot', q, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
  const items = topics.data?.pages.flatMap(page => page.items) ?? [];
  if (topics.isLoading) return spinner;
  if (topics.isError) return <ErrorState retry={() => topics.refetch()} />;
  if (!items.length) return <p className={box}>No forum topics match “{q}”. <Link href="/forum/new?kind=question" className="font-bold text-ink">Ask the forum</Link></p>;
  return <>
    <div className="space-y-3">{items.map(t => <TopicCard key={t.id} topic={t} />)}</div>
    <LoadMore query={topics} />
  </>;
}

function CatalogResults({ q }: { q: string }) {
  const patterns = useListCatalog({ kind: 'pattern', q });
  const products = useListCatalog({ kind: 'product', q });
  if (patterns.isLoading || products.isLoading) return spinner;
  if (patterns.isError || products.isError) return <ErrorState retry={() => { patterns.refetch(); products.refetch(); }} />;
  const sections = [['Patterns', patterns.data?.items ?? []], ['Fabrics & supplies', products.data?.items ?? []]] as const;
  if (sections.every(([, items]) => !items.length)) return <p className={box}>No pattern or product pages match “{q}”.</p>;
  return (
    <div className="space-y-6">
      {sections.filter(([, items]) => items.length).map(([label, items]) => (
        <section key={label} aria-label={label}>
          <h2 className="eyebrow mb-2 px-1 text-subtle">{label}</h2>
          <div className="grid gap-3 sm:grid-cols-2">{items.map(entry => <EntryCard key={entry.id} entry={entry} />)}</div>
        </section>
      ))}
    </div>
  );
}
