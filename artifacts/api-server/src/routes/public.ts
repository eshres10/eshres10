import { Router, type IRouter } from "express";
import {
  GetExploreFeedQueryParams,
  GetExploreFeedResponse,
  GetPublicMakeParams,
  GetPublicMakeResponse,
  GetPublicPostParams,
  GetPublicPostResponse,
  GetPostCommentsParams,
  GetPostCommentsResponse,
  GetPublicProfileResponse,
  GetProfileMakesResponse,
  GetProfilePostsQueryParams,
  GetProfilePostsResponse,
  GetProfileUsedResponse,
} from "@workspace/api-zod";
import { exploreFeed, listComments, getMakeForViewer, getPostForViewer, getProfileMakes, getProfilePage, getProfilePosts, getProfileUsed } from "../access";
import { viewerOf } from "../middlewares/auth";
import { scoped } from "../lib/scoped";

// Read-only routes that work without signing in. Everything here must go
// through the access module and return public fields only.
const router: IRouter = Router();

// Profile pages. A profile on the other side of a block is "not found".
router.get("/public/profiles/:handle", scoped(async (req, res, db): Promise<void> => {
  const profile = await getProfilePage(db, viewerOf(req), String(req.params.handle));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetPublicProfileResponse.parse(profile));
}));

router.get("/public/profiles/:handle/posts", scoped(async (req, res, db): Promise<void> => {
  const query = GetProfilePostsQueryParams.safeParse(req.query);
  const page = await getProfilePosts(db, viewerOf(req), String(req.params.handle), query.success ? query.data.cursor : undefined);
  if (!page) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetProfilePostsResponse.parse(page));
}));

router.get("/public/profiles/:handle/makes", scoped(async (req, res, db): Promise<void> => {
  const makes = await getProfileMakes(db, viewerOf(req), String(req.params.handle));
  if (!makes) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetProfileMakesResponse.parse(makes));
}));

router.get("/public/profiles/:handle/used", scoped(async (req, res, db): Promise<void> => {
  const used = await getProfileUsed(db, viewerOf(req), String(req.params.handle));
  if (!used) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetProfileUsedResponse.parse(used));
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

router.get("/public/posts/:id/comments", scoped(async (req, res, db): Promise<void> => {
  const params = GetPostCommentsParams.safeParse(req.params);
  const comments = params.success ? await listComments(db, viewerOf(req), params.data.id) : null;
  if (!comments) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(GetPostCommentsResponse.parse(comments));
}));

router.get("/public/explore", scoped(async (req, res, db): Promise<void> => {
  const parsed = GetExploreFeedQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : { kind: "all" as const, cursor: undefined, sort: "recent" as const };
  res.json(GetExploreFeedResponse.parse(await exploreFeed(db, viewerOf(req), query.kind ?? "all", query.cursor, query.sort ?? "recent")));
}));

export default router;
