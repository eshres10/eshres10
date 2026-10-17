import { and, sql } from "drizzle-orm";
import { draftsTable, type DraftKind, type Tx } from "@workspace/db";
import { findForeignObjectField, type UploadPurpose } from "./objects";
import { own } from "./studio";
import type { Viewer } from "./viewer";

// Drafts are private to their owner: every query here filters to the caller's
// own rows, and RLS (owner_all, migration 0009) enforces the same underneath.

export const DRAFT_MAX_BYTES = 65536;
const ANY_PURPOSE: readonly UploadPurpose[] = ["image", "avatar", "pattern_pdf", "visualization"];

export function draftResponse(row: typeof draftsTable.$inferSelect) {
  return { kind: row.kind, payload: row.payload, updatedAt: row.updatedAt.toISOString() };
}

export async function getDraft(db: Tx, viewer: Viewer, kind: DraftKind) {
  const [row] = await db.select().from(draftsTable)
    .where(and(own(draftsTable, viewer), sql`${draftsTable.kind} = ${kind}`)).limit(1);
  return row ?? null;
}

// Every string in the payload that looks like a stored file. Each must be an
// upload of the caller's (findForeignObjectField), so a draft can't be used to
// pin someone else's file to your account.
function fileStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.startsWith("/api/storage/")) out.push(value);
    else if (value.startsWith("/objects/")) out.push(`/api/storage${value}`);
  } else if (Array.isArray(value)) {
    for (const item of value) fileStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) fileStrings(item, out);
  }
  return out;
}

export type SaveDraftResult =
  | { ok: true; value: typeof draftsTable.$inferSelect }
  | { ok: false; error: "too_large" | "invalid" | "foreign_file" };

export async function saveDraft(db: Tx, viewer: Viewer, kind: DraftKind, payload: Record<string, unknown>): Promise<SaveDraftResult> {
  if (!viewer.userId) return { ok: false, error: "invalid" };
  const text = JSON.stringify(payload);
  // Postgres jsonb can't hold \u0000; the size limit is checked on jsonb's own
  // text form, as the table's CHECK does, so the two never disagree.
  if (text.includes("\\u0000")) return { ok: false, error: "invalid" };
  if (Buffer.byteLength(text) > DRAFT_MAX_BYTES * 2) return { ok: false, error: "too_large" };
  const [{ bytes }] = (await db.execute<{ bytes: number }>(sql`SELECT octet_length(${text}::jsonb::text) AS bytes`)).rows;
  if (Number(bytes) > DRAFT_MAX_BYTES) return { ok: false, error: "too_large" };

  const files = [...new Set(fileStrings(payload))];
  for (const url of files) {
    if (await findForeignObjectField(db, viewer, { file: url }, { file: ANY_PURPOSE })) return { ok: false, error: "foreign_file" };
  }

  const [row] = await db.insert(draftsTable)
    .values({ userId: viewer.userId, kind, payload })
    .onConflictDoUpdate({ target: [draftsTable.userId, draftsTable.kind], set: { payload, updatedAt: sql`now()` } })
    .returning();
  return { ok: true, value: row };
}

export async function deleteDraft(db: Tx, viewer: Viewer, kind: DraftKind): Promise<void> {
  await db.delete(draftsTable).where(and(own(draftsTable, viewer), sql`${draftsTable.kind} = ${kind}`));
}
