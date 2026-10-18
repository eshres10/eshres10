import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import {
  challengeEntriesTable,
  challengeMembersTable,
  challengesTable,
  commentsTable,
  forumRepliesTable,
  forumTopicsTable,
  mediaTable,
  notificationsTable,
  postMediaTable,
  postsTable,
  publicProfilesView,
  type NotificationKind,
  type Tx,
} from "@workspace/db";
import { notBlockedHost } from "./challenges";
import { urlForObjectPath } from "./objects";
import { decodeCursor, encodeCursor } from "./posts";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// Notifications (the bell). Rows are written by database triggers (migration
// 0019); this module only reads the caller's own and marks them read. The rule,
// also enforced by RLS policy recipient_read:
//   - only your own notifications;
//   - nothing from someone either side of a block (older ones too);
//   - only while what it points to is still visible to you.

export const NOTIFICATIONS_PAGE_SIZE = 20;
export const MARK_READ_MAX_IDS = 100;

type Person = { handle: string; name: string; avatarUrl: string | null };
export interface NotificationView {
  id: number;
  kind: NotificationKind;
  createdAt: Date;
  read: boolean;
  /** Null when the person has no handle yet (shown as "Someone"). */
  actor: Person | null;
  post: { id: number; caption: string; thumbUrl: string | null } | null;
  comment: { id: number; body: string } | null;
  topic: { id: number; title: string } | null;
  reply: { id: number; body: string } | null;
  challenge: { slug: string; title: string } | null;
  /** Where tapping it goes. */
  href: string;
}

function excerpt(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const n = notificationsTable;
const blocked = (column: SQL | typeof n.actorId) => sql`sewspace_blocked_with(${column})`;

/** The caller's notifications they may still see (the same rule as RLS recipient_read). */
function visibleNotifications(viewer: Viewer): SQL {
  const me = viewer.userId!;
  return and(
    eq(n.recipientId, me),
    sql`NOT ${blocked(n.actorId)}`,
    sql`(${n.postId} IS NULL OR EXISTS (SELECT 1 FROM ${postsTable} WHERE ${postsTable.id} = ${n.postId} AND ${visibleTo(postsTable, viewer)}))`,
    sql`(${n.commentId} IS NULL OR EXISTS (SELECT 1 FROM ${commentsTable} WHERE ${commentsTable.id} = ${n.commentId} AND NOT ${blocked(sql`${commentsTable.userId}`)}))`,
    sql`(${n.topicId} IS NULL OR EXISTS (SELECT 1 FROM ${forumTopicsTable} WHERE ${forumTopicsTable.id} = ${n.topicId} AND NOT ${blocked(sql`${forumTopicsTable.userId}`)}))`,
    sql`(${n.replyId} IS NULL OR EXISTS (SELECT 1 FROM ${forumRepliesTable} WHERE ${forumRepliesTable.id} = ${n.replyId} AND NOT ${blocked(sql`${forumRepliesTable.userId}`)}))`,
    sql`(${n.challengeId} IS NULL OR EXISTS (SELECT 1 FROM ${challengesTable} WHERE ${challengesTable.id} = ${n.challengeId} AND NOT ${blocked(sql`${challengesTable.createdBy}`)}))`,
  ) as SQL;
}

export async function unreadNotificationCount(db: Tx, viewer: Viewer): Promise<number> {
  if (!viewer.userId) throw new Error("unreadNotificationCount needs a signed-in viewer");
  const [row] = await db.select({ n: count() }).from(n).where(and(visibleNotifications(viewer), isNull(n.readAt)));
  return row?.n ?? 0;
}

function hrefFor(row: typeof n.$inferSelect, actor: Person | null, challenge: { slug: string } | null): string {
  switch (row.kind) {
    case "like":
      return `/posts/${row.postId}`;
    case "comment":
    case "comment_reply":
      return `/posts/${row.postId}#comment-${row.commentId}`;
    case "follow":
      return actor ? `/@${actor.handle}` : "/notifications";
    case "forum_reply":
    case "answer_accepted":
      return `/forum/topics/${row.topicId}#reply-${row.replyId}`;
    case "challenge_entry":
      return challenge ? `/challenges/${challenge.slug}` : `/posts/${row.postId}`;
  }
}

export const REMINDER_HOURS = 24;
export interface ChallengeReminder { slug: string; title: string; endsAt: Date; entered: boolean }

/**
 * "Ends tomorrow" reminders, worked out when asked (nothing is stored or
 * scheduled): running challenges you're a member of (hosts are members) that
 * end within the next 24 hours, not across a block with the host, soonest
 * first, with whether you have a live entry yet.
 */
export async function endingSoon(db: Tx, viewer: Viewer, now = new Date()): Promise<ChallengeReminder[]> {
  const me = viewer.userId;
  if (!me) throw new Error("endingSoon needs a signed-in viewer");
  const soon = new Date(now.getTime() + REMINDER_HOURS * 3_600_000);
  const rows = await db.select({ id: challengesTable.id, slug: challengesTable.slug, title: challengesTable.title, endsAt: challengesTable.endsAt })
    .from(challengeMembersTable)
    .innerJoin(challengesTable, eq(challengesTable.id, challengeMembersTable.challengeId))
    .where(and(eq(challengeMembersTable.userId, me), lte(challengesTable.startsAt, now), gt(challengesTable.endsAt, now), lte(challengesTable.endsAt, soon), notBlockedHost(viewer)))
    .orderBy(asc(challengesTable.endsAt));
  const entered = rows.length
    ? await db.select({ challengeId: challengeEntriesTable.challengeId }).from(challengeEntriesTable)
        .where(and(eq(challengeEntriesTable.userId, me), inArray(challengeEntriesTable.challengeId, rows.map((r) => r.id)), isNull(challengeEntriesTable.removedAt)))
    : [];
  const done = new Set(entered.map((e) => e.challengeId));
  return rows.map((r) => ({ slug: r.slug, title: r.title, endsAt: r.endsAt, entered: done.has(r.id) }));
}

/** Newest first, 20 a page, with an opaque cursor and the unread count; the first page also carries the reminders. */
export async function listNotifications(db: Tx, viewer: Viewer, cursor?: string) {
  if (!viewer.userId) throw new Error("listNotifications needs a signed-in viewer");
  const after = decodeCursor(cursor);
  const rows = await db.select().from(n)
    .where(and(
      visibleNotifications(viewer),
      after ? or(lt(n.createdAt, after.createdAt), and(eq(n.createdAt, after.createdAt), lt(n.id, after.id))) : undefined,
    ))
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(NOTIFICATIONS_PAGE_SIZE + 1);
  const page = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
  const ids = (key: "postId" | "commentId" | "topicId" | "replyId" | "challengeId") =>
    [...new Set(page.map((r) => r[key]).filter((id): id is number => id !== null))];

  // Sequential on purpose: a request transaction has a single connection.
  // Every read below repeats its own visibility rule, so nothing hidden leaks
  // even though the rows above already passed the same checks.
  const actorIds = [...new Set(page.map((r) => r.actorId))];
  const actors = actorIds.length ? await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, actorIds)) : [];
  const postIds = ids("postId");
  const posts = postIds.length
    ? await db.select({ id: postsTable.id, caption: postsTable.caption }).from(postsTable).where(and(inArray(postsTable.id, postIds), visibleTo(postsTable, viewer)))
    : [];
  const thumbs = posts.length
    ? await db.select({ postId: postMediaTable.postId, thumbPath: mediaTable.thumbPath }).from(postMediaTable)
        .innerJoin(mediaTable, eq(mediaTable.id, postMediaTable.mediaId))
        .where(and(inArray(postMediaTable.postId, posts.map((p) => p.id)), eq(mediaTable.userId, postMediaTable.userId)))
        .orderBy(asc(postMediaTable.position), asc(mediaTable.id))
    : [];
  const commentIds = ids("commentId");
  const comments = commentIds.length
    ? await db.select({ id: commentsTable.id, body: commentsTable.body }).from(commentsTable)
        .where(and(inArray(commentsTable.id, commentIds), sql`NOT ${blocked(sql`${commentsTable.userId}`)}`))
    : [];
  const topicIds = ids("topicId");
  const topics = topicIds.length
    ? await db.select({ id: forumTopicsTable.id, title: forumTopicsTable.title }).from(forumTopicsTable)
        .where(and(inArray(forumTopicsTable.id, topicIds), sql`NOT ${blocked(sql`${forumTopicsTable.userId}`)}`))
    : [];
  const replyIds = ids("replyId");
  const replies = replyIds.length
    ? await db.select({ id: forumRepliesTable.id, body: forumRepliesTable.body }).from(forumRepliesTable)
        .where(and(inArray(forumRepliesTable.id, replyIds), sql`NOT ${blocked(sql`${forumRepliesTable.userId}`)}`))
    : [];
  const challengeIds = ids("challengeId");
  const challenges = challengeIds.length
    ? await db.select({ id: challengesTable.id, slug: challengesTable.slug, title: challengesTable.title }).from(challengesTable)
        .where(and(inArray(challengesTable.id, challengeIds), sql`NOT ${blocked(sql`${challengesTable.createdBy}`)}`))
    : [];
  const unreadCount = await unreadNotificationCount(db, viewer);
  const reminders = after ? [] : await endingSoon(db, viewer);

  const actorBy = new Map(actors.map((a) => [a.userId, { handle: a.handle, name: a.name, avatarUrl: a.avatarUrl }]));
  const postBy = new Map(posts.map((p) => [p.id, p]));
  const thumbBy = new Map<number, string>();
  for (const t of thumbs) if (!thumbBy.has(t.postId)) thumbBy.set(t.postId, urlForObjectPath(t.thumbPath));
  const commentBy = new Map(comments.map((c) => [c.id, c]));
  const topicBy = new Map(topics.map((t) => [t.id, t]));
  const replyBy = new Map(replies.map((r) => [r.id, r]));
  const challengeBy = new Map(challenges.map((c) => [c.id, c]));

  const items: NotificationView[] = [];
  for (const row of page) {
    const actor = actorBy.get(row.actorId) ?? null;
    const post = row.postId !== null ? postBy.get(row.postId) : undefined;
    const comment = row.commentId !== null ? commentBy.get(row.commentId) : undefined;
    const topic = row.topicId !== null ? topicBy.get(row.topicId) : undefined;
    const reply = row.replyId !== null ? replyBy.get(row.replyId) : undefined;
    const challenge = row.challengeId !== null ? challengeBy.get(row.challengeId) : undefined;
    // A target that didn't come back is hidden from the viewer: leave the row out.
    if ((row.postId !== null && !post) || (row.commentId !== null && !comment) || (row.topicId !== null && !topic)
      || (row.replyId !== null && !reply) || (row.challengeId !== null && !challenge)) continue;
    items.push({
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt,
      read: row.readAt !== null,
      actor,
      post: post ? { id: post.id, caption: excerpt(post.caption), thumbUrl: thumbBy.get(post.id) ?? null } : null,
      comment: comment ? { id: comment.id, body: excerpt(comment.body) } : null,
      topic: topic ? { id: topic.id, title: topic.title } : null,
      reply: reply ? { id: reply.id, body: excerpt(reply.body) } : null,
      challenge: challenge ? { slug: challenge.slug, title: challenge.title } : null,
      href: hrefFor(row, actor, challenge ?? null),
    });
  }
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > NOTIFICATIONS_PAGE_SIZE && last ? encodeCursor(last) : null, unreadCount, reminders };
}

/** Marks the given notifications (or all of them) read. Only your own; returns what's left unread. */
export async function markNotificationsRead(db: Tx, viewer: Viewer, ids?: number[]): Promise<number> {
  if (!viewer.userId) throw new Error("markNotificationsRead needs a signed-in viewer");
  if (ids && ids.length === 0) return unreadNotificationCount(db, viewer);
  await db.update(n).set({ readAt: new Date() })
    .where(and(eq(n.recipientId, viewer.userId), isNull(n.readAt), ids ? inArray(n.id, ids) : undefined));
  return unreadNotificationCount(db, viewer);
}
