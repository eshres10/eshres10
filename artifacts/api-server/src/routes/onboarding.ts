import { Router, type IRouter } from "express";
import {
  CompleteOnboardingResponse,
  GetOnboardingRecommendationsResponse,
  GetOnboardingResponse,
  SkipOnboardingResponse,
  UpdateOnboardingBody,
  UpdateOnboardingResponse,
} from "@workspace/api-zod";
import { completeOnboarding, getOnboarding, onboardingRecommendations, skipOnboarding, updateOnboarding } from "../access";
import { scoped } from "../lib/scoped";
import { getUserId, viewerOf } from "../middlewares/auth";
import { ensureProfile } from "./profile";

// Pip's setup questions (Phase O). Private to the signed-in person.
const router: IRouter = Router();

const RATE_LIMITED = "That's a lot of saving for one hour. Try again later.";

router.get("/onboarding", scoped(async (req, res, db): Promise<void> => {
  res.json(GetOnboardingResponse.parse(await getOnboarding(db, viewerOf(req))));
}));

router.patch("/onboarding", scoped(async (req, res, db): Promise<void> => {
  const body = UpdateOnboardingBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Pick from the options shown." });
  await ensureProfile(db, getUserId(req));
  const result = await updateOnboarding(db, viewerOf(req), body.data);
  if (!result.ok) return void res.status(429).json({ error: RATE_LIMITED });
  res.json(UpdateOnboardingResponse.parse(result.value));
}));

router.post("/onboarding/complete", scoped(async (req, res, db): Promise<void> => {
  await ensureProfile(db, getUserId(req));
  const result = await completeOnboarding(db, viewerOf(req));
  if (!result.ok) return void res.status(429).json({ error: RATE_LIMITED });
  res.json(CompleteOnboardingResponse.parse(result.value));
}));

router.post("/onboarding/skip", scoped(async (req, res, db): Promise<void> => {
  await ensureProfile(db, getUserId(req));
  const result = await skipOnboarding(db, viewerOf(req));
  if (!result.ok) return void res.status(429).json({ error: RATE_LIMITED });
  res.json(SkipOnboardingResponse.parse(result.value));
}));

router.get("/onboarding/recommendations", scoped(async (req, res, db): Promise<void> => {
  res.json(GetOnboardingRecommendationsResponse.parse(await onboardingRecommendations(db, viewerOf(req))));
}));

export default router;
