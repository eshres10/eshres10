import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import {
  fabricsTable,
  patternsTable,
  profilesTable,
  projectPhotosTable,
  projectsTable,
  threadsTable,
  uploadsTable,
  type Tx,
} from "@workspace/db";
import type { Viewer } from "./viewer";

export type UploadPurpose = "image" | "avatar" | "pattern_pdf" | "visualization";

// Purposes accepted by each kind of field. Visualisations and PDFs never go in
// image fields, so they can never become public through a shared make or post.
export const IMAGE_FIELD: readonly UploadPurpose[] = ["image"];
export const PDF_FIELD: readonly UploadPurpose[] = ["pattern_pdf"];
export const AVATAR_FIELD: readonly UploadPurpose[] = ["avatar"];

const URL_PREFIX = "/api/storage";

/** "/api/storage/objects/uploads/x" -> "/objects/uploads/x"; anything else -> null. */
export function objectPathFromUrl(url: string): string | null {
  const match = /^\/api\/storage(\/objects\/[A-Za-z0-9._\-/]+)$/.exec(url);
  if (!match || match[1].includes("..")) return null;
  return match[1];
}

export function urlForObjectPath(objectPath: string): string {
  return URL_PREFIX + objectPath;
}

// Whether the viewer may download a stored object:
//   1. it is registered in sewspace_uploads and RLS lets the viewer see that row
//      (their own upload, or a public avatar), or
//   2. legacy fallback: the viewer owns a row that references the object.
// Callers return 404 when this is false, never 403.
export async function canReadObject(db: Tx, viewer: Viewer, objectPath: string): Promise<boolean> {
  const [registered] = await db
    .select({ objectPath: uploadsTable.objectPath })
    .from(uploadsTable)
    .where(eq(uploadsTable.objectPath, objectPath))
    .limit(1);
  if (registered) return true;
  if (!viewer.userId) return false;
  return ownsRowReferencing(db, viewer.userId, urlForObjectPath(objectPath));
}

async function ownsRowReferencing(db: Tx, userId: string, url: string): Promise<boolean> {
  const checks: Array<Promise<unknown[]>> = [
    db.select({ id: fabricsTable.id }).from(fabricsTable).where(and(eq(fabricsTable.userId, userId), eq(fabricsTable.imageUrl, url))).limit(1),
    db.select({ id: threadsTable.id }).from(threadsTable).where(and(eq(threadsTable.userId, userId), eq(threadsTable.imageUrl, url))).limit(1),
    db.select({ id: patternsTable.id }).from(patternsTable)
      .where(and(eq(patternsTable.userId, userId), or(eq(patternsTable.coverImageUrl, url), eq(patternsTable.pdfUrl, url)) as SQL)).limit(1),
    db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.userId, userId), eq(projectsTable.coverImageUrl, url))).limit(1),
    db.select({ id: projectPhotosTable.id }).from(projectPhotosTable).where(and(eq(projectPhotosTable.userId, userId), eq(projectPhotosTable.url, url))).limit(1),
    db.select({ id: profilesTable.id }).from(profilesTable).where(and(eq(profilesTable.userId, userId), eq(profilesTable.avatarUrl, url))).limit(1),
  ];
  for (const rows of await Promise.all(checks)) if (rows.length) return true;
  return false;
}

// Checks every file field a create or update request sets. Each value must be
// null, unchanged from the stored row (legacy values stay usable), or the URL of
// an object this viewer uploaded for an allowed purpose. Returns the first
// offending field, or null when all are fine.
export async function findForeignObjectField(
  db: Tx,
  viewer: Viewer,
  values: Record<string, unknown>,
  fields: Record<string, readonly UploadPurpose[]>,
  existing?: Record<string, unknown> | null,
): Promise<string | null> {
  for (const [field, purposes] of Object.entries(fields)) {
    const value = values[field];
    if (value === undefined || value === null || value === "") continue;
    if (existing && existing[field] === value) continue;
    if (typeof value !== "string" || !viewer.userId) return field;
    const objectPath = objectPathFromUrl(value);
    if (!objectPath) return field;
    const [own] = await db
      .select({ objectPath: uploadsTable.objectPath })
      .from(uploadsTable)
      .where(and(
        eq(uploadsTable.objectPath, objectPath),
        eq(uploadsTable.userId, viewer.userId),
        inArray(uploadsTable.purpose, [...purposes]),
      ))
      .limit(1);
    if (!own) return field;
  }
  return null;
}
