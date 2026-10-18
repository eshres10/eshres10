import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  challengesTable,
  fabricsTable,
  hashtagsTable,
  patternsTable,
  postHashtagsTable,
  postsTable,
  projectsTable,
  type Tx,
} from "@workspace/db";
import { pagePosts } from "./posts";
import { own } from "./studio";
import type { Viewer } from "./viewer";

// Owner: at most 3 hashtags a post.
export const MAX_HASHTAGS = 3;
export const SUGGEST_LIMIT = 6;
const TAG = /^[a-z0-9_]{1,50}$/;

// "#Linen" anywhere a word can start (not inside a word, a URL or an HTML
// entity); longer than 50 characters is not a tag. Same rule as the web app's
// caption renderer (src/lib/hashtags.ts).
const IN_TEXT = /(^|[^\p{L}\p{N}_#&/])#([a-z0-9_]{1,50})(?![\p{L}\p{N}_])/giu;

/** Distinct lower-case hashtags in a caption, in order of first use. */
export function parseHashtags(caption: string): string[] {
  const seen = new Set<string>();
  for (const match of caption.matchAll(IN_TEXT)) seen.add(match[2].toLowerCase());
  return [...seen];
}

/** "#Linen", "linen" -> "linen"; null when it can't be a tag. */
export function normaliseTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#/, "").toLowerCase();
  return TAG.test(tag) ? tag : null;
}

/** A name as a tag: "Willa Dress" -> "willadress" (null if nothing usable). */
function tagFromName(name: string | null | undefined): string | null {
  const tag = (name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").slice(0, 50);
  return tag.length >= 2 ? tag : null;
}

// Replaces a post's hashtags with those in its caption. Only the author's own
// post (RLS owner_all on sewspace_post_hashtags checks the same).
export async function syncPostHashtags(db: Tx, viewer: Viewer, postId: number, caption: string): Promise<void> {
  if (!viewer.userId) throw new Error("syncPostHashtags needs a signed-in viewer");
  const tags = parseHashtags(caption).slice(0, MAX_HASHTAGS);
  await db.delete(postHashtagsTable).where(and(eq(postHashtagsTable.postId, postId), own(postHashtagsTable, viewer)));
  if (!tags.length) return;
  const ids = await db.execute<{ id: number }>(sql`SELECT id FROM sewspace_hashtag_ids(${`{${tags.join(",")}}`}::text[])`);
  await db.insert(postHashtagsTable).values(ids.rows.map((r) => ({ postId, hashtagId: Number(r.id), userId: viewer.userId! })));
}

/** Post counts for tags: public posts only, blocks applied (SQL function). */
export async function hashtagCounts(db: Tx, tags: string[]): Promise<Map<string, number>> {
  if (!tags.length) return new Map();
  const rows = await db.execute<{ tag: string; posts: string }>(
    sql`SELECT tag, posts FROM sewspace_hashtag_counts(${`{${tags.join(",")}}`}::text[])`,
  );
  return new Map(rows.rows.map((r) => [r.tag, Number(r.posts)]));
}

export interface SuggestInput {
  q?: string;
  projectId?: number;
  patternId?: number;
  fabricId?: number;
  challenge?: string;
}

/**
 * Up to six tags. With a prefix: the most used public tags starting with it.
 * Without: tags from the person's own tagged make, pattern and fabric names,
 * the challenge's tag, and their own recent tags, each with its public count.
 */
export async function suggestHashtags(db: Tx, viewer: Viewer, input: SuggestInput): Promise<Array<{ tag: string; posts: number }>> {
  const q = input.q?.trim().replace(/^#/, "") ?? "";
  if (q) {
    const prefix = normaliseTag(q);
    if (!prefix) return [];
    const rows = await db.execute<{ tag: string; posts: string }>(sql`SELECT tag, posts FROM sewspace_hashtag_prefix(${prefix}, ${SUGGEST_LIMIT})`);
    return rows.rows.map((r) => ({ tag: r.tag, posts: Number(r.posts) }));
  }

  const candidates: string[] = [];
  const add = (tag: string | null) => { if (tag && !candidates.includes(tag)) candidates.push(tag); };
  const name = async (table: typeof projectsTable | typeof patternsTable | typeof fabricsTable, id: number | undefined) => {
    if (!id) return;
    const [row] = await db.select({ name: table.name }).from(table).where(and(eq(table.id, id), own(table, viewer)));
    add(tagFromName(row?.name));
  };
  await name(projectsTable, input.projectId);
  await name(patternsTable, input.patternId);
  await name(fabricsTable, input.fabricId);
  if (input.challenge) {
    const [c] = await db.select({ tag: challengesTable.tag }).from(challengesTable)
      .where(and(eq(challengesTable.slug, input.challenge.toLowerCase()), sql`NOT sewspace_blocked_with(${challengesTable.createdBy})`));
    add(c ? normaliseTag(c.tag) : null);
  }
  if (viewer.userId) {
    const recent = await db
      .select({ tag: hashtagsTable.tag })
      .from(postHashtagsTable)
      .innerJoin(hashtagsTable, eq(hashtagsTable.id, postHashtagsTable.hashtagId))
      .where(own(postHashtagsTable, viewer))
      .orderBy(desc(postHashtagsTable.postId))
      .limit(40);
    recent.forEach((r) => add(r.tag));
  }
  const shown = candidates.slice(0, SUGGEST_LIMIT);
  const counts = await hashtagCounts(db, shown);
  return shown.map((tag) => ({ tag, posts: counts.get(tag) ?? 0 }));
}

/** A hashtag page: public posts with the tag that the viewer may see, newest first. */
export async function tagPage(db: Tx, viewer: Viewer, rawTag: string, cursor?: string) {
  const tag = normaliseTag(rawTag);
  if (!tag) return null;
  const tagged = sql`${postsTable.id} IN (
    SELECT ${postHashtagsTable.postId} FROM ${postHashtagsTable}
    JOIN ${hashtagsTable} ON ${hashtagsTable.id} = ${postHashtagsTable.hashtagId}
    WHERE ${hashtagsTable.tag} = ${tag})`;
  const page = await pagePosts(db, viewer, and(eq(postsTable.visibility, "public"), tagged) as SQL, cursor);
  const counts = await hashtagCounts(db, [tag]);
  return { tag, posts: counts.get(tag) ?? 0, ...page };
}

/** Tags used on public posts, for the sitemap. */
export async function listTagsForSitemap(db: Tx, limit = 5000): Promise<string[]> {
  const rows = await db.execute<{ tag: string }>(sql`
    SELECT h.tag FROM sewspace_hashtags h
    WHERE EXISTS (SELECT 1 FROM sewspace_post_hashtags ph JOIN sewspace_posts p ON p.id = ph.post_id
                  WHERE ph.hashtag_id = h.id AND p.visibility = 'public')
    ORDER BY h.tag LIMIT ${limit}`);
  return rows.rows.map((r) => r.tag);
}
