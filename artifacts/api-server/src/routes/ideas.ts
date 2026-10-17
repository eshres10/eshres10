import { Router, type IRouter } from "express";
import { CreateIdeaBody, CreateIdeaResponse, DeleteIdeaParams, ListIdeasResponse, UpdateIdeaBody, UpdateIdeaParams, UpdateIdeaResponse } from "@workspace/api-zod";
import { createIdea, deleteIdea, listIdeas, updateIdea } from "../access";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// "My ideas": private pattern + fabric pairs on the studio overview.
const router: IRouter = Router();

const ERRORS = {
  not_yours: [400, "Pick one of your own patterns and fabrics."],
  too_long: [400, "Keep the note to 80 characters."],
  rate_limited: [429, "That's a lot of ideas for one hour. Try again later."],
  not_found: [404, "Idea not found"],
} as const;

router.get("/ideas", scoped(async (req, res, db): Promise<void> => {
  res.json(ListIdeasResponse.parse(await listIdeas(db, viewerOf(req))));
}));

router.post("/ideas", scoped(async (req, res, db): Promise<void> => {
  const body = CreateIdeaBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Pick a pattern and a fabric." });
  const result = await createIdea(db, viewerOf(req), body.data);
  if (!result.ok) {
    const [status, error] = ERRORS[result.error];
    return void res.status(status).json({ error });
  }
  res.status(201).json(CreateIdeaResponse.parse(result.value));
}));

router.patch("/ideas/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateIdeaParams.safeParse(req.params);
  const body = UpdateIdeaBody.safeParse(req.body);
  if (!params.success) return void res.status(404).json({ error: ERRORS.not_found[1] });
  if (!body.success) return void res.status(400).json({ error: "Check the pattern, fabric and note." });
  const result = await updateIdea(db, viewerOf(req), params.data.id, body.data);
  if (!result.ok) {
    const [status, error] = ERRORS[result.error];
    return void res.status(status).json({ error });
  }
  res.json(UpdateIdeaResponse.parse(result.value));
}));

router.delete("/ideas/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteIdeaParams.safeParse(req.params);
  if (!params.success || !(await deleteIdea(db, viewerOf(req), params.data.id))) return void res.status(404).json({ error: ERRORS.not_found[1] });
  res.sendStatus(204);
}));

export default router;
