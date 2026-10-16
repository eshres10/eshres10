// The single place that decides who can see what. Route handlers ask this
// module; the database's row-level security policies enforce the same rules a
// second time underneath (see lib/db/migrations and CLAUDE.md).
export * from "./viewer";
export * from "./handles";
export * from "./profiles";
export * from "./objects";
export * from "./studio";
