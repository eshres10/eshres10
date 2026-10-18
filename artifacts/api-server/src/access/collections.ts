import { and, eq, sql, type SQL } from "drizzle-orm";
import {
  catalogSavesTable,
  catalogTable,
  challengesTable,
  collectionItemsTable,
  collectionsTable,
  discoverFeedbackTable,
  forumTopicsTable,
  postsTable,
  savesTable,
  type ExploreItemType,
  type FeedbackKind,
  type Tx,
} from "@workspace/db";
import { urlForObjectPath } from "./objects";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Explore step 4: private collections and Hide / More like this. Everything
// here is the caller's own (RLS owner_all underneath). Saving or hiding needs
// the thing to be visible to you by its own rules; counts and covers only use
// things you can still see. Saving a post also saves it (Saved page); saving a
// pattern page also hearts it. Taking it out of your last collection undoes that.

export interface CollectionView { id: number; name: string; count: number; coverUrl: string | null }
type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };

/** The item a collection row (or feedback row) points at is one the viewer may see. */
function visibleItem(viewer: Viewer, type: SQL, id: SQL): SQL {
  const notBlocked = (col: SQL) => (viewer.userId ? sql` AND NOT sewspace_blocked_with(${col})` : sql``);
  return sql`(
    (${type} = 'post' AND EXISTS (SELECT 1 FROM ${postsTable} WHERE ${postsTable.id} = ${id} AND ${visibleTo(postsTable, viewer)}))
    OR (${type} = 'pattern' AND EXISTS (SELECT 1 FROM ${catalogTable} WHERE ${catalogTable.id} = ${id}))
    OR (${type} = 'challenge' AND EXISTS (SELECT 1 FROM ${challengesTable} WHERE ${challengesTable.id} = ${id}${notBlocked(sql`${challengesTable.createdBy}`)}))
    OR (${type} = 'thread' AND EXISTS (SELECT 1 FROM ${forumTopicsTable} WHERE ${forumTopicsTable.id} = ${id}${notBlocked(sql`${forumTopicsTable.userId}`)}))
  )`;
}

export async function canSeeItem(db: Tx, viewer: Viewer, type: ExploreItemType, id: number): Promise<boolean> {
  const rows = await db.execute<{ ok: boolean }>(sql`SELECT ${visibleItem(viewer, sql`${type}`, sql`${id}`)} AS ok`);
  return Boolean(rows.rows[0]?.ok);
}

/** Your collections, most recently used first. */
export async function listCollections(db: Tx, viewer: Viewer): Promise<CollectionView[]> {
  const me = viewer.userId;
  if (!me) return [];
  const i = collectionItemsTable;
  const visible = visibleItem(viewer, sql`${i.itemType}`, sql`${i.itemId}`);
  const rows = await db.execute<{ id: number; name: string; n: string; thumb: string | null }>(sql`
    SELECT c.id, c.name,
      (SELECT count(*) FROM ${i} WHERE ${i.collectionId} = c.id AND ${visible}) AS n,
      (SELECT m.thumb_path FROM ${i}
         JOIN sewspace_post_media pm ON pm.post_id = ${i.itemId} AND pm.position = 0
         JOIN sewspace_media m ON m.id = pm.media_id AND m.user_id = pm.user_id
       WHERE ${i.collectionId} = c.id AND ${i.itemType} = 'post' AND ${visible}
       ORDER BY ${i.createdAt} DESC LIMIT 1) AS thumb
    FROM ${collectionsTable} c
    WHERE c.user_id = ${me}
    ORDER BY COALESCE((SELECT max(${i.createdAt}) FROM ${i} WHERE ${i.collectionId} = c.id), c.created_at) DESC, c.id DESC`);
  return rows.rows.map((r) => ({ id: Number(r.id), name: r.name, count: Number(r.n), coverUrl: r.thumb ? urlForObjectPath(r.thumb) : null }));
}

async function collectionView(db: Tx, viewer: Viewer, id: number): Promise<CollectionView | null> {
  return (await listCollections(db, viewer)).find((c) => c.id === id) ?? null;
}

/** A new private collection, or the one you already have with that name (any case). */
export async function createCollection(db: Tx, viewer: Viewer, rawName: string): Promise<Ok<{ collection: CollectionView; created: boolean }> | Fail<"bad_name">> {
  const me = viewer.userId!;
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return { ok: false, error: "bad_name" };
  const [existing] = await db.select({ id: collectionsTable.id }).from(collectionsTable)
    .where(and(eq(collectionsTable.userId, me), sql`lower(btrim(${collectionsTable.name})) = lower(${name})`));
  if (existing) return { ok: true, value: { collection: (await collectionView(db, viewer, existing.id))!, created: false } };
  const [row] = await db.insert(collectionsTable).values({ userId: me, name }).returning({ id: collectionsTable.id });
  return { ok: true, value: { collection: (await collectionView(db, viewer, row.id))!, created: true } };
}

async function ownCollection(db: Tx, viewer: Viewer, id: number): Promise<boolean> {
  const [row] = await db.select({ id: collectionsTable.id }).from(collectionsTable)
    .where(and(eq(collectionsTable.id, id), eq(collectionsTable.userId, viewer.userId!)));
  return Boolean(row);
}

export async function addToCollection(db: Tx, viewer: Viewer, collectionId: number, type: ExploreItemType, itemId: number): Promise<CollectionView | null> {
  const me = viewer.userId!;
  if (!(await ownCollection(db, viewer, collectionId)) || !(await canSeeItem(db, viewer, type, itemId))) return null;
  await db.insert(collectionItemsTable).values({ collectionId, userId: me, itemType: type, itemId }).onConflictDoNothing();
  if (type === "post") await db.insert(savesTable).values({ userId: me, postId: itemId }).onConflictDoNothing();
  if (type === "pattern") await db.insert(catalogSavesTable).values({ userId: me, catalogId: itemId }).onConflictDoNothing();
  return collectionView(db, viewer, collectionId);
}

export async function removeFromCollection(db: Tx, viewer: Viewer, collectionId: number, type: ExploreItemType, itemId: number): Promise<boolean> {
  const me = viewer.userId!;
  if (!(await ownCollection(db, viewer, collectionId))) return false;
  const i = collectionItemsTable;
  await db.delete(i).where(and(eq(i.collectionId, collectionId), eq(i.userId, me), eq(i.itemType, type), eq(i.itemId, itemId)));
  const [still] = await db.select({ id: i.itemId }).from(i).where(and(eq(i.userId, me), eq(i.itemType, type), eq(i.itemId, itemId))).limit(1);
  if (!still && type === "post") await db.delete(savesTable).where(and(eq(savesTable.userId, me), eq(savesTable.postId, itemId)));
  if (!still && type === "pattern") await db.delete(catalogSavesTable).where(and(eq(catalogSavesTable.userId, me), eq(catalogSavesTable.catalogId, itemId)));
  return true;
}

/** Hide (see_less) or More like this (more_like), for something you can see. */
export async function sendFeedback(db: Tx, viewer: Viewer, type: ExploreItemType, itemId: number, kind: FeedbackKind): Promise<boolean> {
  if (!(await canSeeItem(db, viewer, type, itemId))) return false;
  await db.insert(discoverFeedbackTable).values({ userId: viewer.userId!, itemType: type, itemId, kind }).onConflictDoNothing();
  return true;
}

export async function undoFeedback(db: Tx, viewer: Viewer, type: ExploreItemType, itemId: number, kind: FeedbackKind): Promise<void> {
  const f = discoverFeedbackTable;
  await db.delete(f).where(and(eq(f.userId, viewer.userId!), eq(f.itemType, type), eq(f.itemId, itemId), eq(f.kind, kind)));
}

/** Which of these the viewer has in a collection, as "type-id" keys. */
export async function collectedKeys(db: Tx, viewer: Viewer, items: Array<{ type: ExploreItemType; id: number }>): Promise<Set<string>> {
  if (!viewer.userId || !items.length) return new Set();
  const ids = [...new Set(items.map((x) => x.id))];
  const rows = await db.selectDistinct({ type: collectionItemsTable.itemType, id: collectionItemsTable.itemId }).from(collectionItemsTable)
    .where(and(eq(collectionItemsTable.userId, viewer.userId), sql`${collectionItemsTable.itemId} IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`));
  return new Set(rows.map((r) => `${r.type}-${r.id}`));
}
