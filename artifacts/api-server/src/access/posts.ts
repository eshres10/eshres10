import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  challengeEntriesTable,
  challengesTable,
  fabricsTable,
  followsTable,
  likesTable,
  mediaTable,
  patternsTable,
  postMediaTable,
  postsTable,
  projectsTable,
  publicProfilesView,
  savesTable,
  type Post,
  type Tx,
} from "@workspace/db";
import { urlForObjectPath } from "./objects";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

export const FEED_PAGE_SIZE = 20;

export interface MediaView {
  id: number;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
}

export function mediaView(m: typeof mediaTable.$inferSelect): MediaView {
  return { id: m.id, url: urlForObjectPath(m.fullPath), thumbUrl: urlForObjectPath(m.thumbPath), width: m.width, height: m.height, color: m.color };
}

export interface FeedPostView {
  id: number;
  kind: "status" | "photo";
  caption: string;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  author: { handle: string; name: string; avatarUrl: string | null };
  isOwner: boolean;
  media: MediaView[];
  tags: Array<{ kind: "make" | "pattern" | "fabric"; id: number; name: string }>;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  challenges: Array<{ slug: string; tag: string }>;
}

// Cursors are opaque to clients: "<created_at ISO>|<id>" in base64url.
export function encodeCursor(post: { createdAt: Date; id: number }): string {
  return Buffer.from(`${post.createdAt.toISOString()}|${post.id}`).toString("base64url");
}
export function decodeCursor(cursor: string | undefined): { createdAt: Date; id: number } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso);
  const n = Number(id);
  if (Number.isNaN(createdAt.getTime()) || !Number.isInteger(n)) return null;
  return { createdAt, id: n };
}
function before(cursor: { createdAt: Date; id: number } | null): SQL | undefined {
  if (!cursor) return undefined;
  return or(lt(postsTable.createdAt, cursor.createdAt), and(eq(postsTable.createdAt, cursor.createdAt), lt(postsTable.id, cursor.id)));
}

// Attaches authors, photos and visible tags to posts the viewer may already
// see. Posts whose author has no handle are left out (they can't be linked).
export async function hydratePosts(db: Tx, viewer: Viewer, posts: Post[]): Promise<FeedPostView[]> {
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.userId))];
  // Sequential on purpose: a request transaction has a single connection.
  const authors = await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, authorIds));
  const media = await db
    .select({ postId: postMediaTable.postId, media: mediaTable })
    .from(postMediaTable)
    .innerJoin(mediaTable, eq(mediaTable.id, postMediaTable.mediaId))
    .where(and(inArray(postMediaTable.postId, ids), eq(mediaTable.userId, postMediaTable.userId)))
    .orderBy(asc(postMediaTable.position), asc(mediaTable.id));

  const tagIds = (key: "projectId" | "patternId" | "fabricId") => [...new Set(posts.map((p) => p[key]).filter((id): id is number => id !== null))];
  const makeIds = tagIds("projectId"), patternIds = tagIds("patternId"), fabricIds = tagIds("fabricId");
  const makes = makeIds.length
    ? await db.select({ id: projectsTable.id, name: projectsTable.name, userId: projectsTable.userId }).from(projectsTable)
        .where(and(inArray(projectsTable.id, makeIds), visibleTo(projectsTable, viewer)))
    : [];
  const patterns = patternIds.length
    ? await db.select({ id: patternsTable.id, name: patternsTable.name, userId: patternsTable.userId }).from(patternsTable)
        .where(and(inArray(patternsTable.id, patternIds), visibleTo(patternsTable, viewer)))
    : [];
  const fabrics = fabricIds.length
    ? await db.select({ id: fabricsTable.id, name: fabricsTable.name, userId: fabricsTable.userId }).from(fabricsTable)
        .where(and(inArray(fabricsTable.id, fabricIds), visibleTo(fabricsTable, viewer)))
    : [];
  // Like and comment counts (a function, as comments across a block aren't
  // counted), and the viewer's own likes and saves.
  const counts = await db.execute<{ post_id: number; likes: string; comments: string }>(
    sql`SELECT post_id, likes, comments FROM sewspace_post_counts(${`{${ids.join(",")}}`}::integer[])`,
  );
  const liked = viewer.userId
    ? await db.select({ postId: likesTable.postId }).from(likesTable).where(and(eq(likesTable.userId, viewer.userId), inArray(likesTable.postId, ids)))
    : [];
  const saved = viewer.userId
    ? await db.select({ postId: savesTable.postId }).from(savesTable).where(and(eq(savesTable.userId, viewer.userId), inArray(savesTable.postId, ids)))
    : [];
  // Challenges each post is a live entry in (the challenge must be visible too).
  const entries = await db
    .select({ postId: challengeEntriesTable.postId, slug: challengesTable.slug, tag: challengesTable.tag })
    .from(challengeEntriesTable)
    .innerJoin(challengesTable, eq(challengesTable.id, challengeEntriesTable.challengeId))
    .where(and(inArray(challengeEntriesTable.postId, ids), isNull(challengeEntriesTable.removedAt), viewer.userId ? sql`NOT sewspace_blocked_with(${challengesTable.createdBy})` : undefined));
  const countMap = new Map(counts.rows.map((r) => [Number(r.post_id), r]));
  const likedSet = new Set(liked.map((l) => l.postId)), savedSet = new Set(saved.map((x) => x.postId));
  const byId = <T extends { id: number }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const authorMap = new Map(authors.map((a) => [a.userId, a]));
  const makeMap = byId(makes), patternMap = byId(patterns), fabricMap = byId(fabrics);

  return posts.flatMap((post) => {
    const author = authorMap.get(post.userId);
    if (!author) return [];
    const tags: FeedPostView["tags"] = [];
    const make = post.projectId ? makeMap.get(post.projectId) : undefined;
    if (make && make.userId === post.userId) tags.push({ kind: "make", id: make.id, name: make.name });
    const pattern = post.patternId ? patternMap.get(post.patternId) : undefined;
    if (pattern && pattern.userId === post.userId) tags.push({ kind: "pattern", id: pattern.id, name: pattern.name });
    const fabric = post.fabricId ? fabricMap.get(post.fabricId) : undefined;
    if (fabric && fabric.userId === post.userId) tags.push({ kind: "fabric", id: fabric.id, name: fabric.name });
    return [{
      id: post.id,
      kind: post.kind,
      caption: post.caption,
      visibility: post.visibility,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: { handle: author.handle, name: author.name, avatarUrl: author.avatarUrl },
      isOwner: post.userId === viewer.userId,
      media: media.filter((m) => m.postId === post.id).map((m) => mediaView(m.media)),
      tags,
      likeCount: Number(countMap.get(post.id)?.likes ?? 0),
      commentCount: Number(countMap.get(post.id)?.comments ?? 0),
      likedByMe: likedSet.has(post.id),
      savedByMe: savedSet.has(post.id),
      challenges: entries.filter((e) => e.postId === post.id).map(({ slug, tag }) => ({ slug, tag })),
    }];
  });
}

/** One page of posts matching `where` that the viewer may see, newest first. */
export async function pagePosts(db: Tx, viewer: Viewer, where: SQL, cursor: string | undefined) {
  const rows = await db
    .select()
    .from(postsTable)
    .where(and(where, visibleTo(postsTable, viewer), before(decodeCursor(cursor))))
    .orderBy(desc(postsTable.createdAt), desc(postsTable.id))
    .limit(FEED_PAGE_SIZE + 1);
  const more = rows.length > FEED_PAGE_SIZE;
  const shown = rows.slice(0, FEED_PAGE_SIZE);
  return { items: await hydratePosts(db, viewer, shown), nextCursor: more ? encodeCursor(shown[shown.length - 1]) : null };
}

/** Home: posts from people the viewer follows, plus their own, that they may see. */
export function homeFeed(db: Tx, viewer: Viewer, cursor?: string) {
  if (!viewer.userId) throw new Error("homeFeed needs a signed-in viewer");
  const following = sql`${postsTable.userId} IN (SELECT ${followsTable.followeeId} FROM ${followsTable} WHERE ${followsTable.followerId} = ${viewer.userId})`;
  return pagePosts(db, viewer, or(eq(postsTable.userId, viewer.userId), following) as SQL, cursor);
}

export type ExploreKind = "all" | "photo" | "status" | "make";
export type ExploreSort = "recent" | "popular";
export const POPULAR_WINDOW_DAYS = 14;
const POPULAR_MAX = 500;

/** Explore / Discover: public posts from everyone (blocks still apply), newest or most liked. */
export async function exploreFeed(db: Tx, viewer: Viewer, kind: ExploreKind = "all", cursor?: string, sort: ExploreSort = "recent") {
  const filters: SQL[] = [eq(postsTable.visibility, "public")];
  if (kind === "photo") filters.push(eq(postsTable.kind, "photo"));
  if (kind === "status") filters.push(eq(postsTable.kind, "status"));
  if (kind === "make") filters.push(isNotNull(postsTable.projectId));
  if (sort === "recent") return pagePosts(db, viewer, and(...filters) as SQL, cursor);

  // Popular: most liked in the window. Likes change between pages, so the
  // cursor is a plain offset ("o:<n>"), capped at POPULAR_MAX posts.
  const offset = Math.min(Number(/^o:(\d+)$/.exec(Buffer.from(cursor ?? "", "base64url").toString("utf8"))?.[1] ?? 0), POPULAR_MAX);
  const likes = sql<number>`(SELECT count(*) FROM ${likesTable} WHERE ${likesTable.postId} = ${postsTable.id})`;
  const rows = await db
    .select()
    .from(postsTable)
    .where(and(...filters, visibleTo(postsTable, viewer), gt(postsTable.createdAt, new Date(Date.now() - POPULAR_WINDOW_DAYS * 86400000))))
    .orderBy(desc(likes), desc(postsTable.createdAt), desc(postsTable.id))
    .limit(FEED_PAGE_SIZE + 1)
    .offset(offset);
  const shown = rows.slice(0, FEED_PAGE_SIZE);
  const next = offset + FEED_PAGE_SIZE;
  return {
    items: await hydratePosts(db, viewer, shown),
    nextCursor: rows.length > FEED_PAGE_SIZE && next < POPULAR_MAX ? Buffer.from(`o:${next}`).toString("base64url") : null,
  };
}

/** One post, if the viewer may see it. */
export async function getPostForViewer(db: Tx, viewer: Viewer, id: number): Promise<FeedPostView | null> {
  const rows = await db.select().from(postsTable).where(and(eq(postsTable.id, id), visibleTo(postsTable, viewer))).limit(1);
  const [post] = await hydratePosts(db, viewer, rows);
  return post ?? null;
}

/** Public posts for the sitemap. */
export async function listPublicPosts(db: Tx, limit = 50000) {
  return db
    .select({ id: postsTable.id, updatedAt: postsTable.updatedAt })
    .from(postsTable)
    .innerJoin(publicProfilesView, eq(publicProfilesView.userId, postsTable.userId))
    .where(eq(postsTable.visibility, "public"))
    .orderBy(desc(postsTable.id))
    .limit(limit);
}
