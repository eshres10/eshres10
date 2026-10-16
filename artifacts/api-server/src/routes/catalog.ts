import { Router, type IRouter } from "express";
import {
  AddCatalogPatternToLibraryParams,
  AddCatalogPatternToLibraryResponse,
  CreateCatalogEntryBody,
  CreateCatalogEntryResponse,
  DeleteReviewParams,
  GetCatalogEntryParams,
  GetCatalogEntryResponse,
  GetCatalogPageParams,
  GetCatalogPageResponse,
  GetCatalogReviewsParams,
  GetCatalogReviewsResponse,
  ListCatalogQueryParams,
  ListCatalogResponse,
  MarkReviewHelpfulParams,
  MarkReviewHelpfulResponse,
  SaveReviewBody,
  SaveReviewParams,
  SaveReviewResponse,
  SetCatalogLinkBody,
  SetCatalogLinkParams,
  SetCatalogLinkResponse,
  UpdateCatalogEntryBody,
  UpdateCatalogEntryParams,
  UpdateCatalogEntryResponse,
} from "@workspace/api-zod";
import {
  addToLibrary,
  createCatalogEntry,
  deleteReview,
  getCatalogEntry,
  getCatalogPage,
  listCatalog,
  listReviews,
  PATTERN_CATEGORIES,
  PRODUCT_CATEGORIES,
  saveReview,
  setCatalogLink,
  setHelpful,
  updateCatalogEntry,
} from "../access";
import { scoped, type Reply } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Shared pattern and product pages. Reading works signed out
// (catalogPublicRouter, mounted before requireAuth); the rest needs an account.

export const catalogPublicRouter: IRouter = Router();
const router: IRouter = Router();

const notFound = (res: Reply) => res.status(404).json({ error: "Page not found" });

catalogPublicRouter.get("/public/catalog", scoped(async (req, res, db): Promise<void> => {
  const query = ListCatalogQueryParams.safeParse(req.query);
  const { kind, q } = query.success ? query.data : { kind: "pattern" as const, q: undefined };
  res.json(ListCatalogResponse.parse(await listCatalog(db, viewerOf(req), kind ?? "pattern", q)));
}));

catalogPublicRouter.get("/public/catalog/:kind/:slug", scoped(async (req, res, db): Promise<void> => {
  const params = GetCatalogPageParams.safeParse(req.params);
  const page = params.success ? await getCatalogPage(db, viewerOf(req), params.data.kind, params.data.slug) : null;
  if (!page) return void notFound(res);
  res.json(GetCatalogPageResponse.parse(page));
}));

catalogPublicRouter.get("/public/catalog/:kind/:slug/reviews", scoped(async (req, res, db): Promise<void> => {
  const params = GetCatalogReviewsParams.safeParse(req.params);
  const reviews = params.success ? await listReviews(db, viewerOf(req), params.data.kind, params.data.slug) : null;
  if (!reviews) return void notFound(res);
  res.json(GetCatalogReviewsResponse.parse(reviews));
}));

catalogPublicRouter.get("/public/catalog-entries/:id", scoped(async (req, res, db): Promise<void> => {
  const params = GetCatalogEntryParams.safeParse(req.params);
  const entry = params.success ? await getCatalogEntry(db, viewerOf(req), params.data.id) : null;
  if (!entry) return void notFound(res);
  res.json(GetCatalogEntryResponse.parse(entry));
}));

const FIELD_ERRORS = {
  invalid_name: [400, "Give it a name."],
  invalid_category: [400, `Choose a category: patterns ${PATTERN_CATEGORIES.join(", ")}; products ${PRODUCT_CATEGORIES.join(", ")}.`],
  invalid_url: [400, "Links must start with http:// or https://."],
  no_handle: [409, "Choose a handle first."],
  rate_limited: [429, "You've added a lot of pages today. Try again tomorrow."],
  not_found: [404, "Page not found"],
} as const;

router.post("/catalog", scoped(async (req, res, db): Promise<void> => {
  const body = CreateCatalogEntryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Give it a name and a category." });
    return;
  }
  const result = await createCatalogEntry(db, viewerOf(req), { ...body.data, maker: body.data.maker ?? "" });
  if (!result.ok) {
    const [status, error] = FIELD_ERRORS[result.error];
    res.status(status).json({ error });
    return;
  }
  res.status(result.value.created ? 201 : 200).json(CreateCatalogEntryResponse.parse(result.value.entry));
}));

router.patch("/catalog/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateCatalogEntryParams.safeParse(req.params);
  const body = UpdateCatalogEntryBody.safeParse(req.body);
  if (!params.success) return void notFound(res);
  if (!body.success) {
    res.status(400).json({ error: "Check the fields and try again." });
    return;
  }
  const result = await updateCatalogEntry(db, viewerOf(req), params.data.id, body.data);
  if (!result.ok) {
    const [status, error] = FIELD_ERRORS[result.error];
    res.status(status).json({ error });
    return;
  }
  res.json(UpdateCatalogEntryResponse.parse(result.value));
}));

router.put("/catalog/:id/review", scoped(async (req, res, db): Promise<void> => {
  const params = SaveReviewParams.safeParse(req.params);
  const body = SaveReviewBody.safeParse(req.body);
  if (!params.success) return void notFound(res);
  if (!body.success) {
    res.status(400).json({ error: "Give it a rating from 1 to 5." });
    return;
  }
  const result = await saveReview(db, viewerOf(req), params.data.id, body.data);
  if (!result.ok) {
    const [status, error] = {
      not_found: [404, "Page not found"],
      no_handle: [409, "Choose a handle before reviewing."],
      bad_make: [400, "You can only attach one of your own makes."],
    }[result.error] as [number, string];
    res.status(status).json({ error });
    return;
  }
  res.json(SaveReviewResponse.parse(result.value));
}));

router.delete("/catalog/:id/review", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteReviewParams.safeParse(req.params);
  if (params.success) await deleteReview(db, viewerOf(req), params.data.id);
  res.sendStatus(204);
}));

for (const on of [true, false]) {
  router[on ? "put" : "delete"]("/reviews/:id/helpful", scoped(async (req, res, db): Promise<void> => {
    const params = MarkReviewHelpfulParams.safeParse(req.params);
    const result = params.success ? await setHelpful(db, viewerOf(req), params.data.id, on) : { ok: false as const, error: "not_found" as const };
    if (!result.ok) {
      res.status(result.error === "own" ? 400 : 404).json({ error: result.error === "own" ? "That's your own review." : "Review not found" });
      return;
    }
    res.json(MarkReviewHelpfulResponse.parse(result.value));
  }));
}

router.post("/catalog/:id/library", scoped(async (req, res, db): Promise<void> => {
  const params = AddCatalogPatternToLibraryParams.safeParse(req.params);
  const result = params.success ? await addToLibrary(db, viewerOf(req), params.data.id) : { ok: false as const, error: "not_found" as const };
  if (!result.ok) {
    res.status(result.error === "not_pattern" ? 400 : 404).json({ error: result.error === "not_pattern" ? "Only patterns go in the pattern library." : "Page not found" });
    return;
  }
  res.json(AddCatalogPatternToLibraryResponse.parse(result.value));
}));

router.put("/catalog-links/:kind/:id", scoped(async (req, res, db): Promise<void> => {
  const params = SetCatalogLinkParams.safeParse(req.params);
  const body = SetCatalogLinkBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a page to link." });
    return;
  }
  const result = await setCatalogLink(db, viewerOf(req), params.data.kind, params.data.id, body.data.catalogId);
  if (!result.ok) {
    res.status(result.error === "wrong_kind" ? 400 : 404).json({
      error: result.error === "wrong_kind" ? "Patterns link to pattern pages; fabrics and threads to product pages." : "Not found",
    });
    return;
  }
  res.json(SetCatalogLinkResponse.parse(result.value));
}));

export default router;
