import { Router, type IRouter } from "express";
import {
  CreateForumReplyBody,
  CreateForumReplyParams,
  CreateForumReplyResponse,
  CreateForumTopicBody,
  CreateForumTopicResponse,
  DeleteForumReplyParams,
  DeleteForumTopicParams,
  GetForumDiscussionsQueryParams,
  GetForumDiscussionsResponse,
  GetForumHelpersResponse,
  GetForumOverviewResponse,
  GetForumRepliesParams,
  GetForumRepliesResponse,
  GetForumTopicParams,
  GetForumTopicResponse,
  ListForumTopicsQueryParams,
  ListForumTopicsResponse,
  ModerateForumTopicBody,
  ModerateForumTopicParams,
  ModerateForumTopicResponse,
  SetAcceptedAnswerBody,
  SetAcceptedAnswerParams,
  SetAcceptedAnswerResponse,
  UpdateForumTopicBody,
  UpdateForumTopicParams,
  UpdateForumTopicResponse,
  UpvoteForumParams,
  UpvoteForumResponse,
  VoteForumPollBody,
  VoteForumPollParams,
  VoteForumPollResponse,
} from "@workspace/api-zod";
import {
  createReply,
  createTopic,
  deleteReply,
  deleteTopic,
  forumDiscussions,
  forumHelpers,
  forumOverview,
  getTopic,
  listReplies,
  listTopics,
  moderateTopic,
  setAccepted,
  setForumVote,
  updateTopic,
  votePoll,
} from "../access";
import { scoped, type Reply } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// The forum. Reading works signed out (forumPublicRouter, mounted before
// requireAuth); posting, replying and voting need an account.

export const forumPublicRouter: IRouter = Router();
const router: IRouter = Router();

const notFound = (res: Reply) => res.status(404).json({ error: "Topic not found" });
const fail = (res: Reply, status: number, error: string) => res.status(status).json({ error });

forumPublicRouter.get("/public/forum/topics", scoped(async (req, res, db): Promise<void> => {
  const query = ListForumTopicsQueryParams.safeParse(req.query);
  const q = query.success ? query.data : {};
  res.json(ListForumTopicsResponse.parse(await listTopics(db, viewerOf(req), q)));
}));

forumPublicRouter.get("/public/forum/overview", scoped(async (req, res, db): Promise<void> => {
  res.json(GetForumOverviewResponse.parse(await forumOverview(db, viewerOf(req))));
}));

forumPublicRouter.get("/public/forum/helpers", scoped(async (req, res, db): Promise<void> => {
  res.json(GetForumHelpersResponse.parse(await forumHelpers(db, viewerOf(req))));
}));

forumPublicRouter.get("/public/forum/discussions", scoped(async (req, res, db): Promise<void> => {
  const query = GetForumDiscussionsQueryParams.safeParse(req.query);
  res.json(GetForumDiscussionsResponse.parse(query.success ? await forumDiscussions(db, viewerOf(req), query.data) : []));
}));

forumPublicRouter.get("/public/forum/topics/:id", scoped(async (req, res, db): Promise<void> => {
  const params = GetForumTopicParams.safeParse(req.params);
  const topic = params.success ? await getTopic(db, viewerOf(req), params.data.id) : null;
  if (!topic) return void notFound(res);
  res.json(GetForumTopicResponse.parse(topic));
}));

forumPublicRouter.get("/public/forum/topics/:id/replies", scoped(async (req, res, db): Promise<void> => {
  const params = GetForumRepliesParams.safeParse(req.params);
  const replies = params.success ? await listReplies(db, viewerOf(req), params.data.id) : null;
  if (!replies) return void notFound(res);
  res.json(GetForumRepliesResponse.parse(replies));
}));

router.post("/forum/topics", scoped(async (req, res, db): Promise<void> => {
  const body = CreateForumTopicBody.safeParse(req.body);
  if (!body.success) return void fail(res, 400, "Choose a board and a type, and give it a title.");
  const result = await createTopic(db, viewerOf(req), body.data);
  if (!result.ok) {
    const [status, error] = {
      no_handle: [409, "Choose a handle before posting."],
      rate_limited: [429, "You've started a lot of topics this hour. Try again later."],
      bad_title: [400, "Titles are 3 to 140 characters."],
      bad_tags: [400, "Up to 5 tags, using letters, numbers and dashes."],
      bad_poll: [400, "A poll needs 2 to 6 different options."],
      bad_make: [400, "You can only link one of your own makes."],
      bad_catalog: [400, "That pattern or product page doesn't exist."],
      bad_media: [400, "Photos go with Show & tell shared to your feed, and must be your own."],
    }[result.error] as [number, string];
    return void fail(res, status, error);
  }
  res.status(201).json(CreateForumTopicResponse.parse(result.value));
}));

router.patch("/forum/topics/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateForumTopicParams.safeParse(req.params);
  const body = UpdateForumTopicBody.safeParse(req.body);
  if (!params.success) return void notFound(res);
  if (!body.success) return void fail(res, 400, "Check the title and tags.");
  const result = await updateTopic(db, viewerOf(req), params.data.id, body.data);
  if (!result.ok) {
    if (result.error === "not_found") return void notFound(res);
    return void fail(res, 400, result.error === "bad_title" ? "Titles are 3 to 140 characters." : "Up to 5 tags, using letters, numbers and dashes.");
  }
  res.json(UpdateForumTopicResponse.parse(result.value));
}));

router.delete("/forum/topics/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteForumTopicParams.safeParse(req.params);
  if (!params.success || !(await deleteTopic(db, viewerOf(req), params.data.id))) return void notFound(res);
  res.sendStatus(204);
}));

router.put("/forum/topics/:id/accepted", scoped(async (req, res, db): Promise<void> => {
  const params = SetAcceptedAnswerParams.safeParse(req.params);
  const body = SetAcceptedAnswerBody.safeParse(req.body);
  if (!params.success || !body.success) return void notFound(res);
  const result = await setAccepted(db, viewerOf(req), params.data.id, body.data.replyId);
  if (!result.ok) return void (result.error === "bad_reply" ? fail(res, 400, "Choose a reply to this question.") : notFound(res));
  res.json(SetAcceptedAnswerResponse.parse(result.value));
}));

router.post("/forum/topics/:id/moderate", scoped(async (req, res, db): Promise<void> => {
  const params = ModerateForumTopicParams.safeParse(req.params);
  const body = ModerateForumTopicBody.safeParse(req.body);
  if (!params.success || !body.success) return void notFound(res);
  const result = await moderateTopic(db, viewerOf(req), params.data.id, body.data);
  if (!result.ok) return void (result.error === "forbidden" ? fail(res, 403, "Admins only") : notFound(res));
  res.json(ModerateForumTopicResponse.parse(result.value));
}));

router.post("/forum/topics/:id/replies", scoped(async (req, res, db): Promise<void> => {
  const params = CreateForumReplyParams.safeParse(req.params);
  const body = CreateForumReplyBody.safeParse(req.body);
  if (!params.success) return void notFound(res);
  if (!body.success) return void fail(res, 400, "Write a reply (up to 5000 characters).");
  const result = await createReply(db, viewerOf(req), params.data.id, body.data);
  if (!result.ok) {
    const [status, error] = {
      not_found: [404, "Topic not found"],
      locked: [403, "This topic is locked."],
      no_handle: [409, "Choose a handle before replying."],
      rate_limited: [429, "You're replying a lot. Try again in a little while."],
      bad_parent: [400, "You can only reply to an answer in this topic."],
      bad_catalog: [400, "That pattern or product page doesn't exist."],
      empty: [400, "Write a reply (up to 5000 characters)."],
    }[result.error] as [number, string];
    return void fail(res, status, error);
  }
  res.status(201).json(CreateForumReplyResponse.parse(result.value));
}));

router.delete("/forum/replies/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteForumReplyParams.safeParse(req.params);
  if (!params.success || !(await deleteReply(db, viewerOf(req), params.data.id))) return void fail(res, 404, "Reply not found");
  res.sendStatus(204);
}));

router.put("/forum/topics/:id/poll", scoped(async (req, res, db): Promise<void> => {
  const params = VoteForumPollParams.safeParse(req.params);
  const body = VoteForumPollBody.safeParse(req.body);
  if (!params.success || !body.success) return void notFound(res);
  const result = await votePoll(db, viewerOf(req), params.data.id, body.data.optionId);
  if (!result.ok) return void (result.error === "not_found" ? notFound(res) : fail(res, 400, result.error === "closed" ? "This poll has closed." : "That isn't an option in this poll."));
  res.json(VoteForumPollResponse.parse(result.value));
}));

for (const on of [true, false]) {
  router[on ? "put" : "delete"]("/forum/votes/:kind/:id", scoped(async (req, res, db): Promise<void> => {
    const params = UpvoteForumParams.safeParse(req.params);
    const result = params.success ? await setForumVote(db, viewerOf(req), params.data.kind, params.data.id, on) : { ok: false as const, error: "not_found" as const };
    if (!result.ok) return void (result.error === "own" ? fail(res, 400, "You can't upvote your own post.") : fail(res, 404, "Not found"));
    res.json(UpvoteForumResponse.parse(result.value));
  }));
}

export default router;
