import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { fabricsTable, ideasTable, patternsTable, type Idea, type Tx } from "@workspace/db";
import { own } from "./studio";
import type { Viewer } from "./viewer";

// "My ideas" on the studio overview: one of your patterns with one of your
// fabrics, and a short note. Always private: every query filters to the
// caller's rows, and RLS (owner_all, migration 0014) does the same underneath,
// including that the pattern and fabric are the caller's own.

export const IDEAS_PER_HOUR = 60;
export const IDEA_NOTE_MAX = 80;

type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };
export type IdeaView = {
  id: number;
  note: string;
  pattern: { id: number; name: string; imageUrl: string | null };
  fabric: { id: number; name: string; imageUrl: string | null };
  createdAt: Date;
};

async function views(db: Tx, viewer: Viewer, rows: Idea[]): Promise<IdeaView[]> {
  if (!rows.length) return [];
  const patterns = await db.select({ id: patternsTable.id, name: patternsTable.name, imageUrl: patternsTable.coverImageUrl }).from(patternsTable)
    .where(and(own(patternsTable, viewer), inArray(patternsTable.id, rows.map((r) => r.patternId))));
  const fabrics = await db.select({ id: fabricsTable.id, name: fabricsTable.name, imageUrl: fabricsTable.imageUrl }).from(fabricsTable)
    .where(and(own(fabricsTable, viewer), inArray(fabricsTable.id, rows.map((r) => r.fabricId))));
  const p = new Map(patterns.map((x) => [x.id, x])), f = new Map(fabrics.map((x) => [x.id, x]));
  return rows.flatMap((r) => {
    const pattern = p.get(r.patternId), fabric = f.get(r.fabricId);
    return pattern && fabric ? [{ id: r.id, note: r.note, pattern, fabric, createdAt: r.createdAt }] : [];
  });
}

export async function listIdeas(db: Tx, viewer: Viewer): Promise<IdeaView[]> {
  const rows = await db.select().from(ideasTable).where(own(ideasTable, viewer)).orderBy(desc(ideasTable.createdAt), desc(ideasTable.id));
  return views(db, viewer, rows);
}

/** Both items must be the caller's own (a 400 here; RLS WITH CHECK underneath). */
async function ownsBoth(db: Tx, viewer: Viewer, patternId: number, fabricId: number) {
  const [pattern] = await db.select({ id: patternsTable.id }).from(patternsTable).where(and(own(patternsTable, viewer), eq(patternsTable.id, patternId)));
  const [fabric] = await db.select({ id: fabricsTable.id }).from(fabricsTable).where(and(own(fabricsTable, viewer), eq(fabricsTable.id, fabricId)));
  return Boolean(pattern && fabric);
}

const cleanNote = (note: string | undefined) => (note ?? "").trim().replace(/\s+/g, " ");

export async function createIdea(db: Tx, viewer: Viewer, input: { patternId: number; fabricId: number; note?: string }): Promise<Ok<IdeaView> | Fail<"not_yours" | "too_long" | "rate_limited">> {
  const note = cleanNote(input.note);
  if (note.length > IDEA_NOTE_MAX) return { ok: false, error: "too_long" };
  const [{ recent }] = await db.select({ recent: count() }).from(ideasTable)
    .where(and(own(ideasTable, viewer), gt(ideasTable.createdAt, new Date(Date.now() - 3600_000))));
  if (recent >= IDEAS_PER_HOUR) return { ok: false, error: "rate_limited" };
  if (!(await ownsBoth(db, viewer, input.patternId, input.fabricId))) return { ok: false, error: "not_yours" };
  const [row] = await db.insert(ideasTable).values({ userId: viewer.userId!, patternId: input.patternId, fabricId: input.fabricId, note }).returning();
  return { ok: true, value: (await views(db, viewer, [row]))[0] };
}

export async function updateIdea(db: Tx, viewer: Viewer, id: number, input: { patternId?: number; fabricId?: number; note?: string }): Promise<Ok<IdeaView> | Fail<"not_found" | "not_yours" | "too_long">> {
  const [current] = await db.select().from(ideasTable).where(and(own(ideasTable, viewer), eq(ideasTable.id, id)));
  if (!current) return { ok: false, error: "not_found" };
  const patternId = input.patternId ?? current.patternId, fabricId = input.fabricId ?? current.fabricId;
  const note = input.note === undefined ? current.note : cleanNote(input.note);
  if (note.length > IDEA_NOTE_MAX) return { ok: false, error: "too_long" };
  if (!(await ownsBoth(db, viewer, patternId, fabricId))) return { ok: false, error: "not_yours" };
  const [row] = await db.update(ideasTable).set({ patternId, fabricId, note, updatedAt: new Date() })
    .where(and(own(ideasTable, viewer), eq(ideasTable.id, id))).returning();
  return { ok: true, value: (await views(db, viewer, [row]))[0] };
}

export async function deleteIdea(db: Tx, viewer: Viewer, id: number): Promise<boolean> {
  const rows = await db.delete(ideasTable).where(and(own(ideasTable, viewer), eq(ideasTable.id, id))).returning({ id: ideasTable.id });
  return rows.length > 0;
}
