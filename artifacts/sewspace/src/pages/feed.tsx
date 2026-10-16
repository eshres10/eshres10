import { useState } from 'react';
import { getExploreFeed, getHomeFeed, useGetDashboard, useGetProfile } from '@workspace/api-client-react';
import { Camera, Compass, Scissors } from 'lucide-react';
import { Link } from 'wouter';
import { UserAvatar } from '@/components/avatar';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { FeedList } from '@/components/feed/FeedList';

function Composer() {
  const me = useGetProfile();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[30px] bg-white px-[18px] py-4">
      <UserAvatar name={me.data?.name} avatarUrl={me.data?.avatarUrl} size={42} />
      <Link href="/new?type=status" className="flex min-h-[46px] flex-[1_1_240px] items-center rounded-full border border-line bg-canvas px-[18px] text-[15px] text-subtle no-underline">Share a make, a question or a work in progress…</Link>
      <div className="flex gap-1.5">
        <Link href="/new" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-peach px-3.5 text-[13px] font-semibold text-ink no-underline"><Camera size={16} aria-hidden="true" />Photos</Link>
        <Link href="/projects" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-yellow px-3.5 text-[13px] font-semibold text-ink no-underline"><Scissors size={16} aria-hidden="true" />Share a make</Link>
      </div>
    </div>
  );
}

function CurrentProject() {
  const dashboard = useGetDashboard();
  const project = dashboard.data?.activeProject;
  if (!project) return null;
  return (
    <section className="rounded-[30px] bg-white p-5" aria-labelledby="current-project">
      <h2 id="current-project" className="eyebrow">On your table</h2>
      <p className="mt-2 font-display text-xl leading-tight">{project.name}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-yellow" style={{ width: `${Math.min(100, project.progress)}%` }} /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/projects/${project.id}`} className="btn btn-line no-underline">Open make log</Link>
        <Link href={`/new?make=${project.id}`} className="btn btn-primary no-underline">Post progress</Link>
      </div>
    </section>
  );
}

/** Home: Following (people you follow + you) and Discover (everyone's public posts). */
export function FeedPage() {
  const [tab, setTab] = useState<'following' | 'discover'>('following');
  return (
    <div className="mx-auto grid max-w-[920px] justify-center gap-5 lg:grid-cols-[minmax(0,600px)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Composer />
        <div role="tablist" aria-label="Feed" className="flex w-fit gap-1 rounded-full bg-white p-1">
          {(['following', 'discover'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`min-h-[44px] rounded-full px-[18px] text-sm font-semibold ${tab === t ? 'bg-ink text-white' : 'text-ink'}`}>{t === 'following' ? 'Following' : 'Discover'}</button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'following'
            ? <FeedList queryKey={FEED_KEYS.home} fetchPage={cursor => getHomeFeed(cursor ? { cursor } : undefined)} empty={
                <div className="rounded-[30px] bg-white px-6 py-14 text-center">
                  <Compass className="mx-auto" size={28} aria-hidden="true" />
                  <p className="mt-3 font-display text-xl">Your feed starts here</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-subtle">Posts from people you follow and your own posts appear here. Following arrives soon; for now, see what everyone is making.</p>
                  <button type="button" onClick={() => setTab('discover')} className="btn btn-primary mt-5">Discover makes</button>
                </div>} />
            : <FeedList queryKey={FEED_KEYS.explore('all')} fetchPage={cursor => getExploreFeed(cursor ? { cursor } : undefined)} empty={
                <div className="rounded-[30px] bg-white px-6 py-14 text-center text-sm text-subtle">No public posts yet. Be the first to share something.</div>} />}
        </div>
      </div>
      <aside className="hidden flex-col gap-4 lg:flex" aria-label="Your studio"><CurrentProject /></aside>
    </div>
  );
}
