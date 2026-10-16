import { and, asc, eq } from "drizzle-orm";
import {
  fabricsTable,
  patternsTable,
  projectPhotosTable,
  projectStepsTable,
  projectsTable,
  publicProfilesView,
  threadsTable,
  type Tx,
} from "@workspace/db";
import { catalogRefs, type CatalogRef } from "./catalog-refs";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

export interface PublicMaterial {
  kind: "pattern" | "fabric" | "thread";
  id: number;
  name: string;
  detail: string | null;
  color: string | null;
  imageUrl: string | null;
  /** The shared page this item is linked to, if any (Phase 5). */
  catalog: CatalogRef | null;
}

function joinDetail(...parts: Array<string | null | undefined>): string | null {
  const text = parts.filter(Boolean).join(" · ");
  return text || null;
}

// A make as the viewer may see it, or null. Only fields meant for sharing are
// returned: never the linked measurement profile or the pattern PDF. Linked
// materials are included only when the viewer may see each of them too.
export async function getMakeForViewer(db: Tx, viewer: Viewer, id: number) {
  const [make] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, id), visibleTo(projectsTable, viewer))).limit(1);
  if (!make) return null;

  const [owner] = await db
    .select({ handle: publicProfilesView.handle, name: publicProfilesView.name, avatarUrl: publicProfilesView.avatarUrl })
    .from(publicProfilesView)
    .where(eq(publicProfilesView.userId, make.userId))
    .limit(1);
  const steps = await db.select({ title: projectStepsTable.title, completed: projectStepsTable.completed })
    .from(projectStepsTable)
    .where(and(eq(projectStepsTable.projectId, make.id), eq(projectStepsTable.userId, make.userId)))
    .orderBy(asc(projectStepsTable.position), asc(projectStepsTable.id));
  const photos = await db.select({ url: projectPhotosTable.url, caption: projectPhotosTable.caption })
    .from(projectPhotosTable)
    .where(and(eq(projectPhotosTable.projectId, make.id), eq(projectPhotosTable.userId, make.userId)))
    .orderBy(asc(projectPhotosTable.position), asc(projectPhotosTable.id));

  const materials: PublicMaterial[] = [];
  const linked: Array<number | null> = [];
  if (make.patternId) {
    const [p] = await db.select().from(patternsTable)
      .where(and(eq(patternsTable.id, make.patternId), eq(patternsTable.userId, make.userId), visibleTo(patternsTable, viewer)));
    if (p) { materials.push({ kind: "pattern", id: p.id, name: p.name, detail: joinDetail(p.designer, p.garmentType), color: null, imageUrl: p.coverImageUrl, catalog: null }); linked.push(p.catalogId); }
  }
  if (make.fabricId) {
    const [f] = await db.select().from(fabricsTable)
      .where(and(eq(fabricsTable.id, make.fabricId), eq(fabricsTable.userId, make.userId), visibleTo(fabricsTable, viewer)));
    if (f) { materials.push({ kind: "fabric", id: f.id, name: f.name, detail: joinDetail(f.type, f.composition), color: f.color, imageUrl: f.imageUrl, catalog: null }); linked.push(f.catalogId); }
  }
  if (make.threadId) {
    const [t] = await db.select().from(threadsTable)
      .where(and(eq(threadsTable.id, make.threadId), eq(threadsTable.userId, make.userId), visibleTo(threadsTable, viewer)));
    if (t) { materials.push({ kind: "thread", id: t.id, name: `${t.brand} ${t.colorName}`, detail: joinDetail(t.type, t.weight), color: t.color, imageUrl: t.imageUrl, catalog: null }); linked.push(t.catalogId); }
  }

  const refs = await catalogRefs(db, linked);
  materials.forEach((m, i) => { m.catalog = refs.get(linked[i] ?? -1) ?? null; });

  return {
    id: make.id,
    name: make.name,
    status: make.status,
    progress: make.progress,
    size: make.size,
    description: make.description,
    notes: make.notes,
    alterations: make.alterations,
    problems: make.problems,
    solutions: make.solutions,
    coverImageUrl: make.coverImageUrl,
    completedAt: make.completedAt,
    publishedAt: make.publishedAt,
    visibility: make.visibility,
    isOwner: make.userId === viewer.userId,
    owner: owner ?? null,
    steps,
    photos,
    materials,
  };
}

/** Public makes for the sitemap (only "public", whoever is asking). */
export async function listPublicMakes(db: Tx, limit = 50000) {
  return db
    .select({ id: projectsTable.id, updatedAt: projectsTable.updatedAt })
    .from(projectsTable)
    .innerJoin(publicProfilesView, eq(publicProfilesView.userId, projectsTable.userId))
    .where(eq(projectsTable.visibility, "public"))
    .orderBy(asc(projectsTable.id))
    .limit(limit);
}
