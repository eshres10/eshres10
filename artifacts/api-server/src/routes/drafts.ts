import { Router, type IRouter } from "express";
import { DeleteDraftParams, GetDraftParams, GetDraftResponse, SaveDraftBody, SaveDraftParams, SaveDraftResponse } from "@workspace/api-zod";
import { deleteDraft, draftResponse, getDraft, saveDraft } from "../access";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// One private draft per flow. Saved as the person types; deleted on submit.
const router: IRouter = Router();

const SAVE_ERRORS = {
  invalid: [400, "That draft couldn't be saved."],
  foreign_file: [400, "A file in this draft isn't one of your uploads."],
  too_large: [413, "This draft is too long to keep. Shorten it or post it."],
} as const;

router.get("/drafts/:kind", scoped(async (req, res, db): Promise<void> => {
  const params = GetDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const row = await getDraft(db, viewerOf(req), params.data.kind);
  res.json(GetDraftResponse.parse({ draft: row ? draftResponse(row) : null }));
}));

router.put("/drafts/:kind", scoped(async (req, res, db): Promise<void> => {
  const params = SaveDraftParams.safeParse(req.params);
  const body = SaveDraftBody.safeParse(req.body);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: SAVE_ERRORS.invalid[1] });
    return;
  }
  const result = await saveDraft(db, viewerOf(req), params.data.kind, body.data.payload);
  if (!result.ok) {
    const [status, error] = SAVE_ERRORS[result.error];
    res.status(status).json({ error });
    return;
  }
  res.json(SaveDraftResponse.parse(draftResponse(result.value)));
}));

router.delete("/drafts/:kind", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await deleteDraft(db, viewerOf(req), params.data.kind);
  res.sendStatus(204);
}));

export default router;
