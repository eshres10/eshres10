import { useEffect } from 'react';
import { getSavedPosts } from '@workspace/api-client-react';
import { Bookmark } from 'lucide-react';
import { Link } from 'wouter';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { FeedList } from '@/components/feed/FeedList';

/** Posts you saved (private to you), most recently saved first. */
export function SavedPage() {
  useEffect(() => { document.title = 'Saved · Seams Club'; }, []);
  return (
    <div className="mx-auto max-w-[600px]">
      <p className="mb-4 text-sm text-subtle">Only you can see what you've saved. Posts that are deleted or no longer shared with you drop off this list.</p>
      <FeedList
        queryKey={FEED_KEYS.saved}
        fetchPage={cursor => getSavedPosts(cursor ? { cursor } : undefined)}
        empty={(
          <div className="grid place-items-center rounded-[30px] bg-white px-6 py-14 text-center">
            <Bookmark size={28} aria-hidden="true" />
            <p className="mt-3 font-display text-xl tracking-[-.03em]">Nothing saved yet</p>
            <p className="mt-1 max-w-sm text-sm text-subtle">Tap the bookmark on a post to keep it here for later: a fit you want to copy, a tip, a pattern hack.</p>
            <Link href="/explore" className="btn btn-primary mt-5">Explore posts</Link>
          </div>
        )}
      />
    </div>
  );
}
