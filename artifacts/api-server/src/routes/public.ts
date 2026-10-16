import { Router, type IRouter } from "express";
import { GetPublicMakeParams, GetPublicMakeResponse, GetPublicProfileResponse } from "@workspace/api-zod";
import { getMakeForViewer, getPublicProfile } from "../access";
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

export default router;
