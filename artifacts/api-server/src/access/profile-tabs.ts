import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { fabricsTable, followsTable, patternsTable, postsTable, projectsTable, publicProfilesView, threadsTable, type Project, type Tx } from "@workspace/db";
import type { PublicMaterial } from "./makes";
import { pagePosts } from "./posts";
import { normaliseHandle, handleProblem } from "./handles";
import type { PublicProfile } from "./profiles";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// A profile page: the header with its numbers, and the Posts, Makes and Used
// products tabs. Every list only holds what this viewer may see (visibleTo),
// and a profile on the other side of a block doesn't exist at all.

/** The profile row behind a handle, or null if missing, without a handle, or blocked either way. */
export async function findProfile(db: Tx, viewer: Viewer, rawHandle: string) {
  const handle = normaliseHandle(rawHandle);
  const problem = handleProblem(handle);
  if (problem && problem !== "reserved") return null;
  const [row] = await db
    .select()
    .from(publicProfilesView)
    .where(and(
      sql`lower(${publicProfilesView.handle}) = ${handle}`,
      // The view hides blocked profiles too; this keeps the rule in the module.
      viewer.userId ? sql`NOT sewspace_blocked_with(${publicProfilesView.userId})` : undefined,
    ))
    .limit(1);
  return row ?? null;
}

export interface ProfileStats {
  posts: number;
  makes: number;
  followers: number;
  following: number;
  followersOnlyPosts: number;
  followersOnlyMakes: number;
}

export type ProfilePage = PublicProfile & { isMe: boolean; stats: ProfileStats; followedByMe: boolean };

/** Header of a profile page, with counts of what this viewer may see. */
export async function getProfilePage(db: Tx, viewer: Viewer, handle: string): Promise<ProfilePage | null> {
  const row = await findProfile(db, viewer, handle);
  if (!row) return null;
  const uid = row.userId;
  // Sequential on purpose: a request transaction has a single connection.
  const [posts] = await db.select({ n: count() }).from(postsTable).where(and(eq(postsTable.userId, uid), visibleTo(postsTable, viewer)));
  const [makes] = await db.select({ n: count() }).from(projectsTable).where(and(eq(projectsTable.userId, uid), visibleTo(projectsTable, viewer)));
  // Follows and others' followers-only rows aren't readable; these functions
  // return only the numbers (migration 0004).
  const follows = await db.execute<{ followers: string; following: string }>(sql`SELECT followers, following FROM sewspace_follow_counts(${uid})`);
  const locked = await db.execute<{ posts: string; makes: string }>(sql`SELECT posts, makes FROM sewspace_followers_only_counts(${uid})`);
  const f = follows.rows[0], l = locked.rows[0];
  const [mine] = viewer.userId && viewer.userId !== uid
    ? await db.select({ n: count() }).from(followsTable).where(and(eq(followsTable.followerId, viewer.userId), eq(followsTable.followeeId, uid)))
    : [{ n: 0 }];
  return {
    handle: row.handle,
    name: row.name,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    joinedAt: row.createdAt,
    isMe: viewer.userId === uid,
    followedByMe: (mine?.n ?? 0) > 0,
    stats: {
      posts: posts?.n ?? 0,
      makes: makes?.n ?? 0,
      followers: Number(f?.followers ?? 0),
      following: Number(f?.following ?? 0),
      followersOnlyPosts: Number(l?.posts ?? 0),
      followersOnlyMakes: Number(l?.makes ?? 0),
    },
  };
}

/** Posts tab: the person's posts the viewer may see, newest first. */
export async function getProfilePosts(db: Tx, viewer: Viewer, handle: string, cursor?: string) {
  const row = await findProfile(db, viewer, handle);
  if (!row) return null;
  return pagePosts(db, viewer, eq(postsTable.userId, row.userId), cursor);
}

function joinDetail(...parts: Array<string | null | undefined>): string | null {
  return parts.filter(Boolean).join(" · ") || null;
}

// The patterns, fabrics and threads linked from these makes that the viewer
// may see, keyed "kind:id". Only the owner's own items count.
async function materialsOf(db: Tx, viewer: Viewer, uid: string, makes: Project[]): Promise<Map<string, PublicMaterial>> {
  const ids = (key: "patternId" | "fabricId" | "threadId") => [...new Set(makes.map((m) => m[key]).filter((id): id is number => id !== null))];
  const patternIds = ids("patternId"), fabricIds = ids("fabricId"), threadIds = ids("threadId");
  const found = new Map<string, PublicMaterial>();
  if (patternIds.length) {
    const rows = await db.select().from(patternsTable)
      .where(and(inArray(patternsTable.id, patternIds), eq(patternsTable.userId, uid), visibleTo(patternsTable, viewer)));
    for (const p of rows) found.set(`pattern:${p.id}`, { kind: "pattern", id: p.id, name: p.name, detail: joinDetail(p.designer, p.garmentType), color: null, imageUrl: p.coverImageUrl });
  }
  if (fabricIds.length) {
    const rows = await db.select().from(fabricsTable)
      .where(and(inArray(fabricsTable.id, fabricIds), eq(fabricsTable.userId, uid), visibleTo(fabricsTable, viewer)));
    for (const f of rows) found.set(`fabric:${f.id}`, { kind: "fabric", id: f.id, name: f.name, detail: joinDetail(f.type, f.composition), color: f.color, imageUrl: f.imageUrl });
  }
  if (threadIds.length) {
    const rows = await db.select().from(threadsTable)
      .where(and(inArray(threadsTable.id, threadIds), eq(threadsTable.userId, uid), visibleTo(threadsTable, viewer)));
    for (const t of rows) found.set(`thread:${t.id}`, { kind: "thread", id: t.id, name: `${t.brand} ${t.colorName}`, detail: joinDetail(t.type, t.weight), color: t.color, imageUrl: t.imageUrl });
  }
  return found;
}

function materialsFor(make: Project, materials: Map<string, PublicMaterial>): PublicMaterial[] {
  return [
    make.patternId ? materials.get(`pattern:${make.patternId}`) : undefined,
    make.fabricId ? materials.get(`fabric:${make.fabricId}`) : undefined,
    make.threadId ? materials.get(`thread:${make.threadId}`) : undefined,
  ].filter((m): m is PublicMaterial => Boolean(m));
}

async function visibleMakes(db: Tx, viewer: Viewer, uid: string): Promise<Project[]> {
  return db.select().from(projectsTable)
    .where(and(eq(projectsTable.userId, uid), visibleTo(projectsTable, viewer)))
    .orderBy(sql`${projectsTable.completedAt} DESC NULLS LAST`, sql`${projectsTable.publishedAt} DESC NULLS LAST`, desc(projectsTable.id))
    .limit(500);
}

/** Makes tab: finished makes first, then shared makes still in progress. */
export async function getProfileMakes(db: Tx, viewer: Viewer, handle: string) {
  const row = await findProfile(db, viewer, handle);
  if (!row) return null;
  const makes = await visibleMakes(db, viewer, row.userId);
  const materials = await materialsOf(db, viewer, row.userId, makes);
  // Never the measurement profile or pattern PDF: only these fields leave.
  const summary = (m: Project) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    progress: m.progress,
    size: m.size,
    alterations: m.alterations,
    coverImageUrl: m.coverImageUrl,
    completedAt: m.completedAt,
    publishedAt: m.publishedAt,
    visibility: m.visibility,
    materials: materialsFor(m, materials),
  });
  return {
    finished: makes.filter((m) => m.status === "finished").map(summary),
    inProgress: makes.filter((m) => m.status !== "finished").map(summary),
  };
}

const KIND_ORDER = { pattern: 0, fabric: 1, thread: 2 } as const;

/** Used products tab: each visible pattern, fabric and thread with the visible makes it went into. */
export async function getProfileUsed(db: Tx, viewer: Viewer, handle: string) {
  const row = await findProfile(db, viewer, handle);
  if (!row) return null;
  const makes = await visibleMakes(db, viewer, row.userId);
  const materials = await materialsOf(db, viewer, row.userId, makes);
  const usedIn = new Map<string, Array<{ id: number; name: string; coverImageUrl: string | null }>>();
  for (const make of makes) {
    for (const m of materialsFor(make, materials)) {
      const key = `${m.kind}:${m.id}`;
      usedIn.set(key, [...(usedIn.get(key) ?? []), { id: make.id, name: make.name, coverImageUrl: make.coverImageUrl }]);
    }
  }
  const items = [...materials.entries()]
    .filter(([key]) => usedIn.has(key))
    .map(([key, m]) => ({ ...m, makes: usedIn.get(key)! }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.makes.length - a.makes.length || a.name.localeCompare(b.name));
  return { items };
}
