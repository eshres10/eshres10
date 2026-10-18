import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createCollection, getGetSavedOverviewQueryKey, getListCollectionsQueryKey, getSavedPosts, useGetSavedOverview, type SavedItem } from '@workspace/api-client-react';
import { Bookmark, Loader2, Lock, Plus } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { ErrorState } from '@/components/common';
import { FEED_KEYS } from '@/components/feed/feed-keys';
import { FeedList } from '@/components/feed/FeedList';
import { SavedCover } from '@/components/saved/Cover';
import { Sheet, useSheetDirty } from '@/components/social/Sheet';
import { toast } from '@/hooks/use-toast';

const saves = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'save' : 'saves'}`;

/** One collection on the Saved page: a 2×2 cover, the name in bold and "{n} saves". */
function CollectionTile({ href, name, count, covers }: { href: string; name: string; count: number; covers: SavedItem[] }) {
  return (
    <Link href={href} aria-label={`${name}, ${saves(count)}`} className="group block text-ink no-underline">
      <span className="block transition-transform group-hover:scale-[1.01] motion-reduce:transition-none"><SavedCover items={covers} /></span>
      <span className="mt-2 block truncate text-[15px] font-bold">{name}</span>
      <span className="block text-[12px] text-subtle">{saves(count)}</span>
    </Link>
  );
}

/** Step one of a new collection: name it. (Picking saves to add comes next.) */
function NewCollectionForm({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = name.replace(/\s+/g, ' ').trim();
  useSheetDirty(Boolean(clean));
  const next = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const c = await createCollection({ name: clean });
      void client.invalidateQueries({ queryKey: getGetSavedOverviewQueryKey() });
      void client.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
      toast({ title: `Created ${c.name}` });
      onClose();
      setLocation(`/saved/${c.id}`);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setError(status === 429 ? "That's a lot for one hour. Try again later." : "That didn't work. Try again.");
      setBusy(false);
    }
  };
  return (
    <form onSubmit={next} className="space-y-4">
      <h2 className="font-display text-[24px] tracking-[-.04em]">New collection</h2>
      <label className="block">
        <span className="sr-only">Collection name</span>
        <input data-autofocus value={name} onChange={e => { setName(e.target.value.slice(0, 40)); setError(null); }} maxLength={40}
          placeholder="Name it, e.g. Winter coats" className="field" />
      </label>
      <p className="flex items-center gap-1.5 text-[13px] text-subtle"><Lock size={13} aria-hidden="true" />Collections are private. Only you see them.</p>
      {error && <p role="alert" className="text-sm font-semibold text-red-ink">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-line min-h-[48px]">Cancel</button>
        <button type="submit" disabled={!clean || busy} className="btn btn-primary min-h-[48px] disabled:opacity-50">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}Next
        </button>
      </div>
    </form>
  );
}

/** Saved (owner's Saved brief): All posts first, then your collections, Instagram style. Private to you. */
export function SavedPage() {
  useEffect(() => { document.title = 'Saved · Seams Club'; }, []);
  const overview = useGetSavedOverview({ query: { staleTime: 0 } });
  const [creating, setCreating] = useState(false);
  const o = overview.data;
  return (
    <div className="mx-auto max-w-[1232px] md:rounded-[30px] md:bg-white md:p-8">
      <div className="mb-4 flex items-center gap-3 md:mb-6">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-subtle md:text-[14px]">
          <Lock size={13} aria-hidden="true" className="shrink-0" />
          <span>Only you can see what you've saved{o ? <span className="hidden md:inline"> · {saves(o.total)}</span> : null}</span>
        </p>
        <button type="button" onClick={() => setCreating(true)} aria-label="New collection"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-yellow text-ink md:hidden"><Plus size={20} aria-hidden="true" /></button>
        <button type="button" onClick={() => setCreating(true)} className="hidden min-h-[44px] items-center gap-2 rounded-full bg-yellow px-5 text-[15px] font-bold text-ink md:inline-flex">
          <Plus size={17} aria-hidden="true" />New collection
        </button>
      </div>
      {overview.isLoading
        ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin" aria-label="Loading saves" /></div>
        : overview.isError || !o
          ? <ErrorState retry={() => overview.refetch()} />
          : (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-5 md:gap-y-7">
              <li><CollectionTile href="/saved/all" name="All posts" count={o.all.count} covers={o.all.covers} /></li>
              {o.collections.map(c => <li key={c.id}><CollectionTile href={`/saved/${c.id}`} name={c.name} count={c.count} covers={c.covers} /></li>)}
            </ul>
          )}
      {o && o.total === 0 && (
        <div className="mt-8 grid place-items-center rounded-[30px] bg-white px-6 py-12 text-center md:bg-canvas">
          <Bookmark size={28} aria-hidden="true" />
          <p className="mt-3 font-display text-xl tracking-[-.03em]">Nothing saved yet</p>
          <p className="mt-1 max-w-sm text-sm text-subtle">Long-press anything on Explore and choose Save, or tap the bookmark on a post.</p>
          <Link href="/explore" className="btn btn-primary mt-5">Go to Explore</Link>
        </div>
      )}
      {creating && <Sheet label="New collection" onClose={() => setCreating(false)}><NewCollectionForm onClose={() => setCreating(false)} /></Sheet>}
    </div>
  );
}

/** All posts until the collection pages land (step 3): the saved posts list that /saved used to be. */
export function SavedPostsPage() {
  useEffect(() => { document.title = 'Saved · Seams Club'; }, []);
  return (
    <div className="mx-auto max-w-[600px]">
      <Link href="/saved" className="mb-3 inline-flex min-h-[44px] items-center text-sm font-bold text-ink">← Saved</Link>
      <FeedList
        queryKey={FEED_KEYS.saved}
        fetchPage={cursor => getSavedPosts(cursor ? { cursor } : undefined)}
        empty={<p className="rounded-[30px] bg-white px-6 py-14 text-center text-subtle">Nothing saved yet.</p>}
      />
    </div>
  );
}

/** A collection, until its page lands in step 3. */
export function SavedCollectionPlaceholder() {
  return (
    <div className="mx-auto max-w-[600px]">
      <Link href="/saved" className="mb-3 inline-flex min-h-[44px] items-center text-sm font-bold text-ink">← Saved</Link>
      <p className="rounded-[30px] bg-white px-6 py-14 text-center text-subtle">Collection pages open in the next step.</p>
    </div>
  );
}
