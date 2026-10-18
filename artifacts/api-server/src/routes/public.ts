import { Router, type IRouter } from "express";
import {
  GetExploreFeedQueryParams,
  GetExploreCardsQueryParams,
  GetExploreBrowseResponse,
  GetExploreCardsResponse,
  GetExploreFeedResponse,
  GetPublicMakeParams,
  GetPublicMakeResponse,
  GetPublicPostParams,
  GetPublicPostResponse,
  GetPostCommentsPageParams,
  GetPostCommentsPageQueryParams,
  GetPostCommentsPageResponse,
  GetPostCommentsParams,
  GetPostCommentsResponse,
  GetPublicProfileResponse,
  GetProfileMakesResponse,
  GetProfilePostsQueryParams,
  GetProfilePostsResponse,
  GetProfileUsedResponse,
  GetTagPostsParams,
  GetTagPostsQueryParams,
  GetTagPostsResponse,
  SearchPeopleQueryParams,
  SearchPeopleResponse,
  SearchPostsQueryParams,
  SearchPostsResponse,
  SearchTagsQueryParams,
  SearchTagsResponse,
} from "@workspace/api-zod";
import { browsePage, exploreCards, exploreFeed, parseExploreFilter, likedByFollowee, listComments, listCommentsPage, getMakeForViewer, getPostForViewer, getProfileMakes, getProfilePage, getProfilePosts, getProfileUsed, searchPeople, searchPosts, searchTags, tagPage } from "../access";
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
  res.json(GetPublicPostResponse.parse({ ...post, likedBy: await likedByFollowee(db, viewerOf(req), post.id) }));
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

// Signed in, the page carries your own comment likes: never cache it.
router.get("/public/posts/:id/comments/page", (req, res, next) => {
  if (viewerOf(req).userId) res.set("Cache-Control", "private, no-store");
  next();
}, scoped(async (req, res, db): Promise<void> => {
  const params = GetPostCommentsPageParams.safeParse(req.params);
  const query = GetPostCommentsPageQueryParams.safeParse(req.query);
  const page = params.success ? await listCommentsPage(db, viewerOf(req), params.data.id, query.success ? query.data.cursor : undefined) : null;
  if (!page) return void res.status(404).json({ error: "Post not found" });
  res.json(GetPostCommentsPageResponse.parse(page));
}));

// Explore: the mixed browse page (posts, fabric, pattern pages, challenges, threads).
// Signed in, the page holds followers-only posts and your own saves: never cache it.
// Browse by: public parts are the same for everyone signed out (cached 5 minutes); signed in it
// carries Picked for you and your own follow / block state, so it's never cached.
router.get("/public/explore/browse", (req, res, next) => {
  res.set("Cache-Control", viewerOf(req).userId ? "private, no-store" : "public, max-age=300");
  next();
}, scoped(async (req, res, db): Promise<void> => {
  res.json(GetExploreBrowseResponse.parse(await browsePage(db, viewerOf(req))));
}));

router.get("/public/explore/cards", (req, res, next) => {
  if (viewerOf(req).userId) res.set("Cache-Control", "private, no-store");
  next();
}, scoped(async (req, res, db): Promise<void> => {
  const query = GetExploreCardsQueryParams.safeParse(req.query);
  const q = query.success ? query.data : undefined;
  const filter = parseExploreFilter({ category: q?.category, tag: q?.tag, fabric: q?.fabric, way: q?.way });
  res.json(GetExploreCardsResponse.parse(await exploreCards(db, viewerOf(req), q?.tab, q?.sub, q?.cursor, filter)));
}));

router.get("/public/explore", scoped(async (req, res, db): Promise<void> => {
  const parsed = GetExploreFeedQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : { kind: "all" as const, cursor: undefined, sort: "recent" as const };
  res.json(GetExploreFeedResponse.parse(await exploreFeed(db, viewerOf(req), query.kind ?? "all", query.cursor, query.sort ?? "recent")));
}));

// Hashtag pages: public posts with the tag, blocks applied.
router.get("/public/tags/:tag", scoped(async (req, res, db): Promise<void> => {
  const params = GetTagPostsParams.safeParse(req.params);
  const query = GetTagPostsQueryParams.safeParse(req.query);
  const page = params.success ? await tagPage(db, viewerOf(req), params.data.tag, query.success ? query.data.cursor : undefined) : null;
  if (!page) {
    res.status(404).json({ error: "Not a hashtag" });
    return;
  }
  res.json(GetTagPostsResponse.parse(page));
}));

// Search (Explore). Public content only; too-short or invalid queries give empty
// results, not errors, because the box searches as you type.
router.get("/public/search/posts", scoped(async (req, res, db): Promise<void> => {
  const query = SearchPostsQueryParams.safeParse(req.query);
  const page = query.success ? await searchPosts(db, viewerOf(req), query.data.q, query.data.cursor) : { items: [], nextCursor: null };
  res.json(SearchPostsResponse.parse(page));
}));

router.get("/public/search/people", scoped(async (req, res, db): Promise<void> => {
  const query = SearchPeopleQueryParams.safeParse(req.query);
  res.json(SearchPeopleResponse.parse(query.success ? await searchPeople(db, query.data.q) : []));
}));

router.get("/public/search/tags", scoped(async (req, res, db): Promise<void> => {
  const query = SearchTagsQueryParams.safeParse(req.query);
  res.json(SearchTagsResponse.parse(query.success ? await searchTags(db, query.data.q) : []));
}));

export default router;
