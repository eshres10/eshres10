import { inArray, sql } from "drizzle-orm";
import { publicProfilesView, type Tx } from "@workspace/db";
import type { Viewer } from "./viewer";
import { handleBaseFromName, handleCandidates, handleProblem, normaliseHandle, type HandleProblem } from "./handles";

export interface PublicProfile {
  handle: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  joinedAt: Date;
}

// Public fields of a profile, for anyone including signed-out visitors. Reads the
// sewspace_public_profiles view, which only has rows with a handle and only safe columns.
export async function getPublicProfile(db: Tx, rawHandle: string): Promise<PublicProfile | null> {
  const handle = normaliseHandle(rawHandle);
  const problem = handleProblem(handle);
  if (problem && problem !== "reserved") return null;
  const [row] = await db
    .select()
    .from(publicProfilesView)
    .where(sql`lower(${publicProfilesView.handle}) = ${handle}`)
    .limit(1);
  if (!row) return null;
  return { handle: row.handle, name: row.name, bio: row.bio, avatarUrl: row.avatarUrl, joinedAt: row.createdAt };
}

/** Handles for the sitemap. */
export async function listPublicHandles(db: Tx, limit = 50000): Promise<Array<{ handle: string; joinedAt: Date }>> {
  const rows = await db
    .select({ handle: publicProfilesView.handle, joinedAt: publicProfilesView.createdAt })
    .from(publicProfilesView)
    .orderBy(publicProfilesView.handle)
    .limit(limit);
  return rows;
}

export type Availability = {
  handle: string;
  available: boolean;
  reason: "ok" | "yours" | "taken" | HandleProblem;
  suggestion: string | null;
};

async function takenBy(db: Tx, handles: string[]): Promise<Map<string, string>> {
  if (!handles.length) return new Map();
  const rows = await db
    .select({ handle: publicProfilesView.handle, userId: publicProfilesView.userId })
    .from(publicProfilesView)
    .where(inArray(sql`lower(${publicProfilesView.handle})`, handles));
  return new Map(rows.map((r) => [r.handle.toLowerCase(), r.userId]));
}

async function firstFree(db: Tx, viewer: Viewer, base: string): Promise<string | null> {
  const candidates = handleCandidates(base);
  const owners = await takenBy(db, candidates);
  return candidates.find((c) => !owners.has(c) || owners.get(c) === viewer.userId) ?? null;
}

// Whether the viewer can claim a handle. When not, suggests a free alternative
// based on the requested handle (or the viewer's name when it is unusable).
export async function handleAvailability(db: Tx, viewer: Viewer, raw: string, name: string): Promise<Availability> {
  const handle = normaliseHandle(raw);
  const problem = handleProblem(handle);
  if (problem) {
    const base = problem === "reserved" ? handleBaseFromName(`${handle}.sews`) : handleBaseFromName(handle || name);
    return { handle, available: false, reason: problem, suggestion: await firstFree(db, viewer, base) };
  }
  const owner = (await takenBy(db, [handle])).get(handle);
  if (owner === viewer.userId) return { handle, available: true, reason: "yours", suggestion: null };
  if (owner) return { handle, available: false, reason: "taken", suggestion: await firstFree(db, viewer, handle.slice(0, 27)) };
  return { handle, available: true, reason: "ok", suggestion: null };
}

