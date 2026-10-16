import { Router, type IRouter } from "express";
import { GetPublicProfileResponse } from "@workspace/api-zod";
import { getPublicProfile } from "../access";
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

export default router;
