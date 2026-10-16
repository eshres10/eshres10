import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import {
  fabricsTable,
  mediaTable,
  patternsTable,
  postMediaTable,
  postsTable,
  profilesTable,
  projectPhotosTable,
  projectsTable,
  publicProfilesView,
  threadsTable,
  uploadsTable,
  type Tx,
} from "@workspace/db";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

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
//   - the uploader always can;
//   - an 'avatar' upload, once it is the avatar of a profile with a handle;
//   - an 'image' upload, when it is shown on a row of its owner that the
//     viewer may see (visibleTo): a fabric, thread, pattern cover, make cover
//     or make photo;
//   - legacy files with no upload record: when the viewer owns a row that
//     references them.
// Pattern PDFs and AI visualisations are never readable by anyone else.
// Row-level security applies the same rule underneath (migration 0002).
// Callers return 404 when this is false, never 403.
export async function canReadObject(db: Tx, viewer: Viewer, objectPath: string): Promise<boolean> {
  const url = urlForObjectPath(objectPath);
  const [upload] = await db
    .select({ userId: uploadsTable.userId, purpose: uploadsTable.purpose })
    .from(uploadsTable)
    .where(eq(uploadsTable.objectPath, objectPath))
    .limit(1);
  if (!upload) return viewer.userId ? ownsRowReferencing(db, viewer.userId, url) : false;
  if (upload.userId === viewer.userId) return true;
  if (upload.purpose === "avatar") {
    const [profile] = await db
      .select({ handle: publicProfilesView.handle })
      .from(publicProfilesView)
      .where(and(eq(publicProfilesView.userId, upload.userId), eq(publicProfilesView.avatarUrl, url)))
      .limit(1);
    return Boolean(profile);
  }
  if (upload.purpose === "image") return shownOnVisibleRow(db, viewer, upload.userId, url);
  return false;
}

async function shownOnVisibleRow(db: Tx, viewer: Viewer, ownerId: string, url: string): Promise<boolean> {
  const checks: Array<PromiseLike<unknown[]>> = [
    db.select({ id: fabricsTable.id }).from(fabricsTable)
      .where(and(eq(fabricsTable.userId, ownerId), eq(fabricsTable.imageUrl, url), visibleTo(fabricsTable, viewer))).limit(1),
    db.select({ id: threadsTable.id }).from(threadsTable)
      .where(and(eq(threadsTable.userId, ownerId), eq(threadsTable.imageUrl, url), visibleTo(threadsTable, viewer))).limit(1),
    db.select({ id: patternsTable.id }).from(patternsTable)
      .where(and(eq(patternsTable.userId, ownerId), eq(patternsTable.coverImageUrl, url), visibleTo(patternsTable, viewer))).limit(1),
    db.select({ id: projectsTable.id }).from(projectsTable)
      .where(and(eq(projectsTable.userId, ownerId), eq(projectsTable.coverImageUrl, url), visibleTo(projectsTable, viewer))).limit(1),
    db.select({ id: projectPhotosTable.id }).from(projectPhotosTable)
      .innerJoin(projectsTable, eq(projectsTable.id, projectPhotosTable.projectId))
      .where(and(eq(projectPhotosTable.userId, ownerId), eq(projectsTable.userId, ownerId), eq(projectPhotosTable.url, url), visibleTo(projectsTable, viewer))).limit(1),
    // Processed post photos: the full image or thumbnail of media on a visible post.
    db.select({ id: mediaTable.id }).from(mediaTable)
      .innerJoin(postMediaTable, eq(postMediaTable.mediaId, mediaTable.id))
      .innerJoin(postsTable, eq(postsTable.id, postMediaTable.postId))
      .where(and(
        eq(mediaTable.userId, ownerId), eq(postsTable.userId, ownerId),
        or(eq(mediaTable.fullPath, url.replace(/^\/api\/storage/, "")), eq(mediaTable.thumbPath, url.replace(/^\/api\/storage/, ""))) as SQL,
        visibleTo(postsTable, viewer),
      )).limit(1),
  ];
  // One query at a time: a request transaction has a single connection.
  for (const check of checks) if ((await check).length) return true;
  return false;
}

async function ownsRowReferencing(db: Tx, userId: string, url: string): Promise<boolean> {
  const checks: Array<PromiseLike<unknown[]>> = [
    db.select({ id: fabricsTable.id }).from(fabricsTable).where(and(eq(fabricsTable.userId, userId), eq(fabricsTable.imageUrl, url))).limit(1),
    db.select({ id: threadsTable.id }).from(threadsTable).where(and(eq(threadsTable.userId, userId), eq(threadsTable.imageUrl, url))).limit(1),
    db.select({ id: patternsTable.id }).from(patternsTable)
      .where(and(eq(patternsTable.userId, userId), or(eq(patternsTable.coverImageUrl, url), eq(patternsTable.pdfUrl, url)) as SQL)).limit(1),
    db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.userId, userId), eq(projectsTable.coverImageUrl, url))).limit(1),
    db.select({ id: projectPhotosTable.id }).from(projectPhotosTable).where(and(eq(projectPhotosTable.userId, userId), eq(projectPhotosTable.url, url))).limit(1),
    db.select({ id: profilesTable.id }).from(profilesTable).where(and(eq(profilesTable.userId, userId), eq(profilesTable.avatarUrl, url))).limit(1),
  ];
  // One query at a time: a request transaction has a single connection.
  for (const check of checks) if ((await check).length) return true;
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
