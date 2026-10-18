import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { mediaTable, postMediaTable, postsTable, publicProfilesView, type PostFabric, type PostGarment, type Tx } from "@workspace/db";
import { UPCYCLE_TAGS } from "./explore";
import { urlForObjectPath } from "./objects";
import { suggestedPeople } from "./search";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// "Browse by" on Explore (owner's Browse brief). Everything shown to everyone
// is built from public posts only (never followers-only or private, not even
// the viewer's own) by people with a handle, minus blocks for a signed-in
// viewer. "Picked for you" is worked out per request for the signed-in viewer
// only (the route never caches it).

export interface BrowseCover { thumbUrl: string; width: number; height: number; color: string | null }
export interface BrowseCategory { id: string; label: string; sub: string | null; cover: BrowseCover | null }
export interface BrowseFabric { id: PostFabric; label: string; cover: BrowseCover | null }
export interface BrowseSewist { handle: string; name: string; avatarUrl: string | null; makes: number; specialty: string | null }
export interface BrowsePage {
  categories: BrowseCategory[];
  trending: Array<{ tag: string; posts: number }>;
  fabrics: BrowseFabric[];
  picked: { because: string[]; tags: string[] } | null;
  sewists: BrowseSewist[];
}

/** The tiles: a post label (or the Upcycle hashtags), and the Explore sub-filter it selects when there is one. */
export const BROWSE_CATEGORIES: Array<{ id: string; label: string; garment: PostGarment | null; sub: string | null }> = [
  { id: "dresses", label: "Dresses", garment: "dresses", sub: "dresses" },
  { id: "shirts", label: "Shirts & blouses", garment: "shirts", sub: null },
  { id: "tops", label: "Tops", garment: "tops", sub: "tops" },
  { id: "trousers", label: "Pants & trousers", garment: "trousers", sub: null },
  { id: "skirts", label: "Skirts", garment: "skirts", sub: null },
  { id: "outerwear", label: "Outerwear", garment: "outerwear", sub: "outerwear" },
  { id: "knitwear", label: "Knitwear", garment: "knitwear", sub: null },
  { id: "bags", label: "Bags", garment: "bags", sub: "bags" },
  { id: "home", label: "Quilts & home", garment: "home", sub: null },
  { id: "kids", label: "Kids", garment: "kids", sub: null },
  { id: "upcycled", label: "Upcycled", garment: null, sub: "upcycle" },
  { id: "formal", label: "Formal", garment: "formal", sub: null },
];
export const BROWSE_FABRICS: Array<{ id: PostFabric; label: string }> = [
  { id: "linen", label: "Linen" }, { id: "denim", label: "Denim" }, { id: "cotton", label: "Cotton" },
  { id: "knit", label: "Knit" }, { id: "satin", label: "Satin" }, { id: "wool", label: "Wool" },
];
const GARMENT_WORD: Partial<Record<PostGarment, string>> = {
  dresses: "dresses", tops: "tops", bottoms: "trousers", outerwear: "outerwear", bags: "bags", shirts: "shirts",
  trousers: "trousers", skirts: "skirts", knitwear: "knitwear", home: "quilts", kids: "kidswear", formal: "formalwear",
};
const COVER_DAYS = 7;
const TRENDING = 12;
const PICKED = 6;
const SEWISTS = 6;

/** Public photo posts you may see, by people with a handle (the shared filter for covers). */
function publicPhotoPosts(viewer: Viewer): SQL {
  return and(
    eq(postsTable.visibility, "public"),
    eq(postsTable.kind, "photo"),
    visibleTo(postsTable, viewer),
    sql`EXISTS (SELECT 1 FROM ${publicProfilesView} WHERE ${publicProfilesView.userId} = ${postsTable.userId})`,
  ) as SQL;
}

/**
 * For each group, the public photo post saved most in the last week (then the
 * newest): its first photo. `group` is the SQL grouping key (a label column).
 */
async function topCovers(db: Tx, viewer: Viewer, group: SQL, where: SQL): Promise<Map<string, BrowseCover>> {
  const rows = await db.execute<{ grp: string; thumb_path: string; width: number; height: number; color: string | null }>(sql`
    SELECT DISTINCT ON (grp) grp, thumb_path, width, height, color FROM (
      SELECT ${group} AS grp, ${mediaTable.thumbPath} AS thumb_path, ${mediaTable.width} AS width, ${mediaTable.height} AS height, ${mediaTable.color} AS color,
        ${postsTable.createdAt} AS created_at, ${postsTable.id} AS post_id,
        COALESCE((SELECT saves FROM sewspace_save_counts(ARRAY[${postsTable.id}], ${COVER_DAYS})), 0) AS saves
      FROM ${postsTable}
      JOIN ${postMediaTable} ON ${postMediaTable.postId} = ${postsTable.id} AND ${postMediaTable.position} = 0
      JOIN ${mediaTable} ON ${mediaTable.id} = ${postMediaTable.mediaId} AND ${mediaTable.userId} = ${postMediaTable.userId}
      WHERE ${publicPhotoPosts(viewer)} AND ${where}
    ) c ORDER BY grp, saves DESC, created_at DESC, post_id DESC`);
  return new Map(rows.rows.map((r) => [r.grp, { thumbUrl: urlForObjectPath(r.thumb_path), width: Number(r.width), height: Number(r.height), color: r.color }]));
}

/** What a sewist mostly makes, from their public posts: a garment label, else their most used hashtag. */
async function specialties(db: Tx, handles: string[]): Promise<Map<string, string>> {
  if (!handles.length) return new Map();
  const rows = await db.execute<{ handle: string; garment: PostGarment | null; tag: string | null }>(sql`
    SELECT pp.handle,
      (SELECT p.garment FROM sewspace_posts p WHERE p.user_id = pp.user_id AND p.visibility = 'public' AND p.garment IS NOT NULL
        GROUP BY p.garment ORDER BY count(*) DESC, p.garment LIMIT 1) AS garment,
      (SELECT h.tag FROM sewspace_posts p JOIN sewspace_post_hashtags ph ON ph.post_id = p.id JOIN sewspace_hashtags h ON h.id = ph.hashtag_id
        WHERE p.user_id = pp.user_id AND p.visibility = 'public' GROUP BY h.tag ORDER BY count(*) DESC, h.tag LIMIT 1) AS tag
    FROM sewspace_public_profiles pp
    WHERE pp.handle IN (${sql.join(handles.map((h) => sql`${h}`), sql`, `)})`);
  const out = new Map<string, string>();
  for (const r of rows.rows) {
    const word = r.garment ? GARMENT_WORD[r.garment] : null;
    if (word) out.set(r.handle, word);
    else if (r.tag) out.set(r.handle, `#${r.tag}`);
  }
  return out;
}

/** "Picked for you": hashtags from what you saved and who you follow, and the garments you save most. */
async function pickedFor(db: Tx, viewer: Viewer): Promise<BrowsePage["picked"]> {
  const me = viewer.userId;
  if (!me) return null;
  const mine = sql`(${postsTable.id} IN (SELECT post_id FROM sewspace_saves WHERE user_id = ${me})
    OR ${postsTable.id} IN (SELECT item_id FROM sewspace_collection_items WHERE user_id = ${me} AND item_type = 'post'))`;
  const garments = await db.execute<{ garment: PostGarment }>(sql`
    SELECT ${postsTable.garment} AS garment FROM ${postsTable}
    WHERE ${mine} AND ${postsTable.garment} IS NOT NULL AND ${visibleTo(postsTable, viewer)}
    GROUP BY ${postsTable.garment} ORDER BY count(*) DESC, ${postsTable.garment} LIMIT 2`);
  const tags = await db.execute<{ tag: string }>(sql`
    SELECT h.tag FROM sewspace_post_hashtags ph
    JOIN sewspace_hashtags h ON h.id = ph.hashtag_id
    JOIN ${postsTable} ON ${postsTable.id} = ph.post_id
    WHERE ${visibleTo(postsTable, viewer)} AND ${postsTable.userId} <> ${me}
      AND (${mine} OR (${postsTable.userId} IN (SELECT followee_id FROM sewspace_follows WHERE follower_id = ${me})
        AND ${postsTable.createdAt} > now() - interval '60 days'))
    GROUP BY h.tag ORDER BY count(*) DESC, h.tag LIMIT ${PICKED}`);
  return {
    because: garments.rows.flatMap((g) => GARMENT_WORD[g.garment] ?? []),
    tags: tags.rows.map((t) => t.tag),
  };
}

/** Everything the Browse modal shows, in one call. */
export async function browsePage(db: Tx, viewer: Viewer): Promise<BrowsePage> {
  const garmentCovers = await topCovers(db, viewer, sql`${postsTable.garment}`, sql`${postsTable.garment} IS NOT NULL`);
  const upcycled = await topCovers(db, viewer, sql`'upcycled'`, sql`EXISTS (SELECT 1 FROM sewspace_post_hashtags ph JOIN sewspace_hashtags h ON h.id = ph.hashtag_id
    WHERE ph.post_id = ${postsTable.id} AND h.tag IN (${sql.join(UPCYCLE_TAGS.map((t) => sql`${t}`), sql`, `)}))`);
  const fabricCovers = await topCovers(db, viewer, sql`${postsTable.fabric}`, and(sql`${postsTable.fabric} IS NOT NULL`, inArray(postsTable.fabric, BROWSE_FABRICS.map((f) => f.id))) as SQL);
  const trending = await db.execute<{ tag: string; posts: string }>(sql`SELECT tag, posts FROM sewspace_trending_hashtags(7, ${TRENDING})`);
  const people = await suggestedPeople(db, viewer, SEWISTS);
  const spec = await specialties(db, people.map((p) => p.handle));
  return {
    categories: BROWSE_CATEGORIES.map((c) => ({
      id: c.id, label: c.label, sub: c.sub,
      cover: (c.garment ? garmentCovers.get(c.garment) : upcycled.get("upcycled")) ?? null,
    })),
    trending: trending.rows.map((t) => ({ tag: t.tag, posts: Number(t.posts) })),
    fabrics: BROWSE_FABRICS.map((f) => ({ ...f, cover: fabricCovers.get(f.id) ?? null })),
    picked: await pickedFor(db, viewer),
    sewists: people.map((p) => ({ ...p, makes: Number(p.makes), specialty: spec.get(p.handle) ?? null })),
  };
}
