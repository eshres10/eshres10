import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { postsTable, publicProfilesView, type Tx } from "@workspace/db";
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

/** Hashtags starting with the text ("#lin", "lin", "linen dress" -> "linendress"). */
export async function searchTags(db: Tx, raw: string) {
  const q = searchTerm(raw);
  const prefix = q ? normaliseTag(q.replace(/\s+/g, "")) : null;
  if (!prefix) return [];
  const rows = await db.execute<{ tag: string; posts: string }>(sql`SELECT tag, posts FROM sewspace_hashtag_prefix(${prefix}, ${TAG_LIMIT})`);
  return rows.rows.map((r) => ({ tag: r.tag, posts: Number(r.posts) }));
}
