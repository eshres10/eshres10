import { getHomeFeed } from '@workspace/api-client-react';
import { Compass } from 'lucide-react';
import { Link } from 'wouter';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { FeedList } from '@/components/feed/FeedList';
import { PopularPatterns, SewistsToFollow, TrendingChallenges } from '@/components/feed/SideCards';
import { usePipGate } from '@/components/onboarding/gate';
import { FinishSetupCard } from '@/pages/onboarding-finish';

/** Home: posts from people you follow, and your own. Browsing everyone is Explore (no Discover tab: owner's call). */
export function FeedPage() {
  usePipGate();
  return (
    <div className="mx-auto grid max-w-[920px] justify-center gap-4 lg:grid-cols-[minmax(0,600px)_300px] lg:gap-5">
      <div className="flex min-w-0 flex-col gap-3.5 md:gap-4">
        <FinishSetupCard />
        <FeedList queryKey={FEED_KEYS.home} fetchPage={cursor => getHomeFeed(cursor ? { cursor } : undefined)} empty={
          <div className="rounded-[30px] bg-white px-6 py-14 text-center">
            <Compass className="mx-auto" size={28} aria-hidden="true" />
            <p className="mt-3 font-display text-xl">Your feed starts here</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-subtle">Follow people to see their posts here, along with your own. Find makers you like on Explore.</p>
            <Link href="/explore" className="btn btn-primary mt-5">Go to Explore</Link>
          </div>} />
      </div>
      {/* Owner, October 2026: challenges, patterns and people to follow instead of "On your table". */}
      <aside className="sticky top-[110px] hidden flex-col gap-4 self-start lg:flex" aria-label="From the community"><TrendingChallenges /><PopularPatterns /><SewistsToFollow /></aside>
    </div>
  );
}
