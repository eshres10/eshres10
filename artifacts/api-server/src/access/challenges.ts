import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import {
  challengeEntriesTable,
  challengeMembersTable,
  challengesTable,
  followsTable,
  likesTable,
  postsTable,
  profilesTable,
  publicProfilesView,
  type Challenge,
  type Tx,
} from "@workspace/db";
import { FEED_PAGE_SIZE, hydratePosts, type FeedPostView } from "./posts";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Challenges: a host starts a hashtag challenge with dates and rules; people
// join and enter their own public posts while it runs; the host can remove
// entries. Challenges are public, except across a block with the host.
// Entries follow their post (visibleTo) and disappear for others once removed.

export const CHALLENGES_PER_DAY = 3;
export const MAX_CHALLENGE_DAYS = 92;
const TAG = /^[A-Za-z0-9]{3,30}$/;

type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };
export type ChallengeStatus = "upcoming" | "active" | "ended";

export function challengeStatus(c: Pick<Challenge, "startsAt" | "endsAt">, now = new Date()): ChallengeStatus {
  if (now < c.startsAt) return "upcoming";
  if (now > c.endsAt) return "ended";
  return "active";
}

/** Challenges whose host and viewer haven't blocked each other (RLS checks the same). */
function notBlockedHost(viewer: Viewer): SQL | undefined {
  return viewer.userId ? sql`NOT sewspace_blocked_with(${challengesTable.createdBy})` : undefined;
}

async function findChallenge(db: Tx, viewer: Viewer, slug: string): Promise<Challenge | null> {
  const [row] = await db.select().from(challengesTable).where(and(eq(challengesTable.slug, slug.toLowerCase()), notBlockedHost(viewer))).limit(1);
  return row ?? null;
}

export interface ChallengeSummaryView {
  slug: string;
  tag: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  status: ChallengeStatus;
  host: { handle: string; name: string; avatarUrl: string | null };
  members: number;
  entries: number;
  joinedByMe: boolean;
}

async function summaries(db: Tx, viewer: Viewer, rows: Challenge[]): Promise<ChallengeSummaryView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const hosts = await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, [...new Set(rows.map((r) => r.createdBy))]));
  const counts = await db.execute<{ challenge_id: number; members: string; entries: string }>(
    sql`SELECT challenge_id, members, entries FROM sewspace_challenge_counts(${`{${ids.join(",")}}`}::integer[])`,
  );
  const mine = viewer.userId
    ? await db.select({ id: challengeMembersTable.challengeId }).from(challengeMembersTable)
        .where(and(eq(challengeMembersTable.userId, viewer.userId), inArray(challengeMembersTable.challengeId, ids)))
    : [];
  const hostMap = new Map(hosts.map((h) => [h.userId, h]));
  const countMap = new Map(counts.rows.map((c) => [Number(c.challenge_id), c]));
  const joined = new Set(mine.map((m) => m.id));
  const now = new Date();
  return rows.flatMap((c) => {
    const host = hostMap.get(c.createdBy);
    if (!host) return [];
    return [{
      slug: c.slug,
      tag: c.tag,
      title: c.title,
      description: c.description,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status: challengeStatus(c, now),
      host: { handle: host.handle, name: host.name, avatarUrl: host.avatarUrl },
      members: Number(countMap.get(c.id)?.members ?? 0),
      entries: Number(countMap.get(c.id)?.entries ?? 0),
      joinedByMe: joined.has(c.id),
    }];
  });
}

export async function listChallenges(db: Tx, viewer: Viewer, status: ChallengeStatus = "active") {
  const now = new Date();
  const [where, order] =
    status === "upcoming" ? [gt(challengesTable.startsAt, now), asc(challengesTable.startsAt)]
    : status === "ended" ? [lt(challengesTable.endsAt, now), desc(challengesTable.endsAt)]
    : [and(lte(challengesTable.startsAt, now), gte(challengesTable.endsAt, now)), asc(challengesTable.endsAt)];
  const rows = await db.select().from(challengesTable).where(and(where, notBlockedHost(viewer))).orderBy(order).limit(50);
  return summaries(db, viewer, rows);
}

/** Running challenges the viewer joined (for picking one when posting). */
export async function listJoinedChallenges(db: Tx, viewer: Viewer) {
  if (!viewer.userId) return [];
  const now = new Date();
  const rows = await db
    .select({ c: challengesTable })
    .from(challengesTable)
    .innerJoin(challengeMembersTable, and(eq(challengeMembersTable.challengeId, challengesTable.id), eq(challengeMembersTable.userId, viewer.userId)))
    .where(and(lte(challengesTable.startsAt, now), gte(challengesTable.endsAt, now), notBlockedHost(viewer)))
    .orderBy(asc(challengesTable.endsAt));
  return summaries(db, viewer, rows.map((r) => r.c));
}

export type ChallengeView = ChallengeSummaryView & { rules: string; isHost: boolean };

async function challengeView(db: Tx, viewer: Viewer, c: Challenge): Promise<ChallengeView | null> {
  const [summary] = await summaries(db, viewer, [c]);
  return summary ? { ...summary, rules: c.rules, isHost: c.createdBy === viewer.userId } : null;
}

export async function getChallengePage(db: Tx, viewer: Viewer, slug: string) {
  const c = await findChallenge(db, viewer, slug);
  const challenge = c ? await challengeView(db, viewer, c) : null;
  if (!c || !challenge) return null;
  // The view hides people on the other side of a block.
  const memberPreview = await db
    .select({ handle: publicProfilesView.handle, name: publicProfilesView.name, avatarUrl: publicProfilesView.avatarUrl })
    .from(challengeMembersTable)
    .innerJoin(publicProfilesView, eq(publicProfilesView.userId, challengeMembersTable.userId))
    .where(eq(challengeMembersTable.challengeId, c.id))
    .orderBy(desc(challengeMembersTable.joinedAt))
    .limit(8);
  return { challenge, memberPreview };
}

export type EntrySort = "liked" | "newest" | "following";
export interface EntryView { entryId: number; post: FeedPostView; canRemove: boolean; isMine: boolean }

/** Live entries the viewer may see. Offset cursor ("o:<n>"), as likes change between pages. */
export async function listEntries(db: Tx, viewer: Viewer, slug: string, sort: EntrySort = "liked", cursor?: string) {
  const c = await findChallenge(db, viewer, slug);
  if (!c) return null;
  const offset = Math.min(Number(/^o:(\d+)$/.exec(Buffer.from(cursor ?? "", "base64url").toString("utf8"))?.[1] ?? 0), 2000);
  const filters: Array<SQL | undefined> = [eq(challengeEntriesTable.challengeId, c.id), isNull(challengeEntriesTable.removedAt), visibleTo(postsTable, viewer)];
  if (sort === "following") {
    if (!viewer.userId) return { items: [], nextCursor: null };
    filters.push(sql`${postsTable.userId} IN (SELECT ${followsTable.followeeId} FROM ${followsTable} WHERE ${followsTable.followerId} = ${viewer.userId})`);
  }
  const likes = sql`(SELECT count(*) FROM ${likesTable} WHERE ${likesTable.postId} = ${postsTable.id})`;
  const rows = await db
    .select({ entry: challengeEntriesTable, post: postsTable })
    .from(challengeEntriesTable)
    .innerJoin(postsTable, eq(postsTable.id, challengeEntriesTable.postId))
    .where(and(...filters))
    .orderBy(...(sort === "liked" ? [desc(likes)] : []), desc(challengeEntriesTable.createdAt), desc(challengeEntriesTable.id))
    .limit(FEED_PAGE_SIZE + 1)
    .offset(offset);
  const shown = rows.slice(0, FEED_PAGE_SIZE);
  const posts = new Map((await hydratePosts(db, viewer, shown.map((r) => r.post))).map((p) => [p.id, p]));
  const isHost = viewer.userId !== null && c.createdBy === viewer.userId;
  const items: EntryView[] = shown.flatMap(({ entry }) => {
    const post = posts.get(entry.postId);
    if (!post) return [];
    const isMine = entry.userId === viewer.userId;
    return [{ entryId: entry.id, post, canRemove: isHost && !isMine, isMine }];
  });
  return { items, nextCursor: rows.length > FEED_PAGE_SIZE ? Buffer.from(`o:${offset + FEED_PAGE_SIZE}`).toString("base64url") : null };
}

/** How many challenges someone has a live entry in that the viewer can see. */
export async function challengesEntered(db: Tx, viewer: Viewer, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(DISTINCT ${challengeEntriesTable.challengeId})::int` })
    .from(challengeEntriesTable)
    .innerJoin(postsTable, eq(postsTable.id, challengeEntriesTable.postId))
    .innerJoin(challengesTable, eq(challengesTable.id, challengeEntriesTable.challengeId))
    .where(and(eq(challengeEntriesTable.userId, userId), isNull(challengeEntriesTable.removedAt), visibleTo(postsTable, viewer), notBlockedHost(viewer)));
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ writing

async function hasHandle(db: Tx, userId: string): Promise<boolean> {
  const [me] = await db.select({ handle: profilesTable.handle }).from(profilesTable).where(eq(profilesTable.userId, userId));
  return Boolean(me?.handle);
}

export interface ChallengeInput { tag: string; title: string; description?: string; rules?: string; startsAt: Date | string; endsAt: Date | string }
type CreateError = "no_handle" | "bad_tag" | "bad_dates" | "taken" | "rate_limited";

export async function createChallenge(db: Tx, viewer: Viewer, input: ChallengeInput): Promise<Ok<ChallengeView> | Fail<CreateError>> {
  const me = viewer.userId;
  if (!me || !(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const tag = input.tag.trim().replace(/^#/, "");
  if (!TAG.test(tag)) return { ok: false, error: "bad_tag" };
  const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
  const now = Date.now();
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt
    || endsAt.getTime() - startsAt.getTime() > MAX_CHALLENGE_DAYS * 86400_000
    || endsAt.getTime() <= now || startsAt.getTime() < now - 86400_000) {
    return { ok: false, error: "bad_dates" };
  }
  const [{ recent }] = await db.select({ recent: count() }).from(challengesTable)
    .where(and(eq(challengesTable.createdBy, me), gt(challengesTable.createdAt, new Date(now - 86400_000))));
  if (recent >= CHALLENGES_PER_DAY) return { ok: false, error: "rate_limited" };
  const [row] = await db.insert(challengesTable).values({
    slug: tag.toLowerCase(),
    tag,
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    rules: (input.rules ?? "").trim(),
    startsAt,
    endsAt,
    createdBy: me,
  }).onConflictDoNothing().returning();
  if (!row) return { ok: false, error: "taken" };
  // The host is a member of their own challenge.
  await db.insert(challengeMembersTable).values({ challengeId: row.id, userId: me }).onConflictDoNothing();
  return { ok: true, value: (await challengeView(db, viewer, row))! };
}

export async function updateChallenge(db: Tx, viewer: Viewer, slug: string, input: { title?: string; description?: string; rules?: string }): Promise<ChallengeView | null> {
  const c = await findChallenge(db, viewer, slug);
  if (!c || !viewer.userId || c.createdBy !== viewer.userId) return null;
  const set: Partial<Pick<Challenge, "title" | "description" | "rules">> & { updatedAt: Date } = { updatedAt: new Date() };
  if (input.title !== undefined) set.title = input.title.trim();
  if (input.description !== undefined) set.description = input.description.trim();
  if (input.rules !== undefined) set.rules = input.rules.trim();
  const [row] = await db.update(challengesTable).set(set).where(eq(challengesTable.id, c.id)).returning();
  return row ? challengeView(db, viewer, row) : null;
}

async function memberCount(db: Tx, challengeId: number): Promise<number> {
  const r = await db.execute<{ members: string }>(sql`SELECT members FROM sewspace_challenge_counts(${`{${challengeId}}`}::integer[])`);
  return Number(r.rows[0]?.members ?? 0);
}

export async function setMembership(db: Tx, viewer: Viewer, slug: string, on: boolean): Promise<Ok<{ joined: boolean; members: number }> | Fail<"not_found" | "ended">> {
  const me = viewer.userId;
  const c = me ? await findChallenge(db, viewer, slug) : null;
  if (!me || !c) return { ok: false, error: "not_found" };
  if (on) {
    if (challengeStatus(c) === "ended") return { ok: false, error: "ended" };
    await db.insert(challengeMembersTable).values({ challengeId: c.id, userId: me }).onConflictDoNothing();
  } else {
    await db.delete(challengeMembersTable).where(and(eq(challengeMembersTable.challengeId, c.id), eq(challengeMembersTable.userId, me)));
  }
  return { ok: true, value: { joined: on, members: await memberCount(db, c.id) } };
}

type EnterError = "not_found" | "not_running" | "bad_post" | "removed" | "already";

/** Enter one of your own public posts in a running challenge; joins you if needed. */
export async function enterChallenge(db: Tx, viewer: Viewer, slug: string, postId: number): Promise<Ok<EntryView> | Fail<EnterError>> {
  const me = viewer.userId;
  const c = me ? await findChallenge(db, viewer, slug) : null;
  if (!me || !c) return { ok: false, error: "not_found" };
  if (challengeStatus(c) !== "active") return { ok: false, error: "not_running" };
  const [post] = await db.select().from(postsTable).where(and(eq(postsTable.id, postId), eq(postsTable.userId, me), eq(postsTable.visibility, "public")));
  if (!post) return { ok: false, error: "bad_post" };
  const [existing] = await db.select().from(challengeEntriesTable)
    .where(and(eq(challengeEntriesTable.challengeId, c.id), eq(challengeEntriesTable.postId, postId)));
  if (existing) return { ok: false, error: existing.removedAt ? "removed" : "already" };
  await db.insert(challengeMembersTable).values({ challengeId: c.id, userId: me }).onConflictDoNothing();
  const [entry] = await db.insert(challengeEntriesTable).values({ challengeId: c.id, postId, userId: me }).returning();
  const [view] = await hydratePosts(db, viewer, [post]);
  return { ok: true, value: { entryId: entry.id, post: view, canRemove: false, isMine: true } };
}

/** Withdraw your own entry, or (as the host) remove someone else's. */
export async function deleteEntry(db: Tx, viewer: Viewer, entryId: number): Promise<boolean> {
  const me = viewer.userId;
  if (!me) return false;
  const [row] = await db
    .select({ entry: challengeEntriesTable, host: challengesTable.createdBy })
    .from(challengeEntriesTable)
    .innerJoin(challengesTable, eq(challengesTable.id, challengeEntriesTable.challengeId))
    .where(eq(challengeEntriesTable.id, entryId));
  if (!row || row.entry.removedAt) return false;
  if (row.entry.userId === me) {
    const gone = await db.delete(challengeEntriesTable).where(and(eq(challengeEntriesTable.id, entryId), eq(challengeEntriesTable.userId, me))).returning({ id: challengeEntriesTable.id });
    return gone.length > 0;
  }
  if (row.host !== me) return false;
  const removed = await db.update(challengeEntriesTable).set({ removedAt: new Date(), removedBy: me })
    .where(and(eq(challengeEntriesTable.id, entryId), ne(challengeEntriesTable.userId, me))).returning({ id: challengeEntriesTable.id });
  return removed.length > 0;
}

/** A challenge the viewer can see, for reports. */
export async function visibleChallenge(db: Tx, viewer: Viewer, slug: string) {
  return findChallenge(db, viewer, slug);
}

/** Challenges for the sitemap. */
export async function listChallengesForSitemap(db: Tx, limit = 20000) {
  return db.select({ slug: challengesTable.slug, updatedAt: challengesTable.updatedAt }).from(challengesTable).orderBy(desc(challengesTable.id)).limit(limit);
}
