import { Router, type IRouter } from "express";
import {
  GetExploreFeedQueryParams,
  GetExploreFeedResponse,
  GetPublicMakeParams,
  GetPublicMakeResponse,
  GetPublicPostParams,
  GetPublicPostResponse,
  GetPublicProfileResponse,
} from "@workspace/api-zod";
import { exploreFeed, getMakeForViewer, getPostForViewer, getPublicProfile } from "../access";
import { viewerOf } from "../middlewares/auth";
import { scoped } from "../lib/scoped";

// Read-only routes that work without signing in. Everything here must go
// through the access module and return public fields only.
const router: IRouter = Router();

router.get("/public/profiles/:handle", scoped(async (req, res, db): Promise<void> => {
  const profile = await getPublicProfile(db, String(req.params.handle));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetPublicProfileResponse.parse(profile));
}));

router.get("/public/makes/:id", scoped(async (req, res, db): Promise<void> => {
  const params = GetPublicMakeParams.safeParse(req.params);
  const make = params.success ? await getMakeForViewer(db, viewerOf(req), params.data.id) : null;
  if (!make) {
    res.status(404).json({ error: "Make not found" });
    return;
  }
  res.json(GetPublicMakeResponse.parse(make));
}));

router.get("/public/posts/:id", scoped(async (req, res, db): Promise<void> => {
  const params = GetPublicPostParams.safeParse(req.params);
  const post = params.success ? await getPostForViewer(db, viewerOf(req), params.data.id) : null;
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(GetPublicPostResponse.parse(post));
}));

router.get("/public/explore", scoped(async (req, res, db): Promise<void> => {
  const parsed = GetExploreFeedQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : { kind: "all" as const, cursor: undefined };
  res.json(GetExploreFeedResponse.parse(await exploreFeed(db, viewerOf(req), query.kind ?? "all", query.cursor)));
}));

export default router;
