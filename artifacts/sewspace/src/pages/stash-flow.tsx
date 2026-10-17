import { useEffect, useState } from 'react';
import { useSearch } from 'wouter';
import { useListFabrics, useListPatterns, useListThreads } from '@workspace/api-client-react';
import { Loading } from '@/components/common';
import { StashFlow, type StashItem } from '@/components/stash-flow/StashFlow';
import type { StashKind } from '@/components/stash-flow/parts';
import NotFound from '@/pages/not-found';

const KINDS: StashKind[] = ['fabric', 'thread', 'pattern'];
const asKind = (v: string | null | undefined): StashKind | null => (KINDS as string[]).includes(v ?? '') ? v as StashKind : null;

/** /stash/new (?kind=fabric|thread|pattern preselects the kind). */
export function NewStashPage() {
  const kind = asKind(new URLSearchParams(useSearch()).get('kind'));
  const [run, setRun] = useState(0);
  useEffect(() => { document.title = 'Add to stash · Seams Club'; }, []);
  return <StashFlow key={`${run}-${kind}`} initialKind={kind} onRestart={() => setRun(r => r + 1)} />;
}

/** /stash/:kind/:id/edit: the same flow opening at Details. Studio lists only hold your own rows. */
export function EditStashPage({ kind: rawKind, id }: { kind: string; id: number }) {
  const kind = asKind(rawKind);
  const fabrics = useListFabrics(undefined, { query: { enabled: kind === 'fabric', staleTime: Infinity } });
  const threads = useListThreads(undefined, { query: { enabled: kind === 'thread', staleTime: Infinity } });
  const patterns = useListPatterns(undefined, { query: { enabled: kind === 'pattern', staleTime: Infinity } });
  useEffect(() => { document.title = 'Edit stash item · Seams Club'; }, []);
  const q = kind === 'fabric' ? fabrics : kind === 'thread' ? threads : patterns;
  if (!kind) return <NotFound embedded />;
  if (q.isLoading) return <Loading />;
  const editing: StashItem | null = kind === 'fabric' ? wrap('fabric', fabrics.data?.find(x => x.id === id))
    : kind === 'thread' ? wrap('thread', threads.data?.find(x => x.id === id))
      : wrap('pattern', patterns.data?.find(x => x.id === id));
  if (!editing) return <NotFound embedded />;
  return <StashFlow key={`${kind}-${id}`} editing={editing} />;
}

function wrap<K extends StashItem['kind']>(kind: K, item: Extract<StashItem, { kind: K }>['item'] | undefined): StashItem | null {
  return item ? ({ kind, item } as StashItem) : null;
}
