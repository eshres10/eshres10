// Query keys for paged feeds (useInfiniteQuery). Kept here so the composer and
// post actions can refresh every feed after a change.
export const FEED_KEYS = {
  home: ['feed', 'home'] as const,
  explore: (kind: string) => ['feed', 'explore', kind] as const,
  all: ['feed'] as const,
};
