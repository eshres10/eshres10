import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  commentsTable,
  followsTable,
  likesTable,
  postsTable,
  profilesTable,
  publicProfilesView,
  reportsTable,
  savesTable,
  type Comment,
  type Post,
  type Report,
  type Tx,
} from "@workspace/db";
import { decodeCursor, encodeCursor, FEED_PAGE_SIZE, hydratePosts } from "./posts";
import { findProfile } from "./profile-tabs";
import { normaliseHandle } from "./handles";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Likes, comments, saves, follows, blocks and reports. Every action starts by
// checking, here, that the viewer may see what they act on; RLS (migration
// 0005) checks the same again. Comments from people on the other side of a
// block are never shown or counted.

export const COMMENTS_PER_HOUR = 60;
export const REPORTS_PER_DAY = 20;
const MAX_COMMENTS = 1000;

type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };

async function visiblePost(db: Tx, viewer: Viewer, id: number): Promise<Post | null> {
  const [post] = await db.select().from(postsTable).where(and(eq(postsTable.id, id), visibleTo(postsTable, viewer))).limit(1);
  return post ?? null;
}

/** Comments by people the viewer hasn't blocked (and who haven't blocked them). */
function notBlockedComment(viewer: Viewer): SQL | undefined {
  return viewer.userId ? sql`NOT sewspace_blocked_with(${commentsTable.userId})` : undefined;
}

async function hasHandle(db: Tx, userId: string): Promise<boolean> {
  const [me] = await db.select({ handle: profilesTable.handle }).from(profilesTable).where(eq(profilesTable.userId, userId));
  return Boolean(me?.handle);
}

// ---------------------------------------------------------------- comments

export interface CommentReplyView {
  id: number;
  postId: number;
  parentId: number | null;
  body: string;
  createdAt: Date;
  author: { handle: string; name: string; avatarUrl: string | null };
  canDelete: boolean;
}
export type CommentView = CommentReplyView & { replies: CommentReplyView[] };

async function commentViews(db: Tx, viewer: Viewer, post: Post, rows: Comment[]): Promise<CommentView[]> {
  const ids = [...new Set(rows.map((c) => c.userId))];
  const authors = ids.length ? await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, ids)) : [];
  const byUser = new Map(authors.map((a) => [a.userId, a]));
  const view = (c: Comment): CommentReplyView | null => {
    const a = byUser.get(c.userId);
    if (!a) return null;
    return {
      id: c.id,
      postId: c.postId,
      parentId: c.parentId,
      body: c.body,
      createdAt: c.createdAt,
      author: { handle: a.handle, name: a.name, avatarUrl: a.avatarUrl },
      canDelete: Boolean(viewer.userId) && (c.userId === viewer.userId || post.userId === viewer.userId),
    };
  };
  const top: CommentView[] = [];
  const byId = new Map<number, CommentView>();
  for (const c of rows.filter((r) => r.parentId === null)) {
    const v = view(c);
    if (!v) continue;
    const withReplies = { ...v, replies: [] };
    top.push(withReplies);
    byId.set(c.id, withReplies);
  }
  for (const c of rows.filter((r) => r.parentId !== null)) {
    const v = view(c);
    if (v) byId.get(c.parentId!)?.replies.push(v);
  }
  return top;
}

/** Comments on a post the viewer may see, oldest first, with replies; null if the post isn't visible. */
export async function listComments(db: Tx, viewer: Viewer, postId: number): Promise<CommentView[] | null> {
  const post = await visiblePost(db, viewer, postId);
  if (!post) return null;
  const rows = await db
    .select()
    .from(commentsTable)
    .where(and(eq(commentsTable.postId, postId), notBlockedComment(viewer)))
    .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id))
    .limit(MAX_COMMENTS);
  return commentViews(db, viewer, post, rows);
}

export type CommentError = "not_found" | "bad_parent" | "no_handle" | "rate_limited" | "empty";

export async function addComment(
  db: Tx, viewer: Viewer, postId: number, rawBody: string, parentId: number | null,
): Promise<Ok<CommentView> | Fail<CommentError>> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  const body = rawBody.trim();
  if (!body || body.length > 1000) return { ok: false, error: "empty" };
  const post = await visiblePost(db, viewer, postId);
  if (!post) return { ok: false, error: "not_found" };
  if (!(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const [{ recent }] = await db.select({ recent: count() }).from(commentsTable)
    .where(and(eq(commentsTable.userId, me), gt(commentsTable.createdAt, new Date(Date.now() - 3600_000))));
  if (recent >= COMMENTS_PER_HOUR) return { ok: false, error: "rate_limited" };
  if (parentId !== null) {
    const [parent] = await db.select({ id: commentsTable.id }).from(commentsTable)
      .where(and(eq(commentsTable.id, parentId), eq(commentsTable.postId, postId), isNull(commentsTable.parentId), notBlockedComment(viewer)));
    if (!parent) return { ok: false, error: "bad_parent" };
  }
  const [row] = await db.insert(commentsTable).values({ postId, userId: me, parentId, body }).returning();
  const [view] = await commentViews(db, viewer, post, [{ ...row, parentId: null }]);
  return { ok: true, value: { ...view, parentId: row.parentId } };
}

/** Deletes your comment, or any comment on your post. False if there was nothing you may delete. */
export async function removeComment(db: Tx, viewer: Viewer, id: number): Promise<boolean> {
  const me = viewer.userId;
  if (!me) return false;
  const deleted = await db
    .delete(commentsTable)
    .where(and(
      eq(commentsTable.id, id),
      or(eq(commentsTable.userId, me), inArray(commentsTable.postId, db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.userId, me)))),
    ))
    .returning({ id: commentsTable.id });
  return deleted.length > 0;
}

// ---------------------------------------------------------- likes and saves

/** Like or unlike a post the viewer may see. Null if it isn't visible. */
export async function setLike(db: Tx, viewer: Viewer, postId: number, on: boolean) {
  const me = viewer.userId;
  if (!me || !(await visiblePost(db, viewer, postId))) return null;
  if (on) await db.insert(likesTable).values({ userId: me, postId }).onConflictDoNothing();
  else await db.delete(likesTable).where(and(eq(likesTable.userId, me), eq(likesTable.postId, postId)));
  const [{ n }] = await db.select({ n: count() }).from(likesTable).where(eq(likesTable.postId, postId));
  return { liked: on, likeCount: n };
}

/** Save a post the viewer may see (null if not visible), or unsave any post. */
export async function setSave(db: Tx, viewer: Viewer, postId: number, on: boolean) {
  const me = viewer.userId;
  if (!me) return null;
  if (on) {
    if (!(await visiblePost(db, viewer, postId))) return null;
    await db.insert(savesTable).values({ userId: me, postId }).onConflictDoNothing();
  } else {
    await db.delete(savesTable).where(and(eq(savesTable.userId, me), eq(savesTable.postId, postId)));
  }
  return { saved: on };
}

/** Saved posts the viewer may still see, most recently saved first. */
export async function savedFeed(db: Tx, viewer: Viewer, cursor?: string) {
  const me = viewer.userId;
  if (!me) throw new Error("savedFeed needs a signed-in viewer");
  const after = decodeCursor(cursor);
  const rows = await db
    .select({ post: postsTable, savedAt: savesTable.createdAt })
    .from(savesTable)
    .innerJoin(postsTable, eq(postsTable.id, savesTable.postId))
    .where(and(
      eq(savesTable.userId, me),
      visibleTo(postsTable, viewer),
      after ? or(sql`${savesTable.createdAt} < ${after.createdAt}`, and(eq(savesTable.createdAt, after.createdAt), sql`${savesTable.postId} < ${after.id}`)) : undefined,
    ))
    .orderBy(desc(savesTable.createdAt), desc(savesTable.postId))
    .limit(FEED_PAGE_SIZE + 1);
  const shown = rows.slice(0, FEED_PAGE_SIZE);
  const last = shown[shown.length - 1];
  return {
    items: await hydratePosts(db, viewer, shown.map((r) => r.post)),
    nextCursor: rows.length > FEED_PAGE_SIZE && last ? encodeCursor({ createdAt: last.savedAt, id: last.post.id }) : null,
  };
}

// --------------------------------------------------------- follows and blocks

async function followerCount(db: Tx, uid: string): Promise<number> {
  const r = await db.execute<{ followers: string }>(sql`SELECT followers FROM sewspace_follow_counts(${uid})`);
  return Number(r.rows[0]?.followers ?? 0);
}

export async function setFollow(db: Tx, viewer: Viewer, handle: string, on: boolean): Promise<Ok<{ following: boolean; followers: number }> | Fail<"not_found" | "self">> {
  const me = viewer.userId;
  const profile = me ? await findProfile(db, viewer, handle) : null;
  if (!me || !profile) return { ok: false, error: "not_found" };
  if (profile.userId === me) return { ok: false, error: "self" };
  if (on) await db.insert(followsTable).values({ followerId: me, followeeId: profile.userId }).onConflictDoNothing();
  else await db.delete(followsTable).where(and(eq(followsTable.followerId, me), eq(followsTable.followeeId, profile.userId)));
  return { ok: true, value: { following: on, followers: await followerCount(db, profile.userId) } };
}

export interface BlockedPerson { userId: string; handle: string; name: string; avatarUrl: string | null; blockedAt: Date }

/** People the viewer blocked (the public profile view hides them, so this uses a function). */
export async function listBlocks(db: Tx): Promise<BlockedPerson[]> {
  const r = await db.execute<{ user_id: string; handle: string; name: string; avatar_url: string | null; blocked_at: string | Date }>(
    sql`SELECT user_id, handle, name, avatar_url, blocked_at FROM sewspace_my_blocks()`,
  );
  return r.rows.map((b) => ({ userId: b.user_id, handle: b.handle, name: b.name, avatarUrl: b.avatar_url, blockedAt: new Date(b.blocked_at) }));
}

/** Blocks someone by handle. Follows both ways end (a database trigger does it). */
export async function block(db: Tx, viewer: Viewer, handle: string): Promise<Ok<null> | Fail<"not_found" | "self">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  const wanted = normaliseHandle(handle);
  if ((await listBlocks(db)).some((b) => b.handle.toLowerCase() === wanted)) return { ok: true, value: null };
  const profile = await findProfile(db, viewer, handle);
  if (!profile) return { ok: false, error: "not_found" };
  if (profile.userId === me) return { ok: false, error: "self" };
  await db.execute(sql`INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES (${me}, ${profile.userId}) ON CONFLICT DO NOTHING`);
  return { ok: true, value: null };
}

export async function unblock(db: Tx, viewer: Viewer, handle: string): Promise<void> {
  const me = viewer.userId;
  if (!me) return;
  const wanted = normaliseHandle(handle);
  const target = (await listBlocks(db)).find((b) => b.handle.toLowerCase() === wanted);
  if (target) await db.execute(sql`DELETE FROM sewspace_blocks WHERE blocker_id = ${me} AND blocked_id = ${target.userId}`);
}

// ------------------------------------------------------------------ reports

export type ReportKind = Report["targetKind"];
export type ReportReason = Report["reason"];
export interface ReportTarget { authorHandle: string | null; authorName: string | null; text: string | null; imageUrl: string | null; link: string | null }

/** What is being reported, if the viewer can see it: its owner and a snapshot for the admins. */
async function reportTarget(db: Tx, viewer: Viewer, kind: ReportKind, rawId: string): Promise<{ id: string; userId: string; snapshot: ReportTarget } | null> {
  if (kind === "profile") {
    const p = await findProfile(db, viewer, rawId);
    if (!p) return null;
    return { id: p.handle, userId: p.userId, snapshot: { authorHandle: p.handle, authorName: p.name, text: p.bio || null, imageUrl: p.avatarUrl, link: `/@${p.handle}` } };
  }
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (kind === "post") {
    const post = await visiblePost(db, viewer, id);
    const [view] = post ? await hydratePosts(db, viewer, [post]) : [];
    if (!post || !view) return null;
    return {
      id: String(id),
      userId: post.userId,
      snapshot: { authorHandle: view.author.handle, authorName: view.author.name, text: post.caption || null, imageUrl: view.media[0]?.thumbUrl ?? null, link: `/posts/${id}` },
    };
  }
  const [comment] = await db.select().from(commentsTable).where(and(eq(commentsTable.id, id), notBlockedComment(viewer)));
  if (!comment || !(await visiblePost(db, viewer, comment.postId))) return null;
  const [author] = await db.select().from(publicProfilesView).where(eq(publicProfilesView.userId, comment.userId));
  return {
    id: String(id),
    userId: comment.userId,
    snapshot: { authorHandle: author?.handle ?? null, authorName: author?.name ?? null, text: comment.body, imageUrl: null, link: `/posts/${comment.postId}#comment-${id}` },
  };
}

export async function createReport(
  db: Tx, viewer: Viewer, input: { targetKind: ReportKind; targetId: string; reason: ReportReason; details?: string },
): Promise<Ok<{ id: number }> | Fail<"not_found" | "no_handle" | "rate_limited">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  if (!(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const [{ recent }] = await db.select({ recent: count() }).from(reportsTable)
    .where(and(eq(reportsTable.reporterId, me), gt(reportsTable.createdAt, new Date(Date.now() - 86400_000))));
  if (recent >= REPORTS_PER_DAY) return { ok: false, error: "rate_limited" };
  const target = await reportTarget(db, viewer, input.targetKind, input.targetId);
  if (!target) return { ok: false, error: "not_found" };
  const [row] = await db.insert(reportsTable).values({
    reporterId: me,
    targetKind: input.targetKind,
    targetId: target.id,
    targetUserId: target.userId,
    reason: input.reason,
    details: (input.details ?? "").trim().slice(0, 1000),
    snapshot: { ...target.snapshot },
  }).onConflictDoNothing().returning({ id: reportsTable.id });
  if (row) return { ok: true, value: row };
  // Already reported by this person and still open: same report.
  const [existing] = await db.select({ id: reportsTable.id }).from(reportsTable).where(and(
    eq(reportsTable.reporterId, me), eq(reportsTable.targetKind, input.targetKind), eq(reportsTable.targetId, target.id), eq(reportsTable.status, "open"),
  ));
  return { ok: true, value: existing };
}

// ------------------------------------------------------------- admin review

export interface ReportView {
  id: number;
  targetKind: ReportKind;
  targetId: string;
  reason: ReportReason;
  details: string;
  status: Report["status"];
  createdAt: Date;
  resolvedAt: Date | null;
  reporter: { handle: string; name: string; avatarUrl: string | null };
  target: ReportTarget;
  stillExists: boolean;
  openReportsOnTarget: number;
}

async function reportViews(db: Tx, rows: Report[]): Promise<ReportView[]> {
  if (!rows.length) return [];
  const ids = (kind: ReportKind) => [...new Set(rows.filter((r) => r.targetKind === kind).map((r) => Number(r.targetId)))].filter(Number.isInteger);
  const postIds = ids("post"), commentIds = ids("comment");
  // Admins can read reported posts and comments through RLS (migration 0005).
  const posts = postIds.length ? await db.select({ id: postsTable.id }).from(postsTable).where(inArray(postsTable.id, postIds)) : [];
  const comments = commentIds.length ? await db.select({ id: commentsTable.id }).from(commentsTable).where(inArray(commentsTable.id, commentIds)) : [];
  const reporters = await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, [...new Set(rows.map((r) => r.reporterId))]));
  const open = await db
    .select({ kind: reportsTable.targetKind, id: reportsTable.targetId, n: count() })
    .from(reportsTable)
    .where(eq(reportsTable.status, "open"))
    .groupBy(reportsTable.targetKind, reportsTable.targetId);
  const livePosts = new Set(posts.map((p) => String(p.id))), liveComments = new Set(comments.map((c) => String(c.id)));
  const reporterMap = new Map(reporters.map((r) => [r.userId, r]));
  const openMap = new Map(open.map((o) => [`${o.kind}:${o.id}`, o.n]));
  return rows.map((r) => {
    const stillExists = r.targetKind === "profile" || (r.targetKind === "post" ? livePosts : liveComments).has(r.targetId);
    const snap = r.snapshot as Partial<ReportTarget>;
    const who = reporterMap.get(r.reporterId);
    return {
      id: r.id,
      targetKind: r.targetKind,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      reporter: who ? { handle: who.handle, name: who.name, avatarUrl: who.avatarUrl } : { handle: "unknown", name: "Someone", avatarUrl: null },
      target: {
        authorHandle: snap.authorHandle ?? null,
        authorName: snap.authorName ?? null,
        text: snap.text ?? null,
        imageUrl: snap.imageUrl ?? null,
        link: stillExists ? snap.link ?? null : null,
      },
      stillExists,
      openReportsOnTarget: openMap.get(`${r.targetKind}:${r.targetId}`) ?? 0,
    };
  });
}

export async function listReports(db: Tx, viewer: Viewer, status: Report["status"] = "open"): Promise<ReportView[] | null> {
  if (!viewer.isAdmin) return null;
  const rows = await db.select().from(reportsTable).where(eq(reportsTable.status, status))
    .orderBy(status === "open" ? asc(reportsTable.createdAt) : desc(reportsTable.resolvedAt))
    .limit(200);
  return reportViews(db, rows);
}

export async function resolveReport(
  db: Tx, viewer: Viewer, id: number, action: "remove" | "dismiss",
): Promise<Ok<ReportView> | Fail<"forbidden" | "not_found" | "cannot_remove">> {
  const me = viewer.userId;
  if (!me || !viewer.isAdmin) return { ok: false, error: "forbidden" };
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!report) return { ok: false, error: "not_found" };
  const done = { resolvedAt: new Date(), resolvedBy: me };
  if (action === "remove") {
    if (report.targetKind === "profile") return { ok: false, error: "cannot_remove" };
    const targetId = Number(report.targetId);
    if (report.targetKind === "post") await db.delete(postsTable).where(eq(postsTable.id, targetId));
    else await db.delete(commentsTable).where(eq(commentsTable.id, targetId));
    // Every open report on the same thing is settled by the removal.
    await db.update(reportsTable).set({ status: "removed", ...done }).where(and(
      eq(reportsTable.targetKind, report.targetKind), eq(reportsTable.targetId, report.targetId), eq(reportsTable.status, "open"),
    ));
  } else if (report.status === "open") {
    await db.update(reportsTable).set({ status: "dismissed", ...done }).where(eq(reportsTable.id, id));
  }
  const [updated] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  const [view] = await reportViews(db, [updated]);
  return { ok: true, value: view };
}
