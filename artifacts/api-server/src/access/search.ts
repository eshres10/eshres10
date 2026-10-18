import { and, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { followsTable, postsTable, publicProfilesView, type Tx } from "@workspace/db";
import { normaliseTag } from "./hashtags";
import { pagePosts } from "./posts";
import type { Viewer } from "./viewer";

// Site search (Explore). Public content only: posts by their own visibility
// rule (public, blocks either way left out), people from the public profiles
// view (handle set, not blocked either way), tag counts from the same SQL
// function as hashtag suggestions. Nothing private or followers-only is
// searched, not even the viewer's own.

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 80;
const PEOPLE_LIMIT = 20;
const TAG_LIMIT = 10;

/** Trimmed, single-spaced search text, or null when it is too short to search. */
export function searchTerm(raw: string | undefined | null): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  return q.length >= SEARCH_MIN ? q : null;
}

/** LIKE pattern text with %, _ and \ taken literally. */
function literal(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Public posts whose caption contains the text, newest first. */
export async function searchPosts(db: Tx, viewer: Viewer, raw: string, cursor?: string) {
  const q = searchTerm(raw);
  if (!q) return { items: [], nextCursor: null };
  const where = and(eq(postsTable.visibility, "public"), ilike(postsTable.caption, `%${literal(q)}%`)) as SQL;
  return pagePosts(db, viewer, where, cursor);
}

/** People by handle prefix ("@ann" or "ann") or by any part of their name. */
export async function searchPeople(db: Tx, raw: string) {
  const q = searchTerm(raw.trim().replace(/^@/, ""));
  if (!q) return [];
  const lower = q.toLowerCase();
  const handlePrefix = `${literal(lower)}%`;
  const rows = await db
    .select({ handle: publicProfilesView.handle, name: publicProfilesView.name, avatarUrl: publicProfilesView.avatarUrl })
    .from(publicProfilesView)
    .where(or(ilike(publicProfilesView.handle, handlePrefix), ilike(publicProfilesView.name, `%${literal(q)}%`)))
    .orderBy(
      sql`CASE WHEN lower(${publicProfilesView.handle}) = ${lower} THEN 0 WHEN ${publicProfilesView.handle} ILIKE ${handlePrefix} THEN 1 ELSE 2 END`,
      publicProfilesView.handle,
    )
    .limit(PEOPLE_LIMIT);
  return rows;
}

/**
 * Sewists to follow (Home's sidebar): people with a handle (the view also drops
 * anyone blocked either way), not you, not already followed, who have public
 * posts or makes. Only public work is counted, so followers-only and private
 * items never show up in the numbers.
 */
export async function suggestedPeople(db: Tx, viewer: Viewer, limit = 3) {
  const me = viewer.userId;
  // Written out with the table names: inside a subquery Drizzle leaves the view's column unqualified.
  const makes = sql<number>`(SELECT count(*)::int FROM sewspace_projects pr WHERE pr.user_id = sewspace_public_profiles.user_id AND pr.visibility = 'public')`;
  const posts = sql<number>`(SELECT count(*)::int FROM sewspace_posts po WHERE po.user_id = sewspace_public_profiles.user_id AND po.visibility = 'public')`;
  return db
    .select({ handle: publicProfilesView.handle, name: publicProfilesView.name, avatarUrl: publicProfilesView.avatarUrl, makes })
    .from(publicProfilesView)
    .where(and(
      // Signed out (Explore's Browse): everyone with public work.
      me ? ne(publicProfilesView.userId, me) : undefined,
      me ? sql`NOT EXISTS (SELECT 1 FROM ${followsTable} WHERE ${followsTable.followerId} = ${me} AND ${followsTable.followeeId} = ${publicProfilesView.userId})` : undefined,
      sql`${makes} + ${posts} > 0`,
    ))
    .orderBy(desc(makes), desc(posts), desc(publicProfilesView.createdAt))
    .limit(limit);
}

/** Hashtags starting with the text ("#lin", "lin", "linen dress" -> "linendress"). */
export async function searchTags(db: Tx, raw: string) {
  const q = searchTerm(raw);
  const prefix = q ? normaliseTag(q.replace(/\s+/g, "")) : null;
  if (!prefix) return [];
  const rows = await db.execute<{ tag: string; posts: string }>(sql`SELECT tag, posts FROM sewspace_hashtag_prefix(${prefix}, ${TAG_LIMIT})`);
  return rows.rows.map((r) => ({ tag: r.tag, posts: Number(r.posts) }));
}
