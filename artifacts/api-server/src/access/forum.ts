import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  catalogTable,
  FORUM_BOARDS,
  FORUM_KINDS,
  forumPollOptionsTable,
  forumPollVotesTable,
  forumRepliesTable,
  forumTopicsTable,
  forumVotesTable,
  mediaTable,
  postMediaTable,
  postsTable,
  profilesTable,
  projectsTable,
  publicProfilesView,
  type ForumBoard,
  type ForumKind,
  type ForumReply,
  type ForumTopic,
  type Tx,
} from "@workspace/db";
import { catalogRefs, type CatalogRef } from "./catalog-refs";
import { hydratePosts, type FeedPostView } from "./posts";
import type { Viewer } from "./viewer";
import { visibleTo } from "./visibility";

// The forum. Topics are public (like the rest of the community) except across
// a block, in either direction, with their author; the same goes for replies.
// Counters live on the rows and are kept by database triggers; pin and lock
// change only through sewspace_forum_moderate() (admins). Poll results come
// from sewspace_poll_results(), which hides them until you vote.

export const TOPICS_PER_HOUR = 10;
export const FORUM_REPLIES_PER_HOUR = 60;
const PAGE = 20;

type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };
type Person = { handle: string; name: string; avatarUrl: string | null };

const notBlockedTopic = (viewer: Viewer): SQL | undefined =>
  viewer.userId ? sql`NOT sewspace_blocked_with(${forumTopicsTable.userId})` : undefined;
const notBlockedReply = (viewer: Viewer): SQL | undefined =>
  viewer.userId ? sql`NOT sewspace_blocked_with(${forumRepliesTable.userId})` : undefined;

function excerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

async function people(db: Tx, ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  // The view hides people on the other side of a block.
  const rows = await db.select().from(publicProfilesView).where(inArray(publicProfilesView.userId, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.userId, { handle: r.handle, name: r.name, avatarUrl: r.avatarUrl }]));
}

async function hasHandle(db: Tx, userId: string): Promise<boolean> {
  const [me] = await db.select({ handle: profilesTable.handle }).from(profilesTable).where(eq(profilesTable.userId, userId));
  return Boolean(me?.handle);
}

// ------------------------------------------------------------------- polls

export interface PollView {
  closesAt: Date;
  open: boolean;
  total: number;
  revealed: boolean;
  myOptionId: number | null;
  options: Array<{ id: number; label: string; votes: number | null }>;
}

async function pollView(db: Tx, viewer: Viewer, topic: ForumTopic): Promise<PollView | null> {
  if (topic.kind !== "poll" || !topic.pollClosesAt) return null;
  const options = await db.select().from(forumPollOptionsTable).where(eq(forumPollOptionsTable.topicId, topic.id)).orderBy(asc(forumPollOptionsTable.position));
  const results = await db.execute<{ option_id: number; votes: string | null; total: string; revealed: boolean }>(
    sql`SELECT option_id, votes, total, revealed FROM sewspace_poll_results(${topic.id})`,
  );
  const [mine] = viewer.userId
    ? await db.select({ optionId: forumPollVotesTable.optionId }).from(forumPollVotesTable)
        .where(and(eq(forumPollVotesTable.topicId, topic.id), eq(forumPollVotesTable.userId, viewer.userId)))
    : [];
  const byOption = new Map(results.rows.map((r) => [Number(r.option_id), r]));
  const first = results.rows[0];
  const revealed = Boolean(first?.revealed);
  return {
    closesAt: topic.pollClosesAt,
    open: topic.pollClosesAt > new Date(),
    total: Number(first?.total ?? 0),
    revealed,
    myOptionId: mine?.optionId ?? null,
    options: options.map((o) => {
      const v = byOption.get(o.id)?.votes;
      return { id: o.id, label: o.label, votes: revealed && v !== null && v !== undefined ? Number(v) : null };
    }),
  };
}

// ------------------------------------------------------------------ topics

export interface TopicSummaryView {
  id: number;
  board: ForumBoard;
  kind: ForumKind;
  title: string;
  excerpt: string;
  tags: string[];
  author: Person;
  createdAt: Date;
  lastActivityAt: Date;
  votes: number;
  replies: number;
  votedByMe: boolean;
  solved: boolean;
  pinned: boolean;
  locked: boolean;
  poll: PollView | null;
  acceptedAnswer: { author: string; excerpt: string } | null;
  topRecommendations: Array<{ catalog: CatalogRef; count: number }>;
}

async function topicSummaries(db: Tx, viewer: Viewer, rows: ForumTopic[]): Promise<TopicSummaryView[]> {
  if (!rows.length) return [];
  const ids = rows.map((t) => t.id);
  const authors = await people(db, rows.map((t) => t.userId));
  const voted = viewer.userId
    ? await db.select({ id: forumVotesTable.targetId }).from(forumVotesTable)
        .where(and(eq(forumVotesTable.userId, viewer.userId), eq(forumVotesTable.targetKind, "topic"), inArray(forumVotesTable.targetId, ids)))
    : [];
  const votedSet = new Set(voted.map((v) => v.id));

  const acceptedIds = rows.map((t) => t.acceptedReplyId).filter((id): id is number => id !== null);
  const accepted = acceptedIds.length
    ? await db.select().from(forumRepliesTable).where(and(inArray(forumRepliesTable.id, acceptedIds), notBlockedReply(viewer)))
    : [];
  const acceptedAuthors = await people(db, accepted.map((r) => r.userId));
  const acceptedMap = new Map(accepted.map((r) => [r.id, r]));

  // "Most recommended": pages named in replies to recommendation topics.
  const recIds = rows.filter((t) => t.kind === "recommendation").map((t) => t.id);
  const recs = recIds.length
    ? await db
        .select({ topicId: forumRepliesTable.topicId, catalogId: forumRepliesTable.catalogId, n: sql<number>`count(*)::int` })
        .from(forumRepliesTable)
        .where(and(inArray(forumRepliesTable.topicId, recIds), isNotNull(forumRepliesTable.catalogId), notBlockedReply(viewer)))
        .groupBy(forumRepliesTable.topicId, forumRepliesTable.catalogId)
    : [];
  const refs = await catalogRefs(db, recs.map((r) => r.catalogId));

  const out: TopicSummaryView[] = [];
  for (const t of rows) {
    const author = authors.get(t.userId);
    if (!author) continue;
    const a = t.acceptedReplyId !== null ? acceptedMap.get(t.acceptedReplyId) : undefined;
    const aAuthor = a ? acceptedAuthors.get(a.userId) : undefined;
    out.push({
      id: t.id,
      board: t.board,
      kind: t.kind,
      title: t.title,
      excerpt: excerpt(t.body),
      tags: t.tags,
      author,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
      votes: t.voteCount,
      replies: t.replyCount,
      votedByMe: votedSet.has(t.id),
      solved: t.kind === "question" && t.acceptedReplyId !== null,
      pinned: t.pinned,
      locked: t.locked,
      poll: await pollView(db, viewer, t),
      acceptedAnswer: a && aAuthor ? { author: aAuthor.handle, excerpt: excerpt(a.body, 200) } : null,
      topRecommendations: recs
        .filter((r) => r.topicId === t.id && r.catalogId !== null && refs.has(r.catalogId))
        .sort((x, y) => y.n - x.n)
        .slice(0, 3)
        .map((r) => ({ catalog: refs.get(r.catalogId!)!, count: r.n })),
    });
  }
  return out;
}

export type TopicFilter = "all" | ForumKind | "solved";
export type TopicSort = "hot" | "new" | "unanswered";

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A page of topics. Offset cursor ("o:<n>"): hot scores move between pages. */
export async function listTopics(db: Tx, viewer: Viewer, options: { filter?: TopicFilter; board?: ForumBoard; sort?: TopicSort; q?: string; cursor?: string }) {
  const { filter = "all", board, sort = "hot" } = options;
  const q = options.q?.trim().slice(0, 80);
  const offset = Math.min(Number(/^o:(\d+)$/.exec(Buffer.from(options.cursor ?? "", "base64url").toString("utf8"))?.[1] ?? 0), 2000);
  const where: Array<SQL | undefined> = [notBlockedTopic(viewer)];
  if (filter === "solved") where.push(eq(forumTopicsTable.kind, "question"), isNotNull(forumTopicsTable.acceptedReplyId));
  else if (filter !== "all") where.push(eq(forumTopicsTable.kind, filter));
  if (board) where.push(eq(forumTopicsTable.board, board));
  if (sort === "unanswered") where.push(eq(forumTopicsTable.replyCount, 0));
  if (q) where.push(or(ilike(forumTopicsTable.title, `%${escapeLike(q)}%`), ilike(forumTopicsTable.body, `%${escapeLike(q)}%`)));
  // Hot: upvotes and replies, decaying with age; pinned topics first.
  const hot = sql`(${forumTopicsTable.voteCount} + 2 * ${forumTopicsTable.replyCount} + 1)::float
    / power(extract(epoch FROM (now() - ${forumTopicsTable.createdAt})) / 3600 + 2, 1.5)`;
  const order = sort === "hot"
    ? [desc(forumTopicsTable.pinned), desc(hot), desc(forumTopicsTable.id)]
    : [desc(forumTopicsTable.createdAt), desc(forumTopicsTable.id)];
  const rows = await db.select().from(forumTopicsTable).where(and(...where)).orderBy(...order).limit(PAGE + 1).offset(offset);
  return {
    items: await topicSummaries(db, viewer, rows.slice(0, PAGE)),
    nextCursor: rows.length > PAGE ? Buffer.from(`o:${offset + PAGE}`).toString("base64url") : null,
  };
}

/** Counts for the filter chips and boards (what this viewer can see). */
export async function forumOverview(db: Tx, viewer: Viewer) {
  const kinds = await db.select({ kind: forumTopicsTable.kind, n: count() }).from(forumTopicsTable).where(notBlockedTopic(viewer)).groupBy(forumTopicsTable.kind);
  const boards = await db.select({ board: forumTopicsTable.board, n: count() }).from(forumTopicsTable).where(notBlockedTopic(viewer)).groupBy(forumTopicsTable.board);
  const [solved] = await db.select({ n: count() }).from(forumTopicsTable)
    .where(and(notBlockedTopic(viewer), eq(forumTopicsTable.kind, "question"), isNotNull(forumTopicsTable.acceptedReplyId)));
  const kindMap = new Map(kinds.map((k) => [k.kind, k.n]));
  const boardMap = new Map(boards.map((b) => [b.board, b.n]));
  return {
    total: kinds.reduce((s, k) => s + k.n, 0),
    solved: solved?.n ?? 0,
    kinds: FORUM_KINDS.map((kind) => ({ kind, count: kindMap.get(kind) ?? 0 })),
    boards: FORUM_BOARDS.map((board) => ({ board, count: boardMap.get(board) ?? 0 })),
  };
}

/** People with the most accepted answers over the last 30 days. */
export async function forumHelpers(db: Tx, viewer: Viewer) {
  const rows = await db
    .select({ userId: forumRepliesTable.userId, n: sql<number>`count(*)::int` })
    .from(forumTopicsTable)
    .innerJoin(forumRepliesTable, eq(forumRepliesTable.id, forumTopicsTable.acceptedReplyId))
    .where(and(notBlockedTopic(viewer), notBlockedReply(viewer), gt(forumRepliesTable.createdAt, new Date(Date.now() - 30 * 86400_000))))
    .groupBy(forumRepliesTable.userId)
    .orderBy(desc(sql`count(*)`))
    .limit(5);
  const who = await people(db, rows.map((r) => r.userId));
  return rows.flatMap((r) => (who.has(r.userId) ? [{ person: who.get(r.userId)!, accepted: r.n }] : []));
}

/** Topics about a shared page, or about a make the viewer may see. */
export async function forumDiscussions(db: Tx, viewer: Viewer, about: { catalogId?: number; makeId?: number }) {
  let where: SQL | undefined;
  if (about.catalogId) where = eq(forumTopicsTable.catalogId, about.catalogId);
  else if (about.makeId) {
    const [make] = await db.select({ id: projectsTable.id, userId: projectsTable.userId }).from(projectsTable)
      .where(and(eq(projectsTable.id, about.makeId), visibleTo(projectsTable, viewer)));
    if (!make) return [];
    where = and(eq(forumTopicsTable.projectId, make.id), eq(forumTopicsTable.userId, make.userId));
  } else return [];
  const rows = await db.select().from(forumTopicsTable).where(and(where, notBlockedTopic(viewer))).orderBy(desc(forumTopicsTable.lastActivityAt)).limit(10);
  return topicSummaries(db, viewer, rows);
}

async function visibleTopic(db: Tx, viewer: Viewer, id: number): Promise<ForumTopic | null> {
  const [row] = await db.select().from(forumTopicsTable).where(and(eq(forumTopicsTable.id, id), notBlockedTopic(viewer))).limit(1);
  return row ?? null;
}

export type TopicView = TopicSummaryView & {
  body: string;
  catalog: CatalogRef | null;
  make: { id: number; name: string; coverImageUrl: string | null } | null;
  post: FeedPostView | null;
  acceptedReplyId: number | null;
  isMine: boolean;
  canModerate: boolean;
};

async function topicView(db: Tx, viewer: Viewer, t: ForumTopic): Promise<TopicView | null> {
  const [summary] = await topicSummaries(db, viewer, [t]);
  if (!summary) return null;
  const refs = await catalogRefs(db, [t.catalogId]);
  // A linked make or feed post shows only to people who may see it.
  const [make] = t.projectId
    ? await db.select({ id: projectsTable.id, name: projectsTable.name, coverImageUrl: projectsTable.coverImageUrl }).from(projectsTable)
        .where(and(eq(projectsTable.id, t.projectId), eq(projectsTable.userId, t.userId), visibleTo(projectsTable, viewer)))
    : [];
  const posts = t.postId
    ? await db.select().from(postsTable).where(and(eq(postsTable.id, t.postId), eq(postsTable.userId, t.userId), visibleTo(postsTable, viewer)))
    : [];
  const [post] = posts.length ? await hydratePosts(db, viewer, posts) : [];
  return {
    ...summary,
    body: t.body,
    catalog: t.catalogId ? refs.get(t.catalogId) ?? null : null,
    make: make ?? null,
    post: post ?? null,
    acceptedReplyId: summary.acceptedAnswer ? t.acceptedReplyId : null,
    isMine: t.userId === viewer.userId,
    canModerate: viewer.isAdmin,
  };
}

export async function getTopic(db: Tx, viewer: Viewer, id: number): Promise<TopicView | null> {
  const t = await visibleTopic(db, viewer, id);
  return t ? topicView(db, viewer, t) : null;
}

// ----------------------------------------------------------------- replies

export interface ReplyChildView { id: number; body: string; author: Person; createdAt: Date; votes: number; votedByMe: boolean; isMine: boolean; catalog: CatalogRef | null }
export type ReplyView = ReplyChildView & { accepted: boolean; replies: ReplyChildView[] };

/** Replies the viewer may see: the accepted answer first, then most upvoted, then oldest. */
export async function listReplies(db: Tx, viewer: Viewer, topicId: number): Promise<ReplyView[] | null> {
  const topic = await visibleTopic(db, viewer, topicId);
  if (!topic) return null;
  const rows = await db.select().from(forumRepliesTable)
    .where(and(eq(forumRepliesTable.topicId, topicId), notBlockedReply(viewer)))
    .orderBy(asc(forumRepliesTable.createdAt), asc(forumRepliesTable.id))
    .limit(1000);
  return nestReplies(db, viewer, topic, rows);
}

async function nestReplies(db: Tx, viewer: Viewer, topic: ForumTopic, rows: ForumReply[]): Promise<ReplyView[]> {
  if (!rows.length) return [];
  const authors = await people(db, rows.map((r) => r.userId));
  const voted = viewer.userId
    ? await db.select({ id: forumVotesTable.targetId }).from(forumVotesTable)
        .where(and(eq(forumVotesTable.userId, viewer.userId), eq(forumVotesTable.targetKind, "reply"), inArray(forumVotesTable.targetId, rows.map((r) => r.id))))
    : [];
  const votedSet = new Set(voted.map((v) => v.id));
  const refs = await catalogRefs(db, rows.map((r) => r.catalogId));
  const child = (r: ForumReply): ReplyChildView | null => {
    const author = authors.get(r.userId);
    return author ? {
      id: r.id, body: r.body, author, createdAt: r.createdAt, votes: r.voteCount, votedByMe: votedSet.has(r.id),
      isMine: r.userId === viewer.userId, catalog: r.catalogId ? refs.get(r.catalogId) ?? null : null,
    } : null;
  };
  const top: ReplyView[] = [];
  const byId = new Map<number, ReplyView>();
  for (const r of rows.filter((x) => x.parentId === null)) {
    const v = child(r);
    if (!v) continue;
    const full = { ...v, accepted: topic.acceptedReplyId === r.id, replies: [] };
    top.push(full);
    byId.set(r.id, full);
  }
  for (const r of rows.filter((x) => x.parentId !== null)) {
    const v = child(r);
    if (v) byId.get(r.parentId!)?.replies.push(v);
  }
  return top.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime());
}

// ----------------------------------------------------------------- writing

export interface TopicInput {
  board: ForumBoard;
  kind: ForumKind;
  title: string;
  body?: string;
  tags?: string[];
  catalogId?: number | null;
  makeId?: number | null;
  pollOptions?: string[];
  pollDays?: 1 | 3 | 7;
  shareToFeed?: boolean;
  mediaIds?: number[];
}
type TopicError = "no_handle" | "rate_limited" | "bad_title" | "bad_tags" | "bad_poll" | "bad_make" | "bad_catalog" | "bad_media";

/** "#Linen Cutting" → ["linen-cutting"]; at most 5, each a-z 0-9 and dashes. */
export function normaliseTags(tags: string[] = []): string[] | null {
  const clean = [...new Set(tags.map((t) => t.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-")).filter(Boolean))];
  if (clean.length > 5 || clean.some((t) => !/^[a-z0-9-]{1,30}$/.test(t))) return null;
  return clean;
}

export async function createTopic(db: Tx, viewer: Viewer, input: TopicInput): Promise<Ok<TopicView> | Fail<TopicError>> {
  const me = viewer.userId;
  if (!me || !(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const [{ recent }] = await db.select({ recent: count() }).from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.userId, me), gt(forumTopicsTable.createdAt, new Date(Date.now() - 3600_000))));
  if (recent >= TOPICS_PER_HOUR) return { ok: false, error: "rate_limited" };
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 140) return { ok: false, error: "bad_title" };
  const tags = normaliseTags(input.tags);
  if (!tags) return { ok: false, error: "bad_tags" };
  const body = (input.body ?? "").trim();

  let options: string[] = [];
  if (input.kind === "poll") {
    options = (input.pollOptions ?? []).map((o) => o.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6 || new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: "bad_poll" };
  }
  if (input.makeId) {
    const [own] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, input.makeId), eq(projectsTable.userId, me)));
    if (!own) return { ok: false, error: "bad_make" };
  }
  if (input.catalogId) {
    const [entry] = await db.select({ id: catalogTable.id }).from(catalogTable).where(eq(catalogTable.id, input.catalogId));
    if (!entry) return { ok: false, error: "bad_catalog" };
  }

  // Show & tell can also be a public post in the author's feed (with photos).
  let postId: number | null = null;
  const mediaIds = [...new Set(input.mediaIds ?? [])];
  if (mediaIds.length && !(input.kind === "show_tell" && input.shareToFeed)) return { ok: false, error: "bad_media" };
  if (input.kind === "show_tell" && input.shareToFeed) {
    if (mediaIds.length > 10) return { ok: false, error: "bad_media" };
    const media = mediaIds.length
      ? await db.select({ id: mediaTable.id }).from(mediaTable).where(and(inArray(mediaTable.id, mediaIds), eq(mediaTable.userId, me)))
      : [];
    if (media.length !== mediaIds.length) return { ok: false, error: "bad_media" };
    const caption = (body ? `${title}\n\n${body}` : title).slice(0, 2200);
    const [post] = await db.insert(postsTable).values({
      userId: me, kind: mediaIds.length ? "photo" : "status", caption, visibility: "public", projectId: input.makeId ?? null,
    }).returning({ id: postsTable.id });
    if (mediaIds.length) await db.insert(postMediaTable).values(mediaIds.map((mediaId, position) => ({ postId: post.id, mediaId, userId: me, position })));
    postId = post.id;
  }

  const [topic] = await db.insert(forumTopicsTable).values({
    userId: me,
    board: input.board,
    kind: input.kind,
    title,
    body,
    tags,
    catalogId: input.catalogId ?? null,
    projectId: input.makeId ?? null,
    postId,
    pollClosesAt: input.kind === "poll" ? new Date(Date.now() + (input.pollDays ?? 3) * 86400_000) : null,
  }).returning();
  if (options.length) {
    await db.insert(forumPollOptionsTable).values(options.map((label, i) => ({ topicId: topic.id, position: i + 1, label })));
  }
  return { ok: true, value: (await topicView(db, viewer, topic))! };
}

export async function updateTopic(db: Tx, viewer: Viewer, id: number, input: { title?: string; body?: string; tags?: string[] }): Promise<Ok<TopicView> | Fail<"not_found" | "bad_title" | "bad_tags">> {
  const t = await visibleTopic(db, viewer, id);
  if (!t || t.userId !== viewer.userId) return { ok: false, error: "not_found" };
  const set: { title?: string; body?: string; tags?: string[]; updatedAt: Date } = { updatedAt: new Date() };
  if (input.title !== undefined) {
    set.title = input.title.trim().replace(/\s+/g, " ");
    if (set.title.length < 3 || set.title.length > 140) return { ok: false, error: "bad_title" };
  }
  if (input.body !== undefined) set.body = input.body.trim();
  if (input.tags !== undefined) {
    const tags = normaliseTags(input.tags);
    if (!tags) return { ok: false, error: "bad_tags" };
    set.tags = tags;
  }
  const [row] = await db.update(forumTopicsTable).set(set).where(and(eq(forumTopicsTable.id, id), eq(forumTopicsTable.userId, viewer.userId!))).returning();
  return { ok: true, value: (await topicView(db, viewer, row))! };
}

export async function deleteTopic(db: Tx, viewer: Viewer, id: number): Promise<boolean> {
  if (!viewer.userId) return false;
  const gone = await db.delete(forumTopicsTable).where(and(eq(forumTopicsTable.id, id), eq(forumTopicsTable.userId, viewer.userId))).returning({ id: forumTopicsTable.id });
  return gone.length > 0;
}

/** The asker marks (or clears) the answer that worked. */
export async function setAccepted(db: Tx, viewer: Viewer, topicId: number, replyId: number | null): Promise<Ok<TopicView> | Fail<"not_found" | "bad_reply">> {
  const t = await visibleTopic(db, viewer, topicId);
  if (!t || t.userId !== viewer.userId) return { ok: false, error: "not_found" };
  if (replyId !== null) {
    if (t.kind !== "question") return { ok: false, error: "bad_reply" };
    const [reply] = await db.select({ id: forumRepliesTable.id }).from(forumRepliesTable)
      .where(and(eq(forumRepliesTable.id, replyId), eq(forumRepliesTable.topicId, topicId), notBlockedReply(viewer)));
    if (!reply) return { ok: false, error: "bad_reply" };
  }
  const [row] = await db.update(forumTopicsTable).set({ acceptedReplyId: replyId, updatedAt: new Date() }).where(eq(forumTopicsTable.id, topicId)).returning();
  return { ok: true, value: (await topicView(db, viewer, row))! };
}

/** Admins pin or lock (through the database function, the only way to change them). */
export async function moderateTopic(db: Tx, viewer: Viewer, topicId: number, input: { pinned?: boolean; locked?: boolean }): Promise<Ok<TopicView> | Fail<"forbidden" | "not_found">> {
  if (!viewer.isAdmin) return { ok: false, error: "forbidden" };
  const r = await db.execute<{ ok: boolean }>(sql`SELECT sewspace_forum_moderate(${topicId}, ${input.pinned ?? null}, ${input.locked ?? null}) AS ok`);
  if (!r.rows[0]?.ok) return { ok: false, error: "not_found" };
  const view = await getTopic(db, viewer, topicId);
  return view ? { ok: true, value: view } : { ok: false, error: "not_found" };
}

type ReplyError = "not_found" | "locked" | "no_handle" | "rate_limited" | "bad_parent" | "bad_catalog" | "empty";

export async function createReply(db: Tx, viewer: Viewer, topicId: number, input: { body: string; parentId?: number | null; catalogId?: number | null }): Promise<Ok<ReplyView> | Fail<ReplyError>> {
  const me = viewer.userId;
  const topic = me ? await visibleTopic(db, viewer, topicId) : null;
  if (!me || !topic) return { ok: false, error: "not_found" };
  if (topic.locked) return { ok: false, error: "locked" };
  const body = input.body.trim();
  if (!body || body.length > 5000) return { ok: false, error: "empty" };
  if (!(await hasHandle(db, me))) return { ok: false, error: "no_handle" };
  const [{ recent }] = await db.select({ recent: count() }).from(forumRepliesTable)
    .where(and(eq(forumRepliesTable.userId, me), gt(forumRepliesTable.createdAt, new Date(Date.now() - 3600_000))));
  if (recent >= FORUM_REPLIES_PER_HOUR) return { ok: false, error: "rate_limited" };
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const [parent] = await db.select({ id: forumRepliesTable.id }).from(forumRepliesTable)
      .where(and(eq(forumRepliesTable.id, parentId), eq(forumRepliesTable.topicId, topicId), isNull(forumRepliesTable.parentId), notBlockedReply(viewer)));
    if (!parent) return { ok: false, error: "bad_parent" };
  }
  if (input.catalogId) {
    const [entry] = await db.select({ id: catalogTable.id }).from(catalogTable).where(eq(catalogTable.id, input.catalogId));
    if (!entry) return { ok: false, error: "bad_catalog" };
  }
  const [row] = await db.insert(forumRepliesTable).values({ topicId, userId: me, parentId, body, catalogId: input.catalogId ?? null }).returning();
  const [view] = await nestReplies(db, viewer, topic, [{ ...row, parentId: null }]);
  return { ok: true, value: view };
}

export async function deleteReply(db: Tx, viewer: Viewer, id: number): Promise<boolean> {
  if (!viewer.userId) return false;
  const gone = await db.delete(forumRepliesTable).where(and(eq(forumRepliesTable.id, id), eq(forumRepliesTable.userId, viewer.userId))).returning({ id: forumRepliesTable.id });
  return gone.length > 0;
}

/** Upvote (or take back) a topic or reply you can see that isn't yours. */
export async function setForumVote(db: Tx, viewer: Viewer, kind: "topic" | "reply", id: number, on: boolean): Promise<Ok<{ voted: boolean; votes: number }> | Fail<"not_found" | "own">> {
  const me = viewer.userId;
  if (!me) return { ok: false, error: "not_found" };
  const target = kind === "topic"
    ? (await db.select({ userId: forumTopicsTable.userId }).from(forumTopicsTable).where(and(eq(forumTopicsTable.id, id), notBlockedTopic(viewer))))[0]
    : (await db.select({ userId: forumRepliesTable.userId }).from(forumRepliesTable)
        .innerJoin(forumTopicsTable, eq(forumTopicsTable.id, forumRepliesTable.topicId))
        .where(and(eq(forumRepliesTable.id, id), notBlockedReply(viewer), notBlockedTopic(viewer))))[0];
  if (!target) return { ok: false, error: "not_found" };
  if (on && target.userId === me) return { ok: false, error: "own" };
  if (on) await db.insert(forumVotesTable).values({ targetKind: kind, targetId: id, userId: me }).onConflictDoNothing();
  else await db.delete(forumVotesTable).where(and(eq(forumVotesTable.targetKind, kind), eq(forumVotesTable.targetId, id), eq(forumVotesTable.userId, me)));
  // Counters are kept by a trigger; read the new value back.
  const [row] = kind === "topic"
    ? await db.select({ votes: forumTopicsTable.voteCount }).from(forumTopicsTable).where(eq(forumTopicsTable.id, id))
    : await db.select({ votes: forumRepliesTable.voteCount }).from(forumRepliesTable).where(eq(forumRepliesTable.id, id));
  return { ok: true, value: { voted: on, votes: row?.votes ?? 0 } };
}

/** Vote, or change your vote, while a poll is open. */
export async function votePoll(db: Tx, viewer: Viewer, topicId: number, optionId: number): Promise<Ok<PollView> | Fail<"not_found" | "closed" | "bad_option">> {
  const me = viewer.userId;
  const topic = me ? await visibleTopic(db, viewer, topicId) : null;
  if (!me || !topic || topic.kind !== "poll" || !topic.pollClosesAt) return { ok: false, error: "not_found" };
  if (topic.pollClosesAt <= new Date()) return { ok: false, error: "closed" };
  const [option] = await db.select({ id: forumPollOptionsTable.id }).from(forumPollOptionsTable)
    .where(and(eq(forumPollOptionsTable.id, optionId), eq(forumPollOptionsTable.topicId, topicId)));
  if (!option) return { ok: false, error: "bad_option" };
  await db.insert(forumPollVotesTable).values({ topicId, userId: me, optionId })
    .onConflictDoUpdate({ target: [forumPollVotesTable.topicId, forumPollVotesTable.userId], set: { optionId, votedAt: new Date() } });
  return { ok: true, value: (await pollView(db, viewer, topic))! };
}

/** A topic or reply the viewer can see, for reports. */
export async function visibleForumItem(db: Tx, viewer: Viewer, kind: "topic" | "forum_reply", id: number) {
  if (kind === "topic") {
    const t = await visibleTopic(db, viewer, id);
    return t ? { userId: t.userId, text: `${t.title}\n${t.body}`.trim(), link: `/forum/topics/${t.id}` } : null;
  }
  const [r] = await db.select().from(forumRepliesTable)
    .innerJoin(forumTopicsTable, eq(forumTopicsTable.id, forumRepliesTable.topicId))
    .where(and(eq(forumRepliesTable.id, id), notBlockedReply(viewer), notBlockedTopic(viewer)));
  return r ? { userId: r.sewspace_forum_replies.userId, text: r.sewspace_forum_replies.body, link: `/forum/topics/${r.sewspace_forum_replies.topicId}#reply-${id}` } : null;
}

/** Topics for the sitemap. */
export async function listTopicsForSitemap(db: Tx, limit = 20000) {
  return db.select({ id: forumTopicsTable.id, updatedAt: forumTopicsTable.lastActivityAt }).from(forumTopicsTable).orderBy(desc(forumTopicsTable.id)).limit(limit);
}
