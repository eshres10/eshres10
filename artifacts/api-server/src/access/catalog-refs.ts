import { inArray } from "drizzle-orm";
import { catalogTable, type CatalogKind, type Tx } from "@workspace/db";

export interface CatalogRef { kind: CatalogKind; slug: string; name: string }

/** The shared pages behind some catalog ids (pages are public, so no viewer check). */
export async function catalogRefs(db: Tx, ids: Array<number | null | undefined>): Promise<Map<number, CatalogRef>> {
  const wanted = [...new Set(ids.filter((id): id is number => typeof id === "number"))];
  if (!wanted.length) return new Map();
  const rows = await db
    .select({ id: catalogTable.id, kind: catalogTable.kind, slug: catalogTable.slug, name: catalogTable.name })
    .from(catalogTable)
    .where(inArray(catalogTable.id, wanted));
  return new Map(rows.map((r) => [r.id, { kind: r.kind, slug: r.slug, name: r.name }]));
}
