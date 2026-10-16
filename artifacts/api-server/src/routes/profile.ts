import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { profilesTable, type Tx } from "@workspace/db";
import {
  CheckHandleAvailabilityQueryParams,
  CheckHandleAvailabilityResponse,
  GetProfileResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { AVATAR_FIELD, findForeignObjectField, handleAvailability, normaliseHandle } from "../access";
import { getUserId, viewerOf } from "../middlewares/auth";
import { scoped } from "../lib/scoped";

const router: IRouter = Router();

// New accounts start with an empty studio: just a profile row with defaults.
// (Demo "Sophie" data is no longer seeded; existing demo rows are untouched.)
export async function ensureProfile(db: Tx, uid: string): Promise<typeof profilesTable.$inferSelect> {
  await db.insert(profilesTable).values({ userId: uid }).onConflictDoNothing({ target: profilesTable.userId });
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, uid));
  return profile;
}

function profileResponse(row: typeof profilesTable.$inferSelect, isAdmin: boolean) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    joinedAt: row.createdAt,
    experience: row.experience,
    favoriteGarments: row.favoriteGarments,
    units: row.units,
    needsHandle: row.handle === null,
    isAdmin,
  };
}

router.get("/profile", scoped(async (req, res, db): Promise<void> => {
  const profile = await ensureProfile(db, getUserId(req));
  res.json(GetProfileResponse.parse(profileResponse(profile, viewerOf(req).isAdmin)));
}));

router.get("/handles/availability", scoped(async (req, res, db): Promise<void> => {
  const parsed = CheckHandleAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a handle to check" });
    return;
  }
  const profile = await ensureProfile(db, getUserId(req));
  const result = await handleAvailability(db, viewerOf(req), parsed.data.handle, profile.name);
  res.json(CheckHandleAvailabilityResponse.parse(result));
}));

const HANDLE_MESSAGES: Record<string, string> = {
  too_short: "Handles need at least 3 characters.",
  too_long: "Handles can be at most 30 characters.",
  invalid_characters: "Use lowercase letters, numbers, underscores and full stops only.",
  reserved: "That handle is reserved. Try another.",
  taken: "That handle is already taken.",
};

router.patch("/profile", scoped(async (req, res, db): Promise<void> => {
  const raw = { ...(req.body ?? {}) };
  if (typeof raw.handle === "string") raw.handle = normaliseHandle(raw.handle);
  if (typeof raw.bio === "string") raw.bio = raw.bio.trim();
  const parsed = UpdateProfileBody.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    res.status(400).json({ error: field === "handle" ? HANDLE_MESSAGES.invalid_characters : parsed.error.message });
    return;
  }
  const viewer = viewerOf(req);
  const uid = getUserId(req);
  const existing = await ensureProfile(db, uid);
  const update = parsed.data;

  if (update.handle !== undefined && update.handle !== existing.handle) {
    const check = await handleAvailability(db, viewer, update.handle, existing.name);
    if (!check.available) {
      res.status(check.reason === "taken" ? 409 : 400).json({ error: HANDLE_MESSAGES[check.reason] ?? "That handle can't be used." });
      return;
    }
  }
  const foreign = await findForeignObjectField(db, viewer, update, { avatarUrl: AVATAR_FIELD }, existing);
  if (foreign) {
    res.status(400).json({ error: "Upload the avatar again; that file isn't one of your uploads." });
    return;
  }

  try {
    // Savepoint, so a lost race on the unique handle index leaves the request usable.
    const profile = await db.transaction(async (sp) => {
      const [row] = await sp.update(profilesTable).set(update).where(eq(profilesTable.userId, uid)).returning();
      return row;
    });
    res.json(UpdateProfileResponse.parse(profileResponse(profile, viewerOf(req).isAdmin)));
  } catch (error) {
    if ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") {
      res.status(409).json({ error: HANDLE_MESSAGES.taken });
      return;
    }
    throw error;
  }
}));

export default router;
