import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { followsTable, type Visibility } from "@workspace/db";
import type { Viewer } from "./viewer";

/** Anything with an owner and a visibility setting (makes, fabrics, threads, patterns). */
export interface Shareable {
  userId: PgColumn;
  visibility: PgColumn;
}

// The visibility rule. The database enforces the same rule again with
// row-level security (sewspace_can_view in migration 0002); keep them in step.
//   - owners always see their own rows; private rows are owner-only;
//   - if the viewer and the owner have blocked each other (either way): nothing;
//   - public rows: everyone, signed out included;
//   - followers-only rows: signed-in followers of the owner.
export function visibleTo(table: Shareable, viewer: Viewer): SQL {
  if (!viewer.userId) return eq(table.visibility, "public");
  const me = viewer.userId;
  const notBlocked = sql`NOT sewspace_blocked_with(${table.userId})`;
  const follows = sql`EXISTS (SELECT 1 FROM ${followsTable} WHERE ${followsTable.followerId} = ${me} AND ${followsTable.followeeId} = ${table.userId})`;
  return or(
    eq(table.userId, me),
    and(eq(table.visibility, "public"), notBlocked),
    and(eq(table.visibility, "followers"), notBlocked, follows),
  ) as SQL;
}

/** When an item first leaves "private", record the time (orders profile grids). */
export function publishedAtFor(previous: { visibility: string; publishedAt?: Date | null } | null, next: Visibility | undefined): Date | undefined {
  if (!next || next === "private") return undefined;
  if (previous?.publishedAt) return undefined;
  if (previous && previous.visibility !== "private") return undefined;
  return new Date();
}
