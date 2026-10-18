import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import {
  catalogTable,
  challengeEntriesTable,
  challengesTable,
  forumTopicsTable,
  likesTable,
  mediaTable,
  postMediaTable,
  postsTable,
  publicProfilesView,
  type ExploreItemType,
  type PostFabric,
  type PostGarment,
  type Tx,
} from "@workspace/db";
import { entryViews } from "./catalog";
import { collectedKeys } from "./collections";
import { challengeSummaries, notBlockedHost } from "./challenges";
import { hydratePosts, mediaView, type MediaView } from "./posts";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Explore (owner-approved plan): one browse page mixing photo and words
// (status) posts, fabric posts, pattern pages, challenges and forum threads. Every list repeats the
// rules of its own kind: posts through visibleTo (signed out = public only,
// followers-only for followers, blocks either way), pattern pages are public,
// challenges and threads hide anyone across a block. Things you hid ("see
// less") are left out. Offset cursors ("o:<n>"), 30 a page.

export const EXPLORE_PAGE = 30;
const MAX_OFFSET = 3000;

export const EXPLORE_TABS = ["explore", "forum", "challenges", "patterns", "fabric"] as const;
export type ExploreTab = (typeof EXPLORE_TABS)[number];
const GARMENT_SUBS = ["for-you", "dresses", "tops", "bottoms", "outerwear", "bags", "upcycle"] as const;
export const EXPLORE_SUBS: Record<ExploreTab, readonly string[]> = {
  // Words = status posts only (owner); every other post filter shows both kinds.
  explore: [...GARMENT_SUBS, "words"],
  patterns: GARMENT_SUBS,
  forum: ["all", "fitting", "pattern-help", "fabric", "machines", "show-tell"],
  challenges: ["all", "running", "soon", "finished"],
  fabric: ["all", "linen", "cotton", "satin", "viscose", "crepe", "hauls"],
};
/** Upcycle has no field of its own: public posts using one of these hashtags. */
export const UPCYCLE_TAGS = ["upcycle", "refashion", "thrifted"];
/** Pattern page categories behind each garment filter (Upcycle has none). */
const PATTERN_CATEGORIES: Record<string, string[]> = {
  dresses: ["dresses"], tops: ["tops"], bottoms: ["trousers", "skirts"], outerwear: ["outerwear"], bags: ["bags"], upcycle: [],
};
const FABRIC_LABEL: Record<PostFabric, string> = { linen: "Linen", cotton: "Cotton", satin: "Satin", viscose: "Viscose", crepe: "Crepe", haul: "Fabric haul" };
/** "For you" boosts, in hours of recency: someone you follow, a garment you saved or asked for more of. */
const FOLLOW_BOOST_HOURS = 72;
const GARMENT_BOOST_HOURS = 24;

type Person = { handle: string; name: string; avatarUrl: string | null };
export interface ExploreCardView {
  type: ExploreItemType;
  key: string;
  itemId: number;
  saved: boolean;
  /** `photo` is null for a words (status) post. */
  post: { id: number; caption: string; photo: MediaView | null; author: Person; chip: string | null; savedByMe: boolean } | null;
  pattern: {
    id: number; slug: string; name: string; designer: string; category: string; rating: number | null; makes: number;
    free: boolean; priceCents: number | null; currency: string | null; coverImageUrl: string | null;
  } | null;
  challenge: {
    slug: string; tag: string; title: string; status: "upcoming" | "active" | "ended"; startsAt: Date; endsAt: Date;
    members: number; entries: number; cover: MediaView | null;
  } | null;
  thread: { id: number; board: string; kind: string; title: string; excerpt: string; author: Person; replies: number } | null;
}
export interface ExploreCardsPage { items: ExploreCardView[]; nextCursor: string | null; total: number }

const empty = { post: null, pattern: null, challenge: null, thread: null };

function offsetOf(cursor: string | undefined): number {
  const n = Number(/^o:(\d+)$/.exec(Buffer.from(cursor ?? "", "base64url").toString("utf8"))?.[1] ?? 0);
  return Math.min(n, MAX_OFFSET);
}
function nextCursor(offset: number, fetched: number): string | null {
  const next = offset + EXPLORE_PAGE;
  return fetched > EXPLORE_PAGE && next < MAX_OFFSET ? Buffer.from(`o:${next}`).toString("base64url") : null;
}
function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
/** Leaves out what the viewer hid ("see less"). */
function notHidden(viewer: Viewer, type: ExploreItemType, id: SQL | typeof postsTable.id): SQL | undefined {
  if (!viewer.userId) return undefined;
  return sql`NOT EXISTS (SELECT 1 FROM sewspace_discover_feedback f WHERE f.user_id = ${viewer.userId} AND f.item_type = ${type} AND f.item_id = ${id} AND f.kind = 'see_less')`;
}

export function parseExplore(tab: string | undefined, sub: string | undefined): { tab: ExploreTab; sub: string } {
  const t = (EXPLORE_TABS as readonly string[]).includes(tab ?? "") ? (tab as ExploreTab) : "explore";
  const s = EXPLORE_SUBS[t].includes(sub ?? "") ? sub! : EXPLORE_SUBS[t][0];
  return { tab: t, sub: s };
}

export async function exploreCards(db: Tx, viewer: Viewer, tabIn?: string, subIn?: string, cursor?: string): Promise<ExploreCardsPage> {
  const { tab, sub } = parseExplore(tabIn, subIn);
  const offset = offsetOf(cursor);
  const page = tab === "forum" ? await threadCards(db, viewer, sub, offset)
    : tab === "challenges" ? await challengeCards(db, viewer, sub, offset)
    : tab === "patterns" ? await patternCards(db, viewer, sub, offset)
    : await postCards(db, viewer, tab, sub, offset);
  // "Saved" badge: in one of your collections (or a post you saved / a page you hearted).
  const collected = await collectedKeys(db, viewer, page.items.map((c) => ({ type: c.type, id: c.itemId })));
  for (const card of page.items) card.saved ||= collected.has(`${card.type}-${card.itemId}`);
  return page;
}

// ------------------------------------------------------------------ posts

/** Garments of posts the viewer saved, collected or asked for more of (only posts they may still see). */
async function likedGarments(db: Tx, viewer: Viewer): Promise<string[]> {
  if (!viewer.userId) return [];
  const me = viewer.userId;
  const rows = await db.selectDistinct({ g: postsTable.garment }).from(postsTable).where(and(
    isNotNull(postsTable.garment),
    visibleTo(postsTable, viewer),
    sql`(${postsTable.id} IN (SELECT post_id FROM sewspace_saves WHERE user_id = ${me})
      OR ${postsTable.id} IN (SELECT item_id FROM sewspace_collection_items WHERE user_id = ${me} AND item_type = 'post')
      OR ${postsTable.id} IN (SELECT item_id FROM sewspace_discover_feedback WHERE user_id = ${me} AND item_type = 'post' AND kind = 'more_like'))`,
  ));
  return rows.map((r) => r.g!).filter(Boolean);
}

async function postCards(db: Tx, viewer: Viewer, tab: "explore" | "fabric", sub: string, offset: number): Promise<ExploreCardsPage> {
  const filters: Array<SQL | undefined> = [
    // Photo posts with a photo, and words posts with something to read.
    sub === "words"
      ? and(eq(postsTable.kind, "status"), sql`btrim(${postsTable.caption}) <> ''`)
      : sql`((${postsTable.kind} = 'photo' AND EXISTS (SELECT 1 FROM ${postMediaTable} WHERE ${postMediaTable.postId} = ${postsTable.id}))
        OR (${postsTable.kind} = 'status' AND btrim(${postsTable.caption}) <> ''))`,
    sql`EXISTS (SELECT 1 FROM ${publicProfilesView} WHERE ${publicProfilesView.userId} = ${postsTable.userId})`,
    visibleTo(postsTable, viewer),
    notHidden(viewer, "post", postsTable.id),
  ];
  if (tab === "fabric") {
    filters.push(isNotNull(postsTable.fabric));
    if (sub !== "all") filters.push(eq(postsTable.fabric, (sub === "hauls" ? "haul" : sub) as PostFabric));
  } else if (sub === "upcycle") {
    filters.push(sql`EXISTS (SELECT 1 FROM sewspace_post_hashtags ph JOIN sewspace_hashtags h ON h.id = ph.hashtag_id
      WHERE ph.post_id = ${postsTable.id} AND h.tag IN (${sql.join(UPCYCLE_TAGS.map((t) => sql`${t}`), sql`, `)}))`);
  } else if (sub !== "for-you" && sub !== "words") {
    filters.push(eq(postsTable.garment, sub as PostGarment));
  }
  const where = and(...filters);
  const [{ n }] = await db.select({ n: count() }).from(postsTable).where(where);

  // "For you" (signed in): newest first, lifted for people you follow and garments you like.
  let order: SQL[] = [desc(postsTable.createdAt), desc(postsTable.id)];
  if (tab === "explore" && sub === "for-you" && viewer.userId) {
    const garments = await likedGarments(db, viewer);
    const followed = sql`CASE WHEN ${postsTable.userId} IN (SELECT followee_id FROM sewspace_follows WHERE follower_id = ${viewer.userId}) THEN ${FOLLOW_BOOST_HOURS} ELSE 0 END`;
    const liked = garments.length
      ? sql`CASE WHEN ${postsTable.garment} IN (${sql.join(garments.map((g) => sql`${g}`), sql`, `)}) THEN ${GARMENT_BOOST_HOURS} ELSE 0 END`
      : sql`0`;
    order = [sql`extract(epoch FROM ${postsTable.createdAt}) / 3600 + ${followed} + ${liked} DESC`, desc(postsTable.id)];
  }
  const rows = await db.select().from(postsTable).where(where).orderBy(...order).limit(EXPLORE_PAGE + 1).offset(offset);
  const posts = await hydratePosts(db, viewer, rows.slice(0, EXPLORE_PAGE));
  const items: ExploreCardView[] = posts.flatMap((p) => {
    const photo = p.media[0] ?? null;
    if (!photo && p.kind !== "status") return [];
    const pattern = p.tags.find((t) => t.kind === "pattern");
    const chip = p.fabric ? FABRIC_LABEL[p.fabric] : pattern ? `Pattern: ${pattern.name}` : null;
    return [{ ...empty, type: "post", key: `post-${p.id}`, itemId: p.id, saved: p.savedByMe, post: { id: p.id, caption: p.caption, photo, author: p.author, chip, savedByMe: p.savedByMe } }];
  });
  return { items, nextCursor: nextCursor(offset, rows.length), total: n };
}

// ------------------------------------------------------------------ patterns

async function patternCards(db: Tx, viewer: Viewer, sub: string, offset: number): Promise<ExploreCardsPage> {
  const categories = sub === "for-you" ? null : PATTERN_CATEGORIES[sub] ?? [];
  if (categories && !categories.length) return { items: [], nextCursor: null, total: 0 };
  const where = and(
    eq(catalogTable.kind, "pattern"),
    categories ? inArray(catalogTable.category, categories) : undefined,
    notHidden(viewer, "pattern", sql`${catalogTable.id}`),
  );
  const [{ n }] = await db.select({ n: count() }).from(catalogTable).where(where);
  const rows = await db.select().from(catalogTable).where(where).orderBy(desc(catalogTable.createdAt), desc(catalogTable.id))
    .limit(EXPLORE_PAGE + 1).offset(offset);
  const views = await entryViews(db, viewer, rows.slice(0, EXPLORE_PAGE));
  const items: ExploreCardView[] = views.map((v) => ({
    ...empty,
    type: "pattern",
    key: `pattern-${v.id}`,
    itemId: v.id,
    saved: v.savedByMe,
    pattern: {
      id: v.id, slug: v.slug, name: v.name, designer: v.designer?.name || v.maker, category: v.category,
      rating: v.stats.rating, makes: v.stats.makes, free: v.source === "free", priceCents: v.priceCents, currency: v.currency,
      coverImageUrl: v.coverImageUrl,
    },
  }));
  return { items, nextCursor: nextCursor(offset, rows.length), total: n };
}

// ------------------------------------------------------------------ challenges

async function challengeCards(db: Tx, viewer: Viewer, sub: string, offset: number): Promise<ExploreCardsPage> {
  const now = new Date();
  const status = sub === "running"
    ? sql`${challengesTable.startsAt} <= ${now} AND ${challengesTable.endsAt} >= ${now}`
    : sub === "soon" ? sql`${challengesTable.startsAt} > ${now}`
    : sub === "finished" ? sql`${challengesTable.endsAt} < ${now}`
    : undefined;
  const where = and(status, notBlockedHost(viewer), notHidden(viewer, "challenge", sql`${challengesTable.id}`));
  const [{ n }] = await db.select({ n: count() }).from(challengesTable).where(where);
  // Running now (ending soonest first), then starting soon, then finished (latest first).
  const rank = sql`CASE WHEN ${challengesTable.startsAt} > ${now} THEN 1 WHEN ${challengesTable.endsAt} < ${now} THEN 2 ELSE 0 END`;
  const within = sql`CASE WHEN ${challengesTable.endsAt} < ${now} THEN -extract(epoch FROM ${challengesTable.endsAt})
    WHEN ${challengesTable.startsAt} > ${now} THEN extract(epoch FROM ${challengesTable.startsAt}) ELSE extract(epoch FROM ${challengesTable.endsAt}) END`;
  const rows = await db.select().from(challengesTable).where(where).orderBy(rank, within, asc(challengesTable.id))
    .limit(EXPLORE_PAGE + 1).offset(offset);
  const shown = rows.slice(0, EXPLORE_PAGE);
  const summaries = await challengeSummaries(db, viewer, shown);
  const covers = await challengeCovers(db, viewer, shown.map((c) => c.id));
  const idBySlug = new Map(shown.map((c) => [c.slug, c.id]));
  const items: ExploreCardView[] = summaries.map((c) => ({
    ...empty,
    type: "challenge",
    key: `challenge-${idBySlug.get(c.slug)}`,
    itemId: idBySlug.get(c.slug)!,
    saved: false,
    challenge: {
      slug: c.slug, tag: c.tag, title: c.title, status: c.status, startsAt: c.startsAt, endsAt: c.endsAt,
      members: c.members, entries: c.entries, cover: covers.get(idBySlug.get(c.slug)!) ?? null,
    },
  }));
  return { items, nextCursor: nextCursor(offset, rows.length), total: n };
}

/** Each challenge's most liked live entry photo the viewer may see (the post's first photo). */
async function challengeCovers(db: Tx, viewer: Viewer, ids: number[]): Promise<Map<number, MediaView>> {
  if (!ids.length) return new Map();
  const likes = sql`(SELECT count(*) FROM ${likesTable} WHERE ${likesTable.postId} = ${postsTable.id})`;
  const rows = await db.selectDistinctOn([challengeEntriesTable.challengeId], { challengeId: challengeEntriesTable.challengeId, media: mediaTable })
    .from(challengeEntriesTable)
    .innerJoin(postsTable, eq(postsTable.id, challengeEntriesTable.postId))
    .innerJoin(postMediaTable, and(eq(postMediaTable.postId, postsTable.id), eq(postMediaTable.position, 0)))
    .innerJoin(mediaTable, and(eq(mediaTable.id, postMediaTable.mediaId), eq(mediaTable.userId, postMediaTable.userId)))
    .where(and(inArray(challengeEntriesTable.challengeId, ids), isNull(challengeEntriesTable.removedAt), visibleTo(postsTable, viewer)))
    .orderBy(challengeEntriesTable.challengeId, desc(likes), desc(postsTable.id));
  return new Map(rows.map((r) => [r.challengeId, mediaView(r.media)]));
}

// ------------------------------------------------------------------ forum threads

const THREAD_FILTER: Record<string, SQL> = {
  fitting: eq(forumTopicsTable.board, "fitting"),
  "pattern-help": eq(forumTopicsTable.board, "patterns"),
  fabric: eq(forumTopicsTable.board, "fabric"),
  machines: eq(forumTopicsTable.board, "machines"),
  "show-tell": eq(forumTopicsTable.kind, "show_tell"),
};

async function threadCards(db: Tx, viewer: Viewer, sub: string, offset: number): Promise<ExploreCardsPage> {
  const where = and(
    THREAD_FILTER[sub],
    viewer.userId ? sql`NOT sewspace_blocked_with(${forumTopicsTable.userId})` : undefined,
    sql`EXISTS (SELECT 1 FROM ${publicProfilesView} WHERE ${publicProfilesView.userId} = ${forumTopicsTable.userId})`,
    notHidden(viewer, "thread", sql`${forumTopicsTable.id}`),
  );
  const [{ n }] = await db.select({ n: count() }).from(forumTopicsTable).where(where);
  const rows = await db.select().from(forumTopicsTable).where(where).orderBy(desc(forumTopicsTable.createdAt), desc(forumTopicsTable.id))
    .limit(EXPLORE_PAGE + 1).offset(offset);
  const shown = rows.slice(0, EXPLORE_PAGE);
  const authors = shown.length
    ? await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, [...new Set(shown.map((t) => t.userId))]))
    : [];
  const byUser = new Map(authors.map((a) => [a.userId, { handle: a.handle, name: a.name, avatarUrl: a.avatarUrl }]));
  const items: ExploreCardView[] = shown.flatMap((t) => {
    const author = byUser.get(t.userId);
    if (!author) return [];
    return [{
      ...empty,
      type: "thread" as const,
      key: `thread-${t.id}`,
      itemId: t.id,
      saved: false,
      thread: { id: t.id, board: t.board, kind: t.kind, title: t.title, excerpt: excerpt(t.body), author, replies: t.replyCount },
    }];
  });
  return { items, nextCursor: nextCursor(offset, rows.length), total: n };
}
