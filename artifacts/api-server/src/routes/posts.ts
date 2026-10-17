import { and, count, eq, gt, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  fabricsTable,
  mediaTable,
  patternsTable,
  postMediaTable,
  postsTable,
  profilesTable,
  projectsTable,
  uploadsTable,
  withUser,
  type Tx,
} from "@workspace/db";
import {
  CreateMediaBody,
  CreateMediaResponse,
  CreatePostBody,
  CreatePostResponse,
  DeletePostParams,
  GetHomeFeedQueryParams,
  GetHomeFeedResponse,
  SuggestHashtagsQueryParams,
  SuggestHashtagsResponse,
  UpdatePostBody,
  UpdatePostParams,
  UpdatePostResponse,
} from "@workspace/api-zod";
import { getPostForViewer, homeFeed, MAX_HASHTAGS, mediaView, own, parseHashtags, suggestHashtags, syncPostHashtags, type Viewer } from "../access";
import { processImage, UnreadableImageError } from "../lib/images";
import { ObjectNotFoundError } from "../lib/objectStorage";
import { scoped, type Reply } from "../lib/scoped";
import { getUserId, viewerOf } from "../middlewares/auth";
import { storageFor } from "./storage";

const router: IRouter = Router();

export const MAX_PHOTOS = 10;
export const POSTS_PER_HOUR = 30;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

// POST /media: turn one of your image uploads into a processed photo. The work
// (download, resize, upload) happens outside any database transaction.
router.post("/media", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateMediaBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "Upload a photo first." });
    return;
  }
  const uid = getUserId(req);
  const sourcePath = parsed.data.objectPath;
  const [upload] = await withUser(uid, (db) =>
    db
      .select()
      .from(uploadsTable)
      .where(and(eq(uploadsTable.objectPath, sourcePath), eq(uploadsTable.userId, uid), eq(uploadsTable.purpose, "image"))),
  );
  if (!upload) {
    res.status(400).json({ error: "That photo isn't one of your uploads. Upload it again." });
    return;
  }

  const storage = storageFor(req);
  let source: Buffer;
  try {
    source = await storage.readObjectEntity(sourcePath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "The upload didn't finish. Try adding the photo again." });
      return;
    }
    throw error;
  }
  if (source.length > MAX_SOURCE_BYTES) {
    res.status(413).json({ error: "Photos must be 15 MB or smaller." });
    return;
  }

  let image;
  try {
    image = await processImage(source);
  } catch (error) {
    if (error instanceof UnreadableImageError) {
      res.status(400).json({ error: "That file isn't a photo we can read. Try a JPG, PNG or WebP." });
      return;
    }
    throw error;
  }
  const [fullPath, thumbPath] = await Promise.all([
    storage.saveObjectEntity(image.full, "image/webp", `media/${uid}`),
    storage.saveObjectEntity(image.thumb, "image/webp", `media/${uid}`),
  ]);
  const media = await withUser(uid, async (db) => {
    await db.insert(uploadsTable).values([
      { objectPath: fullPath, userId: uid, contentType: "image/webp", sizeBytes: image.full.length, purpose: "image" },
      { objectPath: thumbPath, userId: uid, contentType: "image/webp", sizeBytes: image.thumb.length, purpose: "image" },
    ]);
    const [row] = await db
      .insert(mediaTable)
      .values({ userId: uid, fullPath, thumbPath, sourcePath, width: image.width, height: image.height, color: image.color })
      .returning();
    return row;
  });
  res.status(201).json(CreateMediaResponse.parse(mediaView(media)));
});

type Tags = { projectId?: number | null; patternId?: number | null; fabricId?: number | null };
type AltText = { mediaId: number; text: string };

function tooManyHashtags(caption: string, res: Reply): boolean {
  if (parseHashtags(caption).length <= MAX_HASHTAGS) return false;
  res.status(400).json({ error: `Use up to ${MAX_HASHTAGS} hashtags.` });
  return true;
}

// Every photo must be one of the author's processed photos.
async function rejectsForeignMedia(db: Tx, viewer: Viewer, mediaIds: number[], res: Reply): Promise<boolean> {
  if (!mediaIds.length) return false;
  const mine = await db.select({ id: mediaTable.id }).from(mediaTable).where(and(inArray(mediaTable.id, mediaIds), own(mediaTable, viewer)));
  if (mine.length === mediaIds.length) return false;
  res.status(400).json({ error: "Some photos aren't yours. Add them again." });
  return true;
}

// Alt text may only be set on the post's own photos.
function rejectsStrayAltText(altTexts: AltText[] | undefined, mediaIds: number[], res: Reply): boolean {
  if (!altTexts?.some((a) => !mediaIds.includes(a.mediaId))) return false;
  res.status(400).json({ error: "Alt text must be for one of this post's photos." });
  return true;
}

async function saveAltTexts(db: Tx, viewer: Viewer, altTexts: AltText[] | undefined): Promise<void> {
  for (const a of altTexts ?? []) {
    await db.update(mediaTable).set({ altText: a.text.trim().slice(0, 500) }).where(and(eq(mediaTable.id, a.mediaId), own(mediaTable, viewer)));
  }
}

// A post may only tag the author's own make, pattern or fabric.
async function rejectsForeignTags(db: Tx, viewer: Viewer, tags: Tags, res: Reply): Promise<boolean> {
  const checks: Array<[number | null | undefined, typeof projectsTable | typeof patternsTable | typeof fabricsTable]> = [
    [tags.projectId, projectsTable],
    [tags.patternId, patternsTable],
    [tags.fabricId, fabricsTable],
  ];
  for (const [id, table] of checks) {
    if (id === null || id === undefined) continue;
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), own(table, viewer)));
    if (!row) {
      res.status(400).json({ error: "You can only tag your own makes, patterns and fabrics." });
      return true;
    }
  }
  return false;
}

router.post("/posts", scoped(async (req, res, db): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the post and try again." });
    return;
  }
  const viewer = viewerOf(req);
  const uid = getUserId(req);
  const body = parsed.data;
  const caption = body.caption.trim();
  const mediaIds = [...new Set(body.mediaIds ?? [])];

  if (body.kind === "photo" && (mediaIds.length < 1 || mediaIds.length > MAX_PHOTOS)) {
    res.status(400).json({ error: `Add between 1 and ${MAX_PHOTOS} photos.` });
    return;
  }
  if (body.kind === "status" && (mediaIds.length > 0 || !caption)) {
    res.status(400).json({ error: mediaIds.length ? "A status post has no photos." : "Write something to post." });
    return;
  }
  if (tooManyHashtags(caption, res) || rejectsStrayAltText(body.altTexts, mediaIds, res)) return;

  const [profile] = await db.select({ handle: profilesTable.handle }).from(profilesTable).where(eq(profilesTable.userId, uid));
  if (!profile?.handle) {
    res.status(409).json({ error: "Choose a handle before posting." });
    return;
  }
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(postsTable)
    .where(and(eq(postsTable.userId, uid), gt(postsTable.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (recent >= POSTS_PER_HOUR) {
    res.status(429).json({ error: "You're posting very fast. Take a break and try again in a little while." });
    return;
  }
  if (await rejectsForeignMedia(db, viewer, mediaIds, res)) return;
  if (await rejectsForeignTags(db, viewer, body, res)) return;

  const [post] = await db
    .insert(postsTable)
    .values({
      userId: uid,
      kind: body.kind,
      caption,
      visibility: body.visibility,
      projectId: body.projectId ?? null,
      patternId: body.patternId ?? null,
      fabricId: body.fabricId ?? null,
      ...(body.aspect ? { aspect: body.aspect } : {}),
    })
    .returning();
  if (mediaIds.length) {
    await db.insert(postMediaTable).values(mediaIds.map((mediaId, position) => ({ postId: post.id, mediaId, userId: uid, position })));
  }
  await saveAltTexts(db, viewer, body.altTexts);
  await syncPostHashtags(db, viewer, post.id, caption);
  const view = await getPostForViewer(db, viewer, post.id);
  res.status(201).json(CreatePostResponse.parse(view));
}));

router.patch("/posts/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdatePostParams.safeParse(req.params);
  const parsed = UpdatePostBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Check the post and try again." });
    return;
  }
  const viewer = viewerOf(req);
  const [existing] = await db.select().from(postsTable).where(and(eq(postsTable.id, params.data.id), own(postsTable, viewer)));
  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const body = parsed.data;
  const caption = body.caption?.trim();
  if (existing.kind === "status" && caption === "") {
    res.status(400).json({ error: "Write something to post." });
    return;
  }
  if (caption !== undefined && tooManyHashtags(caption, res)) return;
  const mediaIds = body.mediaIds ? [...new Set(body.mediaIds)] : undefined;
  if (mediaIds && existing.kind === "status" && mediaIds.length) {
    res.status(400).json({ error: "A status post has no photos." });
    return;
  }
  if (mediaIds && existing.kind === "photo" && (mediaIds.length < 1 || mediaIds.length > MAX_PHOTOS)) {
    res.status(400).json({ error: `Keep between 1 and ${MAX_PHOTOS} photos.` });
    return;
  }
  const finalMedia = mediaIds ?? (await db.select({ id: postMediaTable.mediaId }).from(postMediaTable)
    .where(and(eq(postMediaTable.postId, existing.id), own(postMediaTable, viewer)))).map((m) => m.id);
  if (rejectsStrayAltText(body.altTexts, finalMedia, res)) return;
  if (mediaIds && await rejectsForeignMedia(db, viewer, mediaIds, res)) return;
  if (await rejectsForeignTags(db, viewer, body, res)) return;
  await db
    .update(postsTable)
    .set({
      caption,
      visibility: body.visibility,
      projectId: body.projectId,
      patternId: body.patternId,
      fabricId: body.fabricId,
      aspect: body.aspect,
      updatedAt: new Date(),
    })
    .where(and(eq(postsTable.id, existing.id), own(postsTable, viewer)));
  if (mediaIds && existing.kind === "photo") {
    await db.delete(postMediaTable).where(and(eq(postMediaTable.postId, existing.id), own(postMediaTable, viewer)));
    await db.insert(postMediaTable).values(mediaIds.map((mediaId, position) => ({ postId: existing.id, mediaId, userId: existing.userId, position })));
  }
  await saveAltTexts(db, viewer, body.altTexts);
  if (caption !== undefined) await syncPostHashtags(db, viewer, existing.id, caption);
  res.json(UpdatePostResponse.parse(await getPostForViewer(db, viewer, existing.id)));
}));

router.delete("/posts/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid post" });
    return;
  }
  const deleted = await db
    .delete(postsTable)
    .where(and(eq(postsTable.id, params.data.id), own(postsTable, viewerOf(req))))
    .returning({ id: postsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.sendStatus(204);
}));

router.get("/hashtags/suggest", scoped(async (req, res, db): Promise<void> => {
  const parsed = SuggestHashtagsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.json([]);
    return;
  }
  res.json(SuggestHashtagsResponse.parse(await suggestHashtags(db, viewerOf(req), parsed.data)));
}));

router.get("/feed", scoped(async (req, res, db): Promise<void> => {
  const parsed = GetHomeFeedQueryParams.safeParse(req.query);
  const feed = await homeFeed(db, viewerOf(req), parsed.success ? parsed.data.cursor : undefined);
  res.json(GetHomeFeedResponse.parse(feed));
}));

export default router;
