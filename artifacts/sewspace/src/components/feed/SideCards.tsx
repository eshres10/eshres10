import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { followProfile, unfollowProfile, useGetExploreCards, useGetSuggestedPeople, useListCatalog, useListChallenges, type SuggestedPerson } from '@workspace/api-client-react';
import { Loader2, Star, Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { challengeMeta } from '@/components/challenges/parts';
import { FEED_KEYS } from '@/components/feed/feed-keys';

// Side cards for Home (and the old Explore page): Trending challenges, Popular
// patterns and Sewists to follow. Owner, October 2026: these replace "On your
// table" on Home.

export function SideCard({ title, more, children, dark = false }: { title: string; more?: { href: string; label: string }; children: React.ReactNode; dark?: boolean }) {
  return (
    <section className={`rounded-[30px] p-5 ${dark ? 'bg-ink text-white' : 'bg-white'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[20px] tracking-[-.04em]">{title}</h2>
        {more && <Link href={more.href} className={`text-sm font-semibold underline underline-offset-4 ${dark ? 'text-white' : 'text-ink'}`}>{more.label}</Link>}
      </div>
      {children}
    </section>
  );
}

/** Running challenges with the most people, then upcoming ones; the cover is the most liked entry photo you may see. */
export function TrendingChallenges() {
  const active = useListChallenges({ status: 'active' });
  const upcoming = useListChallenges({ status: 'upcoming' });
  const cards = useGetExploreCards({ tab: 'challenges', sub: 'all' }, { query: { staleTime: 60_000 } });
  const covers = new Map((cards.data?.items ?? []).flatMap(c => (c.challenge?.cover ? [[c.challenge.slug, c.challenge.cover.thumbUrl] as const] : [])));
  const list = [...[...(active.data ?? [])].sort((a, b) => b.members - a.members), ...(upcoming.data ?? [])].slice(0, 3);
  if (list.length === 0) return null;
  return (
    <SideCard title="Trending challenges" more={{ href: '/challenges', label: 'All' }}>
      <ul className="mt-3">
        {list.map(c => {
          const [when, count] = challengeMeta(c);
          const cover = covers.get(c.slug);
          return (
            <li key={c.slug}>
              <Link href={`/challenges/${c.slug}`} className="flex items-center gap-3 rounded-[16px] py-2 text-ink no-underline hover:bg-canvas">
                {cover
                  ? <img src={cover} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[14px] object-cover" />
                  : <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-yellow"><Trophy size={20} /></span>}
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
export function PopularPatterns() {
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

// Initials sit on the brand colours in turn (yellow, blue, peach), as in the design.
const TONES = ['bg-yellow text-ink', 'bg-blue text-white', 'bg-peach text-ink'];

function PersonRow({ person, index }: { person: SuggestedPerson; index: number }) {
  const client = useQueryClient();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await (following ? unfollowProfile(person.handle) : followProfile(person.handle));
      setFollowing(!following);
      client.invalidateQueries({ queryKey: FEED_KEYS.all });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-3 py-2">
      <Link href={`/@${person.handle}`} aria-hidden="true" tabIndex={-1} className="shrink-0">
        {person.avatarUrl
          ? <img src={person.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          : <span className={`grid h-10 w-10 place-items-center rounded-full font-display text-[16px] ${TONES[index % TONES.length]}`}>{person.name.trim().charAt(0).toUpperCase() || '?'}</span>}
      </Link>
      <Link href={`/@${person.handle}`} className="min-w-0 flex-1 text-white no-underline">
        <b className="block truncate text-[14px]">{person.name}</b>
        <span className="block truncate text-xs text-white/70">@{person.handle}{person.makes ? ` · ${person.makes} ${person.makes === 1 ? 'make' : 'makes'}` : ''}</span>
      </Link>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={following} aria-label={`${following ? 'Following' : 'Follow'} @${person.handle}`}
        className={`inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-bold disabled:opacity-60 ${following ? 'border border-white text-white' : 'bg-yellow text-ink'}`}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : following ? 'Following' : 'Follow'}
      </button>
    </li>
  );
}

/** People with public work you don't follow yet (signed in only). Following keeps them in the list as "Following" until the page reloads. */
export function SewistsToFollow() {
  const people = useGetSuggestedPeople({ query: { staleTime: Infinity } });
  if (!people.data?.length) return null;
  return (
    <SideCard title="Sewists to follow" dark>
      <ul className="mt-2">{people.data.map((p, i) => <PersonRow key={p.handle} person={p} index={i} />)}</ul>
    </SideCard>
  );
}
