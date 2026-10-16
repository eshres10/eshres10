// Query keys for paged feeds (useInfiniteQuery). Kept here so the composer and
// post actions can refresh every feed after a change.
export const FEED_KEYS = {
  home: ['feed', 'home'] as const,
  explore: (kind: string, sort = 'recent') => ['feed', 'explore', kind, sort] as const,
  saved: ['feed', 'saved'] as const,
  all: ['feed'] as const,
};
