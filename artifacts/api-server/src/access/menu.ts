import { and, count, eq, gte, lte } from "drizzle-orm";
import { challengeMembersTable, challengesTable, postsTable, savesTable, type Tx } from "@workspace/db";
import { notBlockedHost } from "./challenges";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Phase M: the numbers on the account menu. Everything here is about the
// signed-in caller only, read in their own transaction (RLS underneath).

/** Pattern selling (the marketplace) hasn't opened: no sales, no Pattern sales row. */
export const SELLING_OPEN = false;
/** There's no membership yet: no Support Seams Club row. */
export const MEMBERSHIP_OPEN = false;

export type MenuSummary = { savedCount: number; activeChallengeCount: number; salesLast24h: number | null; isSupporter: boolean; membershipAvailable: boolean };

export async function menuSummary(db: Tx, viewer: Viewer): Promise<MenuSummary> {
  const me = viewer.userId;
  if (!me) throw new Error("menuSummary needs a signed-in viewer");
  // Saves of posts you may still see, as on the Saved page.
  const [saved] = await db.select({ n: count() }).from(savesTable)
    .innerJoin(postsTable, eq(postsTable.id, savesTable.postId))
    .where(and(eq(savesTable.userId, me), visibleTo(postsTable, viewer)));
  // Running challenges you've joined (not across a block with the host).
  const now = new Date();
  const [active] = await db.select({ n: count() }).from(challengeMembersTable)
    .innerJoin(challengesTable, eq(challengesTable.id, challengeMembersTable.challengeId))
    .where(and(eq(challengeMembersTable.userId, me), lte(challengesTable.startsAt, now), gte(challengesTable.endsAt, now), notBlockedHost(viewer)));
  return {
    savedCount: saved?.n ?? 0,
    activeChallengeCount: active?.n ?? 0,
    salesLast24h: SELLING_OPEN ? 0 : null,
    isSupporter: false,
    membershipAvailable: MEMBERSHIP_OPEN,
  };
}
