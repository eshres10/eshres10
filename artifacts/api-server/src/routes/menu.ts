import { Router, type IRouter } from "express";
import { GetMenuSummaryResponse, GetSuggestedPeopleResponse } from "@workspace/api-zod";
import { menuSummary, suggestedPeople } from "../access";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Phase M: the account menu's numbers. Only the caller's own (scoped() runs as them).
const router: IRouter = Router();

export const MENU_SUMMARY_PER_HOUR = 120;
const HOUR = 3_600_000;
// Kept in memory per server process: it's a cheap read refetched when the menu
// opens, and a table for it would be heavier than the read (no new tables).
const recent = new Map<string, number[]>();

function allowed(userId: string, now = Date.now()): boolean {
  const kept = (recent.get(userId) ?? []).filter((t) => now - t < HOUR);
  if (kept.length >= MENU_SUMMARY_PER_HOUR) { recent.set(userId, kept); return false; }
  kept.push(now);
  recent.set(userId, kept);
  return true;
}

router.get("/me/menu-summary", (req, res, next) => {
  if (!allowed(viewerOf(req).userId!)) return void res.status(429).json({ error: "Too many requests. Try again later." });
  res.set("Cache-Control", "private, no-store");
  next();
}, scoped(async (req, res, db): Promise<void> => {
  res.json(GetMenuSummaryResponse.parse(await menuSummary(db, viewerOf(req))));
}));

// Home's "Sewists to follow". Your own view of others (who you follow), so never cached.
router.get("/me/suggested-people", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
}, scoped(async (req, res, db): Promise<void> => {
  res.json(GetSuggestedPeopleResponse.parse(await suggestedPeople(db, viewerOf(req))));
}));

export default router;
