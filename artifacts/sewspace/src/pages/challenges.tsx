import { useEffect, useState } from 'react';
import { useListChallenges } from '@workspace/api-client-react';
import { Loader2, Plus, Trophy } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { useRequireSignIn } from '@/components/auth/SignInPrompt';
import { ChallengeCard, NewChallengeForm } from '@/components/challenges/parts';
import { ErrorState } from '@/components/common';
import { Sheet } from '@/components/social/Sheet';
import { CommunityTabs } from '@/components/shell/CommunityTabs';

const TABS = [
  { id: 'active', label: 'Running now' },
  { id: 'upcoming', label: 'Starting soon' },
  { id: 'ended', label: 'Finished' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** All challenges by status. Works signed out. */
export function ChallengesPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const tab: Tab = TABS.some(t => t.id === params.get('status')) ? params.get('status') as Tab : 'active';
  const list = useListChallenges({ status: tab });
  const ask = useRequireSignIn();
  const [starting, setStarting] = useState(false);
  useEffect(() => { document.title = 'Sewing challenges · SewSpace'; }, []);
  return (
    <div className="mx-auto max-w-[1232px]">
      <CommunityTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Challenges</p>
          <h1 className="mt-1 font-display text-[34px] leading-tight tracking-[-.05em]">Sew along with everyone</h1>
          <p className="mt-1 max-w-xl text-sm text-subtle">Join a challenge, share your make with the tag, and cheer on everyone else's.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { if (ask({ title: 'Sign in to start a challenge', body: "You'll come straight back here." })) setStarting(true); }}>
          <Plus size={16} aria-hidden="true" />Start a challenge
        </button>
      </div>
      <div role="tablist" aria-label="Challenges" className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setLocation(t.id === 'active' ? '/challenges' : `/challenges?status=${t.id}`, { replace: true })}
            className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-bold ${tab === t.id ? 'bg-ink text-white' : 'text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <div className="mt-5">
        {list.isLoading ? <div className="grid place-items-center py-16" role="status" aria-label="Loading"><Loader2 className="animate-spin" /></div>
          : list.isError ? <ErrorState retry={() => list.refetch()} />
          : !list.data?.length
            ? (
              <div className="grid place-items-center rounded-[30px] bg-white px-6 py-14 text-center">
                <Trophy size={28} aria-hidden="true" />
                <p className="mt-3 font-display text-xl">{tab === 'active' ? 'No challenges running' : tab === 'upcoming' ? 'Nothing scheduled yet' : 'No finished challenges yet'}</p>
                <p className="mt-1 text-sm text-subtle">Start one: pick a tag, a theme and some dates.</p>
              </div>
            )
            : <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">{list.data.map(c => <ChallengeCard key={c.slug} challenge={c} />)}</div>}
      </div>
      {starting && (
        <Sheet label="Start a challenge" onClose={() => setStarting(false)}>
          <NewChallengeForm onCancel={() => setStarting(false)} onCreated={c => { setStarting(false); setLocation(`/challenges/${c.slug}`); }} />
        </Sheet>
      )}
    </div>
  );
}
