import { Router, type IRouter, type RequestHandler } from "express";
import {
  BlockProfileParams,
  CreateCommentBody,
  CreateCommentParams,
  CreateCommentResponse,
  CreateReportBody,
  CreateReportResponse,
  DeleteCommentParams,
  FollowProfileParams,
  FollowProfileResponse,
  GetSavedPostsQueryParams,
  GetSavedPostsResponse,
  LikePostParams,
  LikePostResponse,
  ListBlocksResponse,
  SavePostParams,
  SavePostResponse,
  LikeCommentParams,
  LikeCommentResponse,
} from "@workspace/api-zod";
import { addComment, block, createReport, listBlocks, removeComment, savedFeed, setCommentLike, setFollow, setLike, setSave, unblock } from "../access";
import { hourlyLimit } from "../lib/hourly";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Signed-in actions: comments, likes, saves, follows, blocks and reports.
// Each one asks the access module whether the viewer may see the thing first.
const router: IRouter = Router();

const COMMENT_ERRORS = {
  not_found: [404, "Post not found"],
  bad_parent: [400, "You can only reply to a comment on this post."],
  no_handle: [409, "Choose a handle before commenting."],
  rate_limited: [429, "You're commenting a lot. Try again in a little while."],
  empty: [400, "Write a comment (up to 1000 characters)."],
} as const;

router.post("/posts/:id/comments", scoped(async (req, res, db): Promise<void> => {
  const params = CreateCommentParams.safeParse(req.params);
  const body = CreateCommentBody.safeParse(req.body);
  if (!params.success) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: COMMENT_ERRORS.empty[1] });
    return;
  }
  const result = await addComment(db, viewerOf(req), params.data.id, body.data.body, body.data.parentId ?? null);
  if (!result.ok) {
    const [status, error] = COMMENT_ERRORS[result.error];
    res.status(status).json({ error });
    return;
  }
  res.status(201).json(CreateCommentResponse.parse(result.value));
}));

router.delete("/comments/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteCommentParams.safeParse(req.params);
  if (!params.success || !(await removeComment(db, viewerOf(req), params.data.id))) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.sendStatus(204);
}));

// Comment likes (post view): 120 an hour per person, kept in memory.
export const COMMENT_LIKES_PER_HOUR = 120;
const commentLikeAllowed = hourlyLimit(COMMENT_LIKES_PER_HOUR);
const commentLikeLimited: RequestHandler = (req, res, next) => {
  if (!commentLikeAllowed(viewerOf(req).userId!)) return void res.status(429).json({ error: "That's a lot of likes for one hour. Try again later." });
  next();
};
for (const on of [true, false]) {
  router[on ? "put" : "delete"]("/comments/:id/like", commentLikeLimited, scoped(async (req, res, db): Promise<void> => {
    const params = LikeCommentParams.safeParse(req.params);
    const state = params.success ? await setCommentLike(db, viewerOf(req), params.data.id, on) : null;
    if (!state) return void res.status(404).json({ error: "Comment not found" });
    res.json(LikeCommentResponse.parse(state));
  }));
}

for (const on of [true, false]) {
  const method = on ? "put" : "delete";
  router[method]("/posts/:id/like", scoped(async (req, res, db): Promise<void> => {
    const params = LikePostParams.safeParse(req.params);
    const state = params.success ? await setLike(db, viewerOf(req), params.data.id, on) : null;
    if (!state) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.json(LikePostResponse.parse(state));
  }));
  router[method]("/posts/:id/save", scoped(async (req, res, db): Promise<void> => {
    const params = SavePostParams.safeParse(req.params);
    const state = params.success ? await setSave(db, viewerOf(req), params.data.id, on) : null;
    if (!state) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.json(SavePostResponse.parse(state));
  }));
  router[method]("/follows/:handle", scoped(async (req, res, db): Promise<void> => {
    const params = FollowProfileParams.safeParse(req.params);
    const result = params.success ? await setFollow(db, viewerOf(req), params.data.handle, on) : { ok: false as const, error: "not_found" as const };
    if (!result.ok) {
      res.status(result.error === "self" ? 400 : 404).json({ error: result.error === "self" ? "You can't follow yourself." : "Profile not found" });
      return;
    }
    res.json(FollowProfileResponse.parse(result.value));
  }));
}

router.get("/saved", scoped(async (req, res, db): Promise<void> => {
  const query = GetSavedPostsQueryParams.safeParse(req.query);
  res.json(GetSavedPostsResponse.parse(await savedFeed(db, viewerOf(req), query.success ? query.data.cursor : undefined)));
}));

router.get("/blocks", scoped(async (_req, res, db): Promise<void> => {
  res.json(ListBlocksResponse.parse(await listBlocks(db)));
}));

router.put("/blocks/:handle", scoped(async (req, res, db): Promise<void> => {
  const params = BlockProfileParams.safeParse(req.params);
  const result = params.success ? await block(db, viewerOf(req), params.data.handle) : { ok: false as const, error: "not_found" as const };
  if (!result.ok) {
    res.status(result.error === "self" ? 400 : 404).json({ error: result.error === "self" ? "You can't block yourself." : "Profile not found" });
    return;
  }
  res.sendStatus(204);
}));

router.delete("/blocks/:handle", scoped(async (req, res, db): Promise<void> => {
  await unblock(db, viewerOf(req), String(req.params.handle));
  res.sendStatus(204);
}));

const REPORT_ERRORS = {
  not_found: [404, "There's nothing to report there."],
  no_handle: [409, "Choose a handle before reporting."],
  rate_limited: [429, "You've sent a lot of reports today. Try again tomorrow."],
} as const;

router.post("/reports", scoped(async (req, res, db): Promise<void> => {
  const body = CreateReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose what to report and why." });
    return;
  }
  const result = await createReport(db, viewerOf(req), body.data);
  if (!result.ok) {
    const [status, error] = REPORT_ERRORS[result.error];
    res.status(status).json({ error });
    return;
  }
  res.status(201).json(CreateReportResponse.parse(result.value));
}));

export default router;
