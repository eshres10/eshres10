import { inArray, sql, type SQL } from "drizzle-orm";
import { catalogTable, challengesTable, collectionsTable, forumTopicsTable, postsTable, type ExploreItemType, type PostCardColor, type Tx } from "@workspace/db";
import { entryViews } from "./catalog";
import { visibleItem } from "./collections";
import { challengeCovers } from "./explore";
import { hydratePosts } from "./posts";
import type { Viewer } from "./viewer";

// Saved (owner's Saved brief): "All posts" is everything you saved, worked out
// from what already exists: your post saves, your pattern hearts and anything
// in one of your collections (a challenge or thread can only be saved into a
// collection). Collections are owner-only (RLS owner_all); every count, cover
// and grid keeps only items you may still see (visibleItem), so something made
// private, deleted or across a block simply drops out.

export const COVER_ITEMS = 4;

export interface SavedItemView {
  type: ExploreItemType;
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  color: string | null;
  /** A words post's card colour (no photo). */
  cardColor: PostCardColor | null;
  href: string;
}
export interface SavedCollectionView { id: number; name: string; count: number; covers: SavedItemView[] }
export interface SavedOverview { total: number; all: { count: number; covers: SavedItemView[] }; collections: SavedCollectionView[] }

type Key = { type: ExploreItemType; id: number };

/** Everything you saved, one row per item with the latest time it was saved (unfiltered). */
function everything(me: string): SQL {
  return sql`(
    SELECT item_type, item_id, max(saved_at) AS saved_at FROM (
      SELECT 'post'::text AS item_type, post_id AS item_id, created_at AS saved_at FROM sewspace_saves WHERE user_id = ${me}
      UNION ALL SELECT 'pattern', catalog_id, created_at FROM sewspace_catalog_saves WHERE user_id = ${me}
      UNION ALL SELECT item_type, item_id, created_at FROM sewspace_collection_items WHERE user_id = ${me}
    ) raw GROUP BY item_type, item_id
  )`;
}

/** Your saves you may still see, newest first: a page of keys plus the total. */
export async function allSavedKeys(db: Tx, viewer: Viewer, offset: number, limit: number): Promise<{ keys: Key[]; total: number }> {
  const me = viewer.userId;
  if (!me) return { keys: [], total: 0 };
  const rows = await db.execute<{ item_type: ExploreItemType; item_id: number; total: string }>(sql`
    SELECT s.item_type, s.item_id, count(*) OVER () AS total FROM ${everything(me)} s
    WHERE ${visibleItem(viewer, sql`s.item_type`, sql`s.item_id`)}
    ORDER BY s.saved_at DESC, s.item_type, s.item_id
    OFFSET ${offset} LIMIT ${limit}`);
  const total = rows.rows.length ? Number(rows.rows[0].total) : offset ? (await allSavedKeys(db, viewer, 0, 1)).total : 0;
  return { keys: rows.rows.map((r) => ({ type: r.item_type, id: Number(r.item_id) })), total };
}

/** Cards for saved things, in the order given; anything that doesn't come back (gone, hidden) is left out. */
export async function savedItemViews(db: Tx, viewer: Viewer, keys: Key[]): Promise<SavedItemView[]> {
  const ids = (t: ExploreItemType) => [...new Set(keys.filter((k) => k.type === t).map((k) => k.id))];
  const views = new Map<string, SavedItemView>();

  const postIds = ids("post");
  if (postIds.length) {
    // hydratePosts reads under RLS and applies the post rules again.
    const rows = await db.select().from(postsTable).where(inArray(postsTable.id, postIds));
    for (const p of await hydratePosts(db, viewer, rows)) {
      const photo = p.media[0];
      const firstLine = p.caption.split("\n")[0].trim();
      views.set(`post-${p.id}`, {
        type: "post", id: p.id,
        title: firstLine ? firstLine.slice(0, 120) : `Photo by @${p.author.handle}`,
        subtitle: `@${p.author.handle}`,
        imageUrl: photo?.thumbUrl ?? null, width: photo?.width ?? null, height: photo?.height ?? null, color: photo?.color ?? null,
        cardColor: photo ? null : p.cardColor,
        href: `/posts/${p.id}`,
      });
    }
  }
  const patternIds = ids("pattern");
  if (patternIds.length) {
    const rows = await db.select().from(catalogTable).where(inArray(catalogTable.id, patternIds));
    for (const e of await entryViews(db, viewer, rows)) {
      views.set(`pattern-${e.id}`, {
        type: "pattern", id: e.id, title: e.name, subtitle: e.designer?.name ?? e.maker ?? null,
        imageUrl: e.coverImageUrl, width: null, height: null, color: null, cardColor: null,
        href: `/catalog/${e.kind}/${e.slug}`,
      });
    }
  }
  const challengeIds = ids("challenge");
  if (challengeIds.length) {
    const rows = await db.select().from(challengesTable).where(inArray(challengesTable.id, challengeIds));
    const covers = await challengeCovers(db, viewer, rows.map((c) => c.id));
    for (const c of rows) {
      const cover = covers.get(c.id);
      views.set(`challenge-${c.id}`, {
        type: "challenge", id: c.id, title: `#${c.tag}`, subtitle: c.title,
        imageUrl: cover?.thumbUrl ?? null, width: cover?.width ?? null, height: cover?.height ?? null, color: cover?.color ?? null, cardColor: null,
        href: `/challenges/${c.slug}`,
      });
    }
  }
  const threadIds = ids("thread");
  if (threadIds.length) {
    const rows = await db.select({ id: forumTopicsTable.id, title: forumTopicsTable.title }).from(forumTopicsTable).where(inArray(forumTopicsTable.id, threadIds));
    for (const t of rows) {
      views.set(`thread-${t.id}`, {
        type: "thread", id: t.id, title: t.title, subtitle: null,
        imageUrl: null, width: null, height: null, color: null, cardColor: null,
        href: `/forum/topics/${t.id}`,
      });
    }
  }
  return keys.flatMap((k) => views.get(`${k.type}-${k.id}`) ?? []);
}

/** The Saved page: All posts first, then your collections (most recently used first), each with a count and up to 4 covers. */
export async function savedOverview(db: Tx, viewer: Viewer): Promise<SavedOverview> {
  const me = viewer.userId;
  if (!me) return { total: 0, all: { count: 0, covers: [] }, collections: [] };
  const all = await allSavedKeys(db, viewer, 0, COVER_ITEMS);
  const i = sql`sewspace_collection_items`;
  const visible = visibleItem(viewer, sql`ci.item_type`, sql`ci.item_id`);
  const collections = await db.execute<{ id: number; name: string; n: string }>(sql`
    SELECT c.id, c.name, (SELECT count(*) FROM ${i} ci WHERE ci.collection_id = c.id AND ${visible}) AS n
    FROM ${collectionsTable} c WHERE c.user_id = ${me}
    ORDER BY COALESCE((SELECT max(ci.created_at) FROM ${i} ci WHERE ci.collection_id = c.id), c.created_at) DESC, c.id DESC`);
  const coverRows = await db.execute<{ collection_id: number; item_type: ExploreItemType; item_id: number }>(sql`
    SELECT collection_id, item_type, item_id FROM (
      SELECT ci.collection_id, ci.item_type, ci.item_id,
        row_number() OVER (PARTITION BY ci.collection_id ORDER BY ci.created_at DESC, ci.item_type, ci.item_id) AS rn
      FROM ${i} ci WHERE ci.user_id = ${me} AND ${visible}
    ) ranked WHERE rn <= ${COVER_ITEMS} ORDER BY collection_id, rn`);
  const coverKeys = coverRows.rows.map((r) => ({ type: r.item_type, id: Number(r.item_id) }));
  const views = await savedItemViews(db, viewer, [...all.keys, ...coverKeys]);
  const byKey = new Map(views.map((v) => [`${v.type}-${v.id}`, v]));
  const pick = (keys: Key[]) => keys.flatMap((k) => byKey.get(`${k.type}-${k.id}`) ?? []);
  return {
    total: all.total,
    all: { count: all.total, covers: pick(all.keys) },
    collections: collections.rows.map((c) => ({
      id: Number(c.id), name: c.name, count: Number(c.n),
      covers: pick(coverRows.rows.filter((r) => Number(r.collection_id) === Number(c.id)).map((r) => ({ type: r.item_type, id: Number(r.item_id) }))),
    })),
  };
}
