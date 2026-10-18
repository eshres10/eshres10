import { Router, type IRouter, type RequestHandler } from "express";
import {
  AddCollectionItemBody,
  AddCollectionItemParams,
  AddCollectionItemResponse,
  CreateCollectionBody,
  CreateCollectionResponse,
  GetSavedOverviewResponse,
  ListCollectionsResponse,
  RemoveCollectionItemParams,
  RemoveCollectionItemQueryParams,
  SendExploreFeedbackBody,
  UndoExploreFeedbackQueryParams,
} from "@workspace/api-zod";
import { addToCollection, createCollection, listCollections, removeFromCollection, savedOverview, sendFeedback, undoFeedback } from "../access";
import { hourlyLimit } from "../lib/hourly";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Explore: private collections and Hide / More like this. Only ever your own.
const router: IRouter = Router();

export const EXPLORE_WRITES_PER_HOUR = 120;
const allowed = hourlyLimit(EXPLORE_WRITES_PER_HOUR);
const NOT_FOUND = { error: "Not found" };

const noStore: RequestHandler = (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); };
const limited: RequestHandler = (req, res, next) => {
  if (!allowed(viewerOf(req).userId!)) return void res.status(429).json({ error: "That's a lot of saving for one hour. Try again later." });
  next();
};

router.get("/saved/overview", noStore, scoped(async (req, res, db): Promise<void> => {
  res.json(GetSavedOverviewResponse.parse(await savedOverview(db, viewerOf(req))));
}));

router.get("/collections", noStore, scoped(async (req, res, db): Promise<void> => {
  res.json(ListCollectionsResponse.parse(await listCollections(db, viewerOf(req))));
}));

router.post("/collections", limited, scoped(async (req, res, db): Promise<void> => {
  const body = CreateCollectionBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Give it a name of up to 40 characters." });
  const result = await createCollection(db, viewerOf(req), body.data.name);
  if (!result.ok) return void res.status(400).json({ error: "Give it a name of up to 40 characters." });
  res.status(result.value.created ? 201 : 200).json(CreateCollectionResponse.parse(result.value.collection));
}));

router.post("/collections/:id/items", limited, scoped(async (req, res, db): Promise<void> => {
  const params = AddCollectionItemParams.safeParse(req.params);
  const body = AddCollectionItemBody.safeParse(req.body);
  if (!params.success || !body.success) return void res.status(404).json(NOT_FOUND);
  const view = await addToCollection(db, viewerOf(req), params.data.id, body.data.type, body.data.id);
  if (!view) return void res.status(404).json(NOT_FOUND);
  res.json(AddCollectionItemResponse.parse(view));
}));

router.delete("/collections/:id/items", limited, scoped(async (req, res, db): Promise<void> => {
  const params = RemoveCollectionItemParams.safeParse(req.params);
  const query = RemoveCollectionItemQueryParams.safeParse(req.query);
  if (!params.success || !query.success) return void res.status(404).json(NOT_FOUND);
  if (!(await removeFromCollection(db, viewerOf(req), params.data.id, query.data.type, query.data.itemId))) return void res.status(404).json(NOT_FOUND);
  res.sendStatus(204);
}));

router.post("/explore/feedback", limited, scoped(async (req, res, db): Promise<void> => {
  const body = SendExploreFeedbackBody.safeParse(req.body);
  if (!body.success) return void res.status(404).json(NOT_FOUND);
  if (!(await sendFeedback(db, viewerOf(req), body.data.type, body.data.id, body.data.kind))) return void res.status(404).json(NOT_FOUND);
  res.sendStatus(204);
}));

router.delete("/explore/feedback", limited, scoped(async (req, res, db): Promise<void> => {
  const query = UndoExploreFeedbackQueryParams.safeParse(req.query);
  if (!query.success) return void res.status(404).json(NOT_FOUND);
  await undoFeedback(db, viewerOf(req), query.data.type, query.data.itemId, query.data.kind);
  res.sendStatus(204);
}));

export default router;
