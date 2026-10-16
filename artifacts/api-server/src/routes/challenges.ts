import { Router, type IRouter } from "express";
import {
  CreateChallengeBody,
  CreateChallengeResponse,
  DeleteChallengeEntryParams,
  EnterChallengeBody,
  EnterChallengeParams,
  EnterChallengeResponse,
  GetChallengeEntriesParams,
  GetChallengeEntriesQueryParams,
  GetChallengeEntriesResponse,
  GetChallengePageParams,
  GetChallengePageResponse,
  JoinChallengeParams,
  JoinChallengeResponse,
  ListChallengesQueryParams,
  ListChallengesResponse,
  ListJoinedChallengesResponse,
  UpdateChallengeBody,
  UpdateChallengeParams,
  UpdateChallengeResponse,
} from "@workspace/api-zod";
import {
  createChallenge,
  deleteEntry,
  enterChallenge,
  getChallengePage,
  listChallenges,
  listEntries,
  listJoinedChallenges,
  setMembership,
  updateChallenge,
} from "../access";
import { scoped, type Reply } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Challenges. Reading works signed out (challengesPublicRouter, mounted before
// requireAuth); starting, joining and entering need an account.

export const challengesPublicRouter: IRouter = Router();
const router: IRouter = Router();

const notFound = (res: Reply) => res.status(404).json({ error: "Challenge not found" });

challengesPublicRouter.get("/public/challenges", scoped(async (req, res, db): Promise<void> => {
  const query = ListChallengesQueryParams.safeParse(req.query);
  res.json(ListChallengesResponse.parse(await listChallenges(db, viewerOf(req), query.success ? query.data.status ?? "active" : "active")));
}));

challengesPublicRouter.get("/public/challenges/:slug", scoped(async (req, res, db): Promise<void> => {
  const params = GetChallengePageParams.safeParse(req.params);
  const page = params.success ? await getChallengePage(db, viewerOf(req), params.data.slug) : null;
  if (!page) return void notFound(res);
  res.json(GetChallengePageResponse.parse(page));
}));

challengesPublicRouter.get("/public/challenges/:slug/entries", scoped(async (req, res, db): Promise<void> => {
  const params = GetChallengeEntriesParams.safeParse(req.params);
  const query = GetChallengeEntriesQueryParams.safeParse(req.query);
  const { sort, cursor } = query.success ? query.data : { sort: "liked" as const, cursor: undefined };
  const page = params.success ? await listEntries(db, viewerOf(req), params.data.slug, sort ?? "liked", cursor) : null;
  if (!page) return void notFound(res);
  res.json(GetChallengeEntriesResponse.parse(page));
}));

// Registered before "/challenges/:slug" routes so "joined" isn't read as a slug.
router.get("/challenges/joined", scoped(async (req, res, db): Promise<void> => {
  res.json(ListJoinedChallengesResponse.parse(await listJoinedChallenges(db, viewerOf(req))));
}));

router.post("/challenges", scoped(async (req, res, db): Promise<void> => {
  const body = CreateChallengeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Give it a tag (3–30 letters or numbers), a title and dates." });
    return;
  }
  const result = await createChallenge(db, viewerOf(req), body.data);
  if (!result.ok) {
    const [status, error] = {
      no_handle: [409, "Choose a handle before starting a challenge."],
      bad_tag: [400, "Tags are 3–30 letters or numbers, no spaces."],
      bad_dates: [400, "Choose dates up to 92 days apart, ending in the future."],
      taken: [409, "That tag is already a challenge. Pick another."],
      rate_limited: [429, "You've started a few challenges today. Try again tomorrow."],
    }[result.error] as [number, string];
    res.status(status).json({ error });
    return;
  }
  res.status(201).json(CreateChallengeResponse.parse(result.value));
}));

router.patch("/challenges/:slug", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateChallengeParams.safeParse(req.params);
  const body = UpdateChallengeBody.safeParse(req.body);
  if (!params.success) return void notFound(res);
  if (!body.success) {
    res.status(400).json({ error: "Check the fields and try again." });
    return;
  }
  const updated = await updateChallenge(db, viewerOf(req), params.data.slug, body.data);
  if (!updated) return void notFound(res);
  res.json(UpdateChallengeResponse.parse(updated));
}));

for (const on of [true, false]) {
  router[on ? "put" : "delete"]("/challenges/:slug/membership", scoped(async (req, res, db): Promise<void> => {
    const params = JoinChallengeParams.safeParse(req.params);
    const result = params.success ? await setMembership(db, viewerOf(req), params.data.slug, on) : { ok: false as const, error: "not_found" as const };
    if (!result.ok) {
      if (result.error === "ended") res.status(400).json({ error: "This challenge has ended." });
      else notFound(res);
      return;
    }
    res.json(JoinChallengeResponse.parse(result.value));
  }));
}

router.post("/challenges/:slug/entries", scoped(async (req, res, db): Promise<void> => {
  const params = EnterChallengeParams.safeParse(req.params);
  const body = EnterChallengeBody.safeParse(req.body);
  if (!params.success) return void notFound(res);
  if (!body.success) {
    res.status(400).json({ error: "Choose a post to enter." });
    return;
  }
  const result = await enterChallenge(db, viewerOf(req), params.data.slug, body.data.postId);
  if (!result.ok) {
    const [status, error] = {
      not_found: [404, "Challenge not found"],
      not_running: [400, "This challenge isn't running right now."],
      bad_post: [400, "Enter one of your own public posts."],
      removed: [400, "The host removed this post from the challenge."],
      already: [409, "That post is already entered."],
    }[result.error] as [number, string];
    res.status(status).json({ error });
    return;
  }
  res.status(201).json(EnterChallengeResponse.parse(result.value));
}));

router.delete("/challenge-entries/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteChallengeEntryParams.safeParse(req.params);
  if (!params.success || !(await deleteEntry(db, viewerOf(req), params.data.id))) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.sendStatus(204);
}));

export default router;
