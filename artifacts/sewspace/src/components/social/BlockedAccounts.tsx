import { useQueryClient } from '@tanstack/react-query';
import { useListBlocks, useUnblockProfile } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { UserAvatar } from '@/components/avatar';

/** People you've blocked, with Unblock. Lives in settings; their profiles are hidden from you everywhere else. */
export function BlockedAccounts() {
  const client = useQueryClient();
  const blocks = useListBlocks();
  const unblock = useUnblockProfile();
  return (
    <section className="studio-card p-6 sm:p-8" aria-labelledby="blocked-title">
      <p id="blocked-title" className="eyebrow">Blocked accounts</p>
      <p className="mt-1 text-sm text-subtle">You and these people can't see each other's profiles, posts, makes or comments. They aren't told.</p>
      {blocks.isLoading
        ? <Loader2 className="mt-4 animate-spin" aria-label="Loading" />
        : !blocks.data?.length
          ? <p className="mt-4 text-sm">You haven't blocked anyone.</p>
          : (
            <ul className="mt-4 divide-y divide-line">
              {blocks.data.map(b => (
                <li key={b.handle} className="flex items-center gap-3 py-3">
                  <UserAvatar name={b.name} avatarUrl={b.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{b.name}</span>
                    <span className="block truncate text-xs text-subtle">@{b.handle}</span>
                  </span>
                  <button type="button" disabled={unblock.isPending && unblock.variables?.handle === b.handle} className="btn btn-line"
                    onClick={() => unblock.mutate({ handle: b.handle }, {
                      // The list, and everything they can now appear in again.
                      onSuccess: () => client.invalidateQueries(),
                    })}>
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}
