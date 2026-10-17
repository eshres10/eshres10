import { and, count, desc, eq, gt, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  catalogSavesTable,
  catalogSizesTable,
  followsTable,
  catalogTable,
  fabricsTable,
  patternsTable,
  profilesTable,
  projectsTable,
  publicProfilesView,
  reviewVotesTable,
  reviewsTable,
  threadsTable,
  type CatalogEntry,
  type CatalogKind,
  type Project,
  type Review,
  type Tx,
} from "@workspace/db";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Shared pattern and product pages ("the catalog") and their reviews.
// Pages are public reference data. What they show about people follows the
// usual rules: a make appears only if the viewer may see both the make and the
// linked pattern/fabric/thread, and reviews from people on the other side of a
// block are hidden (the overall numbers still count every review).

export const PATTERN_CATEGORIES = ["dresses", "tops", "trousers", "skirts", "jumpsuits", "outerwear", "knitwear", "lingerie", "activewear", "menswear", "kids", "bags", "accessories", "home", "other"] as const;
export const PRODUCT_CATEGORIES = ["fabric", "thread", "notions", "tools", "machines", "other"] as const;
export const CATALOG_PER_DAY = 20;
const MAKES_SHOWN = 60;

type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };

/** "Fernhill Patterns", "Willa Dress" → "fernhill-patterns-willa-dress". */
export function catalogSlug(maker: string, name: string): string {
  return `${maker} ${name}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function categoriesFor(kind: CatalogKind): readonly string[] {
  return kind === "pattern" ? PATTERN_CATEGORIES : PRODUCT_CATEGORIES;
}

// ------------------------------------------------------------ makes on a page

interface PageMakeRow { make: Project; usedWithId: number | null }

/** Makes the viewer may see that use this entry through an item the viewer may also see. */
async function makesUsing(db: Tx, viewer: Viewer, entry: Pick<CatalogEntry, "id" | "kind">, limit = MAKES_SHOWN): Promise<PageMakeRow[]> {
  const order = [sql`${projectsTable.publishedAt} DESC NULLS LAST`, desc(projectsTable.id)];
  if (entry.kind === "pattern") {
    const rows = await db
      .select({ make: projectsTable })
      .from(projectsTable)
      .innerJoin(patternsTable, and(eq(patternsTable.id, projectsTable.patternId), eq(patternsTable.userId, projectsTable.userId)))
      .where(and(eq(patternsTable.catalogId, entry.id), visibleTo(projectsTable, viewer), visibleTo(patternsTable, viewer)))
      .orderBy(...order)
      .limit(limit);
    return rows.map((r) => ({ make: r.make, usedWithId: r.make.fabricId }));
  }
  const viaFabric = await db
    .select({ make: projectsTable })
    .from(projectsTable)
    .innerJoin(fabricsTable, and(eq(fabricsTable.id, projectsTable.fabricId), eq(fabricsTable.userId, projectsTable.userId)))
    .where(and(eq(fabricsTable.catalogId, entry.id), visibleTo(projectsTable, viewer), visibleTo(fabricsTable, viewer)))
    .orderBy(...order)
    .limit(limit);
  const viaThread = await db
    .select({ make: projectsTable })
    .from(projectsTable)
    .innerJoin(threadsTable, and(eq(threadsTable.id, projectsTable.threadId), eq(threadsTable.userId, projectsTable.userId)))
    .where(and(eq(threadsTable.catalogId, entry.id), visibleTo(projectsTable, viewer), visibleTo(threadsTable, viewer)))
    .orderBy(...order)
    .limit(limit);
  const seen = new Set<number>();
  return [...viaFabric, ...viaThread]
    .filter((r) => !seen.has(r.make.id) && seen.add(r.make.id))
    .slice(0, limit)
    .map((r) => ({ make: r.make, usedWithId: r.make.patternId }));
}

/**
 * Public makes using each entry: the make and the linked pattern/fabric/thread
 * are both public. Followers-only and private makes are never counted, so the
 * numbers are the same for everyone (owner decision, pattern directory).
 */
function publicMakeCountsSql(kind: CatalogKind): SQL {
  const one = (table: "sewspace_patterns" | "sewspace_fabrics" | "sewspace_threads", column: "pattern_id" | "fabric_id" | "thread_id") => sql`
    SELECT l.catalog_id AS id, p.id AS make_id FROM sewspace_projects p
    JOIN ${sql.raw(table)} l ON l.id = p.${sql.raw(column)} AND l.user_id = p.user_id
    WHERE p.visibility = 'public' AND l.visibility = 'public' AND l.catalog_id IS NOT NULL`;
  const union = kind === "pattern"
    ? one("sewspace_patterns", "pattern_id")
    : sql`${one("sewspace_fabrics", "fabric_id")} UNION ${one("sewspace_threads", "thread_id")}`;
  return sql`SELECT id, count(DISTINCT make_id)::int AS n FROM (${union}) u GROUP BY id`;
}

async function makeCounts(db: Tx, entries: Array<Pick<CatalogEntry, "id" | "kind">>): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (const kind of ["pattern", "product"] as const) {
    const ids = entries.filter((e) => e.kind === kind).map((e) => e.id);
    if (!ids.length) continue;
    const rows = await db.execute<{ id: number; n: number }>(sql`SELECT id, n FROM (${publicMakeCountsSql(kind)}) c WHERE id = ANY(${`{${ids.join(",")}}`}::integer[])`);
    rows.rows.forEach((r) => counts.set(Number(r.id), Number(r.n)));
  }
  return counts;
}

/** A cover photo per pattern page: the newest public make with a photo. */
async function covers(db: Tx, entries: Array<Pick<CatalogEntry, "id" | "kind">>): Promise<Map<number, string>> {
  const ids = entries.filter((e) => e.kind === "pattern").map((e) => e.id);
  if (!ids.length) return new Map();
  const rows = await db.execute<{ id: number; url: string }>(sql`
    SELECT DISTINCT ON (l.catalog_id) l.catalog_id AS id, p.cover_image_url AS url
    FROM sewspace_projects p JOIN sewspace_patterns l ON l.id = p.pattern_id AND l.user_id = p.user_id
    WHERE p.visibility = 'public' AND l.visibility = 'public' AND p.cover_image_url IS NOT NULL
      AND l.catalog_id = ANY(${`{${ids.join(",")}}`}::integer[])
    ORDER BY l.catalog_id, p.published_at DESC NULLS LAST, p.id DESC`);
  return new Map(rows.rows.map((r) => [Number(r.id), r.url]));
}

// ------------------------------------------------------------------ entries

export interface CatalogStatsView {
  reviews: number;
  rating: number | null;
  fit: number | null;
  difficulty: number | null;
  instructions: number | null;
  runsSmall: number;
  runsTrue: number;
  runsLarge: number;
  makes: number;
}
type PublicPersonView = { handle: string; name: string; avatarUrl: string | null };
export type CatalogEntryView = Omit<CatalogEntry, "createdBy" | "createdAt" | "updatedAt" | "designerId"> & {
  canEdit: boolean; stats: CatalogStatsView; designer: PublicPersonView | null; coverImageUrl: string | null; isNew: boolean; savedByMe: boolean;
};

const NEW_FOR_MS = 30 * 86400_000;

export async function entryViews(db: Tx, viewer: Viewer, rows: CatalogEntry[]): Promise<CatalogEntryView[]> {
  if (!rows.length) return [];
  const stats = await db.execute<{
    catalog_id: number; reviews: string; rating: string | null; fit: string | null; difficulty: string | null; instructions: string | null;
    runs_small: string; runs_true: string; runs_large: string;
  }>(sql`SELECT * FROM sewspace_catalog_stats(${`{${rows.map((r) => r.id).join(",")}}`}::integer[])`);
  const byId = new Map(stats.rows.map((r) => [Number(r.catalog_id), r]));
  const makes = await makeCounts(db, rows);
  const coverMap = await covers(db, rows);
  const designerIds = [...new Set(rows.map((r) => r.designerId).filter((id): id is string => Boolean(id)))];
  const designers = designerIds.length ? await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, designerIds)) : [];
  const designerMap = new Map(designers.map((d) => [d.userId, { handle: d.handle, name: d.name, avatarUrl: d.avatarUrl }]));
  const saved = viewer.userId
    ? new Set((await db.select({ id: catalogSavesTable.catalogId }).from(catalogSavesTable)
        .where(and(eq(catalogSavesTable.userId, viewer.userId), inArray(catalogSavesTable.catalogId, rows.map((r) => r.id))))).map((r) => r.id))
    : new Set<number>();
  const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => {
    const s = byId.get(r.id);
    return {
      id: r.id,
      kind: r.kind,
      slug: r.slug,
      name: r.name,
      maker: r.maker,
      category: r.category,
      difficulty: r.difficulty,
      sizes: r.sizes,
      fabricTypes: r.fabricTypes,
      yardage: r.yardage,
      url: r.url,
      description: r.description,
      source: r.source,
      priceCents: r.priceCents,
      currency: r.currency,
      designer: (r.designerId && designerMap.get(r.designerId)) || null,
      coverImageUrl: coverMap.get(r.id) ?? null,
      isNew: Date.now() - r.createdAt.getTime() < NEW_FOR_MS,
      savedByMe: saved.has(r.id),
      canEdit: Boolean(viewer.userId) && (r.createdBy === viewer.userId || viewer.isAdmin),
      stats: {
        reviews: Number(s?.reviews ?? 0),
        rating: num(s?.rating),
        fit: num(s?.fit),
        difficulty: num(s?.difficulty),
        instructions: num(s?.instructions),
        runsSmall: Number(s?.runs_small ?? 0),
        runsTrue: Number(s?.runs_true ?? 0),
        runsLarge: Number(s?.runs_large ?? 0),
        makes: makes.get(r.id) ?? 0,
      },
    };
  });
}

/** Escapes LIKE wildcards so a search for "100%" means the characters. */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const CATALOG_PAGE = 24;
export type CatalogSort = "made" | "rating" | "new";
const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
const SOURCES = ["seams_club", "free", "designer"] as const;

export interface CatalogQuery {
  q?: string;
  category?: string;
  difficulty?: string[];
  source?: string[];
  minRating?: number;
  sort?: CatalogSort;
  cursor?: string;
}

/**
 * The directory: search (name, designer, category), category, difficulty,
 * where to get it, rating, sort, 24 at a time. Ratings count every review (as
 * on the page); makes are public makes only. Each filter's counts apply the
 * other filters. Offset cursor ("o:<n>").
 */
export async function listCatalog(db: Tx, viewer: Viewer, kind: CatalogKind, options: CatalogQuery = {}) {
  const query = options.q?.trim().slice(0, 80);
  const like = query ? `%${escapeLike(query)}%` : null;
  const difficulty = (options.difficulty ?? []).filter((d) => (DIFFICULTIES as readonly string[]).includes(d));
  const source = (options.source ?? []).filter((d) => (SOURCES as readonly string[]).includes(d));
  const offset = Math.min(Number(/^o:(\d+)$/.exec(Buffer.from(options.cursor ?? "", "base64url").toString("utf8"))?.[1] ?? 0), 5000);
  const base = sql`
    WITH stats AS (SELECT * FROM sewspace_catalog_stats(ARRAY(SELECT id FROM sewspace_catalog WHERE kind = ${kind}))),
    made AS (${publicMakeCountsSql(kind)}),
    base AS (
      SELECT c.id, c.name, c.created_at, c.difficulty, c.source, s.rating, s.reviews, coalesce(m.n, 0) AS makes
      FROM sewspace_catalog c
      LEFT JOIN stats s ON s.catalog_id = c.id
      LEFT JOIN made m ON m.id = c.id
      WHERE c.kind = ${kind}
        ${options.category ? sql`AND c.category = ${options.category.toLowerCase()}` : sql``}
        ${like ? sql`AND (c.name ILIKE ${like} OR c.maker ILIKE ${like} OR c.category ILIKE ${like})` : sql``}
        ${options.minRating ? sql`AND s.rating >= ${options.minRating}` : sql``}
    )`;
  const byDifficulty = difficulty.length ? sql`AND difficulty = ANY(${`{${difficulty.join(",")}}`}::text[])` : sql``;
  const bySource = source.length ? sql`AND source = ANY(${`{${source.join(",")}}`}::text[])` : sql``;
  const order = options.sort === "rating"
    ? sql`rating DESC NULLS LAST, reviews DESC, makes DESC, id DESC`
    : options.sort === "new"
      ? sql`created_at DESC, id DESC`
      : sql`makes DESC, rating DESC NULLS LAST, reviews DESC, name`;
  const page = await db.execute<{ id: number }>(sql`${base} SELECT id FROM base WHERE true ${byDifficulty} ${bySource} ORDER BY ${order} LIMIT ${CATALOG_PAGE + 1} OFFSET ${offset}`);
  const [total] = (await db.execute<{ n: number }>(sql`${base} SELECT count(*)::int AS n FROM base WHERE true ${byDifficulty} ${bySource}`)).rows;
  const diffCounts = await db.execute<{ k: string; n: number }>(sql`${base} SELECT difficulty AS k, count(*)::int AS n FROM base WHERE true ${bySource} GROUP BY difficulty`);
  const sourceCounts = await db.execute<{ k: string; n: number }>(sql`${base} SELECT source AS k, count(*)::int AS n FROM base WHERE true ${byDifficulty} GROUP BY source`);
  const ids = page.rows.slice(0, CATALOG_PAGE).map((r) => Number(r.id));
  const rows = ids.length ? await db.select().from(catalogTable).where(inArray(catalogTable.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const counted = <K extends string>(keys: readonly K[], list: Array<{ k: string; n: number }>) =>
    Object.fromEntries(keys.map((k) => [k, Number(list.find((r) => r.k === k)?.n ?? 0)])) as Record<K, number>;
  return {
    items: await entryViews(db, viewer, ids.map((id) => byId.get(id)!).filter(Boolean)),
    total: Number(total?.n ?? 0),
    facets: { difficulty: counted(DIFFICULTIES, diffCounts.rows), source: counted(SOURCES, sourceCounts.rows) },
    nextCursor: page.rows.length > CATALOG_PAGE ? Buffer.from(`o:${offset + CATALOG_PAGE}`).toString("base64url") : null,
  };
}

// ------------------------------------------------------------------ saves

export const CATALOG_SAVES_PER_HOUR = 120;

/** The heart: private saves of pattern pages. 120 changes an hour. */
export async function setCatalogSave(db: Tx, viewer: Viewer, id: number, on: boolean): Promise<Ok<{ saved: boolean }> | Fail<"not_found" | "rate_limited">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  const [{ recent }] = await db.select({ recent: count() }).from(catalogSavesTable)
    .where(and(eq(catalogSavesTable.userId, me), gt(catalogSavesTable.createdAt, new Date(Date.now() - 3600_000))));
  if (on && recent >= CATALOG_SAVES_PER_HOUR) return { ok: false, error: "rate_limited" };
  if (on) {
    const [entry] = await db.select({ id: catalogTable.id }).from(catalogTable).where(eq(catalogTable.id, id));
    if (!entry) return { ok: false, error: "not_found" };
    await db.insert(catalogSavesTable).values({ userId: me, catalogId: id }).onConflictDoNothing();
  } else {
    await db.delete(catalogSavesTable).where(and(eq(catalogSavesTable.userId, me), eq(catalogSavesTable.catalogId, id)));
  }
  return { ok: true, value: { saved: on } };
}

async function findEntry(db: Tx, kind: CatalogKind, slug: string): Promise<CatalogEntry | null> {
  const [row] = await db.select().from(catalogTable).where(and(eq(catalogTable.kind, kind), eq(catalogTable.slug, slug.toLowerCase()))).limit(1);
  return row ?? null;
}

export async function getCatalogEntry(db: Tx, viewer: Viewer, id: number): Promise<CatalogEntryView | null> {
  const [row] = await db.select().from(catalogTable).where(eq(catalogTable.id, id)).limit(1);
  if (!row) return null;
  const [view] = await entryViews(db, viewer, [row]);
  return view;
}

/** Everything a catalog page shows, for this viewer. */
export async function getCatalogPage(db: Tx, viewer: Viewer, kind: CatalogKind, slug: string) {
  const entry = await findEntry(db, kind, slug);
  if (!entry) return null;
  const [view] = await entryViews(db, viewer, [entry]);
  const rows = await makesUsing(db, viewer, entry);
  const owners = rows.length
    ? await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, [...new Set(rows.map((r) => r.make.userId))]))
    : [];
  const ownerMap = new Map(owners.map((o) => [o.userId, o]));
  // What each make was made with on the other side: its fabric (pattern pages)
  // or pattern (product pages), only if the viewer may see that too.
  const otherIds = [...new Set(rows.map((r) => r.usedWithId).filter((id): id is number => id !== null))];
  const others = !otherIds.length
    ? []
    : kind === "pattern"
      ? await db.select({ id: fabricsTable.id, name: fabricsTable.name, type: fabricsTable.type, userId: fabricsTable.userId }).from(fabricsTable)
          .where(and(inArray(fabricsTable.id, otherIds), visibleTo(fabricsTable, viewer)))
      : await db.select({ id: patternsTable.id, name: patternsTable.name, type: patternsTable.garmentType, userId: patternsTable.userId }).from(patternsTable)
          .where(and(inArray(patternsTable.id, otherIds), visibleTo(patternsTable, viewer)));
  const otherMap = new Map(others.map((o) => [o.id, o]));
  const makes = rows.flatMap(({ make, usedWithId }) => {
    const owner = ownerMap.get(make.userId);
    if (!owner) return [];
    const other = usedWithId !== null ? otherMap.get(usedWithId) : undefined;
    return [{
      id: make.id,
      name: make.name,
      coverImageUrl: make.coverImageUrl,
      size: make.size,
      owner: { handle: owner.handle, name: owner.name, avatarUrl: owner.avatarUrl },
      usedWith: other && other.userId === make.userId ? other.name : null,
      fabricType: null,
    }];
  });
  // Public numbers from public data only: fabric types of public makes made
  // with a public pattern and a public fabric.
  const fabricRows = kind === "pattern"
    ? (await db.execute<{ name: string; n: number }>(sql`
        SELECT lower(trim(f.type)) AS name, count(DISTINCT p.id)::int AS n
        FROM sewspace_projects p
        JOIN sewspace_patterns l ON l.id = p.pattern_id AND l.user_id = p.user_id
        JOIN sewspace_fabrics f ON f.id = p.fabric_id AND f.user_id = p.user_id
        WHERE p.visibility = 'public' AND l.visibility = 'public' AND f.visibility = 'public'
          AND l.catalog_id = ${entry.id} AND trim(f.type) <> ''
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8`)).rows
    : [];
  const fabricsUsed = fabricRows.map((r) => ({ name: r.name, count: Number(r.n) }));
  const extras = await pageExtras(db, viewer, entry, view);
  let myReview = null;
  let inMyLibrary = false;
  if (viewer.userId) {
    const [mine] = await db.select().from(reviewsTable).where(and(eq(reviewsTable.catalogId, entry.id), eq(reviewsTable.userId, viewer.userId)));
    myReview = mine ? (await reviewViews(db, viewer, [mine]))[0] ?? null : null;
    const linkedTables = kind === "pattern" ? [patternsTable] : [fabricsTable, threadsTable];
    for (const table of linkedTables) {
      const [hit] = await db.select({ n: count() }).from(table).where(and(eq(table.userId, viewer.userId), eq(table.catalogId, entry.id)));
      if ((hit?.n ?? 0) > 0) inMyLibrary = true;
    }
  }
  return { entry: view, makes: makes.map(({ fabricType: _t, ...m }) => m), fabricsUsed, myReview, inMyLibrary, ...extras };
}

export interface CatalogSizeView { label: string; bustCm: number | null; waistCm: number | null; hipCm: number | null }

export async function sizeChart(db: Tx, catalogId: number): Promise<CatalogSizeView[]> {
  const rows = await db.select().from(catalogSizesTable).where(eq(catalogSizesTable.catalogId, catalogId)).orderBy(catalogSizesTable.position);
  return rows.map((r) => ({ label: r.label, bustCm: r.bustCm, waistCm: r.waistCm, hipCm: r.hipCm }));
}

/** The pattern page's gallery, size chart, review numbers and designer, all public data. */
async function pageExtras(db: Tx, viewer: Viewer, entry: CatalogEntry, view: CatalogEntryView) {
  // Photos from public makes of public library patterns, newest first.
  const photos = entry.kind === "pattern"
    ? (await db.execute<{ id: number; url: string; user_id: string }>(sql`
        SELECT p.id, p.cover_image_url AS url, p.user_id FROM sewspace_projects p
        JOIN sewspace_patterns l ON l.id = p.pattern_id AND l.user_id = p.user_id
        WHERE p.visibility = 'public' AND l.visibility = 'public' AND p.cover_image_url IS NOT NULL AND l.catalog_id = ${entry.id}
        ORDER BY p.published_at DESC NULLS LAST, p.id DESC LIMIT 6`)).rows
    : [];
  const owners = photos.length
    ? await db.select({ userId: publicProfilesView.userId, handle: publicProfilesView.handle }).from(publicProfilesView)
        .where(inArray(publicProfilesView.userId, [...new Set(photos.map((p) => p.user_id))]))
    : [];
  const handleOf = new Map(owners.map((o) => [o.userId, o.handle]));
  const gallery = photos.flatMap((p) => (handleOf.has(p.user_id) ? [{ url: p.url, makeId: Number(p.id), handle: handleOf.get(p.user_id)! }] : []));

  const numbers = (await db.execute<{ what: string; key: string; n: string }>(sql`SELECT * FROM sewspace_catalog_review_numbers(${entry.id})`)).rows;
  const stars = [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: Number(numbers.find((r) => r.what === "stars" && r.key === String(n))?.n ?? 0) }));
  const alterations = numbers.filter((r) => r.what === "alteration").map((r) => ({ id: r.key, count: Number(r.n) }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  let designerInfo = null;
  if (entry.designerId && view.designer) {
    const [profile] = await db.select({ shopUrl: publicProfilesView.shopUrl, instagram: publicProfilesView.instagram }).from(publicProfilesView)
      .where(eq(publicProfilesView.userId, entry.designerId));
    const [{ patterns }] = await db.select({ patterns: count() }).from(catalogTable).where(eq(catalogTable.designerId, entry.designerId));
    const followed = viewer.userId
      ? (await db.select({ n: count() }).from(followsTable).where(and(eq(followsTable.followerId, viewer.userId), eq(followsTable.followeeId, entry.designerId))))[0].n > 0
      : false;
    designerInfo = { shopUrl: profile?.shopUrl ?? null, instagram: profile?.instagram ?? null, patterns, followedByMe: followed, isMe: entry.designerId === viewer.userId };
  }
  return { gallery, sizes: await sizeChart(db, entry.id), stars, alterations, designerInfo };
}

/** Replace a pattern page's size chart: its creator or an admin. Labels must differ. */
export async function setCatalogSizes(db: Tx, viewer: Viewer, id: number, sizes: CatalogSizeView[]): Promise<Ok<CatalogSizeView[]> | Fail<"not_found" | "invalid">> {
  const [entry] = await db.select().from(catalogTable).where(eq(catalogTable.id, id));
  if (!entry || entry.kind !== "pattern" || !viewer.userId || (entry.createdBy !== viewer.userId && !viewer.isAdmin)) return { ok: false, error: "not_found" };
  const clean = sizes.map((s) => ({ ...s, label: s.label.trim() })).filter((s) => s.label);
  if (new Set(clean.map((s) => s.label.toLowerCase())).size !== clean.length || clean.length > 60) return { ok: false, error: "invalid" };
  await db.delete(catalogSizesTable).where(eq(catalogSizesTable.catalogId, id));
  if (clean.length) {
    await db.insert(catalogSizesTable).values(clean.map((s, position) => ({ catalogId: id, position, label: s.label, bustCm: s.bustCm, waistCm: s.waistCm, hipCm: s.hipCm })));
  }
  return { ok: true, value: await sizeChart(db, id) };
}

/** Entries for the sitemap. */
export async function listCatalogForSitemap(db: Tx, limit = 50000) {
  return db.select({ kind: catalogTable.kind, slug: catalogTable.slug, updatedAt: catalogTable.updatedAt }).from(catalogTable).orderBy(catalogTable.id).limit(limit);
}

export interface CatalogFields {
  name?: string;
  maker?: string;
  category?: string;
  difficulty?: string | null;
  sizes?: string | null;
  fabricTypes?: string | null;
  yardage?: string | null;
  url?: string | null;
  description?: string;
  source?: "free" | "designer";
  priceCents?: number | null;
  currency?: string | null;
  designerHandle?: string | null;
}
type CleanFields = Omit<CatalogFields, "designerHandle">;

type FieldError = "invalid_name" | "invalid_category" | "invalid_url" | "invalid_price" | "not_your_handle";

/**
 * "I designed this": your own handle sets you as the page's designer; an admin
 * may name anyone with a handle. (The database refuses anything else too.)
 */
async function designerFor(db: Tx, viewer: Viewer, handle: string | null): Promise<Ok<string | null> | Fail<"not_your_handle">> {
  if (handle === null) return { ok: true, value: null };
  const clean = handle.trim().replace(/^@/, "").toLowerCase();
  const [person] = await db.select({ userId: publicProfilesView.userId }).from(publicProfilesView).where(sql`lower(${publicProfilesView.handle}) = ${clean}`);
  if (!person || (person.userId !== viewer.userId && !viewer.isAdmin)) return { ok: false, error: "not_your_handle" };
  return { ok: true, value: person.userId };
}

function cleanFields(kind: CatalogKind, input: CatalogFields): Ok<CleanFields> | Fail<FieldError> {
  const out: CleanFields = {};
  const opt = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.trim() || null);
  if (input.name !== undefined) {
    out.name = input.name.trim().replace(/\s+/g, " ");
    if (!out.name) return { ok: false, error: "invalid_name" };
  }
  if (input.maker !== undefined) out.maker = input.maker.trim().replace(/\s+/g, " ");
  if (input.category !== undefined) {
    out.category = input.category.trim().toLowerCase();
    if (!categoriesFor(kind).includes(out.category)) return { ok: false, error: "invalid_category" };
  }
  if (input.difficulty !== undefined) out.difficulty = kind === "pattern" ? input.difficulty : null;
  if (input.url !== undefined) {
    out.url = opt(input.url);
    if (out.url && !/^https?:\/\/[^\s]+$/i.test(out.url)) return { ok: false, error: "invalid_url" };
  }
  out.sizes = kind === "pattern" ? opt(input.sizes) : null;
  out.fabricTypes = kind === "pattern" ? opt(input.fabricTypes) : null;
  out.yardage = kind === "pattern" ? opt(input.yardage) : null;
  if (input.description !== undefined) out.description = input.description.trim();
  // Where to get it. Free has no price; a price needs a currency.
  if (input.source !== undefined) out.source = input.source;
  if (input.priceCents !== undefined || input.currency !== undefined || input.source === "free") {
    const free = (input.source ?? out.source) === "free";
    out.priceCents = free ? null : input.priceCents ?? null;
    out.currency = free ? null : input.currency ? input.currency.toUpperCase() : null;
    if (out.priceCents !== null && (!out.currency || !/^[A-Z]{3}$/.test(out.currency) || out.priceCents < 0 || out.priceCents > 100000)) {
      return { ok: false, error: "invalid_price" };
    }
  }
  return { ok: true, value: out };
}

async function hasHandle(db: Tx, userId: string): Promise<boolean> {
  const [me] = await db.select({ handle: profilesTable.handle }).from(profilesTable).where(eq(profilesTable.userId, userId));
  return Boolean(me?.handle);
}

/** Adds a page, or returns the existing one with the same maker and name. */
export async function createCatalogEntry(
  db: Tx, viewer: Viewer, input: CatalogFields & { kind: CatalogKind; name: string; category: string },
): Promise<Ok<{ entry: CatalogEntryView; created: boolean }> | Fail<FieldError | "no_handle" | "rate_limited">> {
  const me = viewer.userId;
  if (!me || !(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const fields = cleanFields(input.kind, { ...input, maker: input.maker ?? "" });
  if (!fields.ok) return fields;
  const designer = await designerFor(db, viewer, input.designerHandle ?? null);
  if (!designer.ok) return designer;
  const slug = catalogSlug(fields.value.maker ?? "", fields.value.name ?? "");
  if (!slug) return { ok: false, error: "invalid_name" };
  const existing = await findEntry(db, input.kind, slug);
  if (existing) return { ok: true, value: { entry: (await entryViews(db, viewer, [existing]))[0], created: false } };
  const [{ recent }] = await db.select({ recent: count() }).from(catalogTable)
    .where(and(eq(catalogTable.createdBy, me), gt(catalogTable.createdAt, new Date(Date.now() - 86400_000))));
  if (recent >= CATALOG_PER_DAY) return { ok: false, error: "rate_limited" };
  const [row] = await db.insert(catalogTable).values({
    kind: input.kind,
    slug,
    name: fields.value.name!,
    maker: fields.value.maker ?? "",
    category: fields.value.category!,
    difficulty: fields.value.difficulty ?? null,
    sizes: fields.value.sizes ?? null,
    fabricTypes: fields.value.fabricTypes ?? null,
    yardage: fields.value.yardage ?? null,
    url: fields.value.url ?? null,
    description: fields.value.description ?? "",
    source: fields.value.source ?? "designer",
    priceCents: fields.value.priceCents ?? null,
    currency: fields.value.currency ?? null,
    designerId: designer.value,
    createdBy: me,
  }).onConflictDoNothing().returning();
  const entry = row ?? (await findEntry(db, input.kind, slug))!;
  return { ok: true, value: { entry: (await entryViews(db, viewer, [entry]))[0], created: Boolean(row) } };
}

/** Corrections by the person who added the page, or an admin. Kind and slug never change. */
export async function updateCatalogEntry(db: Tx, viewer: Viewer, id: number, input: CatalogFields): Promise<Ok<CatalogEntryView> | Fail<FieldError | "not_found">> {
  const [entry] = await db.select().from(catalogTable).where(eq(catalogTable.id, id));
  if (!entry || !viewer.userId || (entry.createdBy !== viewer.userId && !viewer.isAdmin)) return { ok: false, error: "not_found" };
  const fields = cleanFields(entry.kind, {
    sizes: entry.sizes, fabricTypes: entry.fabricTypes, yardage: entry.yardage, ...input,
  });
  if (!fields.ok) return fields;
  let designerId: string | null | undefined;
  if (input.designerHandle !== undefined) {
    const designer = await designerFor(db, viewer, input.designerHandle);
    if (!designer.ok) return designer;
    designerId = designer.value;
  }
  const [row] = await db.update(catalogTable).set({ ...fields.value, ...(designerId !== undefined ? { designerId } : {}), updatedAt: new Date() }).where(eq(catalogTable.id, id)).returning();
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, value: (await entryViews(db, viewer, [row]))[0] };
}

// ------------------------------------------------------------------ reviews

export interface ReviewView {
  id: number;
  rating: number;
  fit: number | null;
  difficulty: number | null;
  instructions: number | null;
  sizing: "small" | "true" | "large" | null;
  sizeMade: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { handle: string; name: string; avatarUrl: string | null };
  make: { id: number; name: string; coverImageUrl: string | null } | null;
  helpfulCount: number;
  helpedByMe: boolean;
  isMine: boolean;
  alterations: string[];
}

/** Reviews by people the viewer hasn't blocked (and who haven't blocked them). */
function notBlockedReview(viewer: Viewer): SQL | undefined {
  return viewer.userId ? sql`NOT sewspace_blocked_with(${reviewsTable.userId})` : undefined;
}

async function reviewViews(db: Tx, viewer: Viewer, rows: Review[]): Promise<ReviewView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authors = await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, [...new Set(rows.map((r) => r.userId))]));
  const helpful = await db.execute<{ review_id: number; helpful: string }>(sql`SELECT review_id, helpful FROM sewspace_review_helpful(${`{${ids.join(",")}}`}::integer[])`);
  const mine = viewer.userId
    ? await db.select({ id: reviewVotesTable.reviewId }).from(reviewVotesTable).where(and(eq(reviewVotesTable.userId, viewer.userId), inArray(reviewVotesTable.reviewId, ids)))
    : [];
  const makeIds = rows.map((r) => r.makeId).filter((id): id is number => id !== null);
  // A linked make shows only if the viewer may see it.
  const makes = makeIds.length
    ? await db.select({ id: projectsTable.id, name: projectsTable.name, coverImageUrl: projectsTable.coverImageUrl, userId: projectsTable.userId })
        .from(projectsTable).where(and(inArray(projectsTable.id, makeIds), visibleTo(projectsTable, viewer)))
    : [];
  const authorMap = new Map(authors.map((a) => [a.userId, a]));
  const helpfulMap = new Map(helpful.rows.map((h) => [Number(h.review_id), Number(h.helpful)]));
  const votedSet = new Set(mine.map((m) => m.id));
  const makeMap = new Map(makes.map((m) => [m.id, m]));
  return rows.flatMap((r) => {
    const a = authorMap.get(r.userId);
    if (!a) return [];
    const make = r.makeId !== null ? makeMap.get(r.makeId) : undefined;
    return [{
      id: r.id,
      rating: r.rating,
      fit: r.fit,
      difficulty: r.difficulty,
      instructions: r.instructions,
      sizing: r.sizing,
      sizeMade: r.sizeMade,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      author: { handle: a.handle, name: a.name, avatarUrl: a.avatarUrl },
      make: make && make.userId === r.userId ? { id: make.id, name: make.name, coverImageUrl: make.coverImageUrl } : null,
      helpfulCount: helpfulMap.get(r.id) ?? 0,
      helpedByMe: votedSet.has(r.id),
      isMine: r.userId === viewer.userId,
      alterations: r.alterations,
    }];
  });
}

/** Reviews of a page, most helpful first, then newest. */
export async function listReviews(db: Tx, viewer: Viewer, kind: CatalogKind, slug: string): Promise<ReviewView[] | null> {
  const entry = await findEntry(db, kind, slug);
  if (!entry) return null;
  const rows = await db.select().from(reviewsTable)
    .where(and(eq(reviewsTable.catalogId, entry.id), notBlockedReview(viewer)))
    .orderBy(desc(reviewsTable.updatedAt))
    .limit(500);
  const views = await reviewViews(db, viewer, rows);
  return views.sort((a, b) => b.helpfulCount - a.helpfulCount || b.updatedAt.getTime() - a.updatedAt.getTime());
}

export interface ReviewInput {
  rating: number;
  fit?: number | null;
  difficulty?: number | null;
  instructions?: number | null;
  sizing?: "small" | "true" | "large" | null;
  sizeMade?: string | null;
  body?: string;
  makeId?: number | null;
  alterations?: string[];
}

/** The alterations people pick when reviewing (same list as the table CHECK). */
export const ALTERATIONS = [
  "lengthen_bodice", "shorten_bodice", "fba", "sba", "swayback", "lengthen_skirt", "shorten_skirt",
  "grade_sizes", "take_in_waist", "let_out_hips", "narrow_shoulder", "lengthen_sleeves", "shorten_sleeves", "raise_neckline",
] as const;

/** Write or update the viewer's review. Pattern-only scores are dropped on product pages. */
export async function saveReview(db: Tx, viewer: Viewer, catalogId: number, input: ReviewInput): Promise<Ok<ReviewView> | Fail<"not_found" | "no_handle" | "bad_make">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  const [entry] = await db.select().from(catalogTable).where(eq(catalogTable.id, catalogId));
  if (!entry) return { ok: false, error: "not_found" };
  if (!(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const makeId = input.makeId ?? null;
  if (makeId !== null) {
    const [own] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, makeId), eq(projectsTable.userId, me)));
    if (!own) return { ok: false, error: "bad_make" };
  }
  const pattern = entry.kind === "pattern";
  const values = {
    rating: input.rating,
    fit: pattern ? input.fit ?? null : null,
    difficulty: pattern ? input.difficulty ?? null : null,
    instructions: pattern ? input.instructions ?? null : null,
    sizing: pattern ? input.sizing ?? null : null,
    sizeMade: pattern ? input.sizeMade?.trim() || null : null,
    body: (input.body ?? "").trim(),
    makeId,
    alterations: pattern ? [...new Set((input.alterations ?? []).filter((a) => (ALTERATIONS as readonly string[]).includes(a)))].slice(0, 8) : [],
    updatedAt: new Date(),
  };
  const [row] = await db.insert(reviewsTable).values({ catalogId, userId: me, ...values })
    .onConflictDoUpdate({ target: [reviewsTable.catalogId, reviewsTable.userId], set: values })
    .returning();
  const [view] = await reviewViews(db, viewer, [row]);
  if (!view) return { ok: false, error: "no_handle" };
  return { ok: true, value: view };
}

export async function deleteReview(db: Tx, viewer: Viewer, catalogId: number): Promise<void> {
  if (!viewer.userId) return;
  await db.delete(reviewsTable).where(and(eq(reviewsTable.catalogId, catalogId), eq(reviewsTable.userId, viewer.userId)));
}

/** Mark a review you can see as helpful (not your own). */
export async function setHelpful(db: Tx, viewer: Viewer, reviewId: number, on: boolean): Promise<Ok<{ helpful: boolean; helpfulCount: number }> | Fail<"not_found" | "own">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  const [review] = await db.select().from(reviewsTable).where(and(eq(reviewsTable.id, reviewId), notBlockedReview(viewer)));
  if (!review) return { ok: false, error: "not_found" };
  if (on && review.userId === me) return { ok: false, error: "own" };
  if (on) await db.insert(reviewVotesTable).values({ reviewId, userId: me }).onConflictDoNothing();
  else await db.delete(reviewVotesTable).where(and(eq(reviewVotesTable.reviewId, reviewId), eq(reviewVotesTable.userId, me)));
  const r = await db.execute<{ helpful: string }>(sql`SELECT helpful FROM sewspace_review_helpful(${`{${reviewId}}`}::integer[])`);
  return { ok: true, value: { helpful: on, helpfulCount: Number(r.rows[0]?.helpful ?? 0) } };
}

/** A review the viewer can see, for reports. */
export async function visibleReview(db: Tx, viewer: Viewer, reviewId: number) {
  const [row] = await db
    .select({ review: reviewsTable, kind: catalogTable.kind, slug: catalogTable.slug })
    .from(reviewsTable)
    .innerJoin(catalogTable, eq(catalogTable.id, reviewsTable.catalogId))
    .where(and(eq(reviewsTable.id, reviewId), notBlockedReview(viewer)));
  return row ?? null;
}

// ----------------------------------------------------- your library and links

/** Copy a pattern page into your private pattern library (once). */
export async function addToLibrary(db: Tx, viewer: Viewer, catalogId: number): Promise<Ok<{ patternId: number; created: boolean }> | Fail<"not_found" | "not_pattern">> {
  const me = viewer.userId;
  const [entry] = me ? await db.select().from(catalogTable).where(eq(catalogTable.id, catalogId)) : [];
  if (!me || !entry) return { ok: false, error: "not_found" };
  if (entry.kind !== "pattern") return { ok: false, error: "not_pattern" };
  const [existing] = await db.select({ id: patternsTable.id }).from(patternsTable).where(and(eq(patternsTable.userId, me), eq(patternsTable.catalogId, catalogId))).limit(1);
  if (existing) return { ok: true, value: { patternId: existing.id, created: false } };
  const [row] = await db.insert(patternsTable).values({
    userId: me,
    name: entry.name,
    designer: entry.maker || null,
    garmentType: entry.category,
    difficulty: entry.difficulty ?? "intermediate",
    sizes: entry.sizes,
    recommendedFabrics: entry.fabricTypes,
    catalogId,
  }).returning({ id: patternsTable.id });
  return { ok: true, value: { patternId: row.id, created: true } };
}

const LINKABLE = { pattern: patternsTable, fabric: fabricsTable, thread: threadsTable } as const;
export type LinkKind = keyof typeof LINKABLE;

/** Link one of your own patterns/fabrics/threads to a page of the right kind, or unlink. */
export async function setCatalogLink(db: Tx, viewer: Viewer, kind: LinkKind, itemId: number, catalogId: number | null): Promise<Ok<{ kind: LinkKind; id: number; catalogId: number | null }> | Fail<"not_found" | "wrong_kind">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  if (catalogId !== null) {
    const [entry] = await db.select({ kind: catalogTable.kind }).from(catalogTable).where(eq(catalogTable.id, catalogId));
    if (!entry) return { ok: false, error: "not_found" };
    if ((kind === "pattern") !== (entry.kind === "pattern")) return { ok: false, error: "wrong_kind" };
  }
  const table = LINKABLE[kind];
  const [row] = await db.update(table).set({ catalogId }).where(and(eq(table.id, itemId), eq(table.userId, me))).returning({ id: table.id });
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, value: { kind, id: itemId, catalogId } };
}
