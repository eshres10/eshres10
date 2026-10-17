import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { catalogTable, onboardingTable, profilesTable, reviewsTable, type Onboarding, type Tx } from "@workspace/db";
import { entryViews } from "./catalog";
import { listChallenges } from "./challenges";
import { own } from "./studio";
import type { Viewer } from "./viewer";

// Pip's onboarding (Phase O). The answers are private to their owner: every
// query filters to the caller's own row, and RLS (owner_all, migration 0015)
// does the same underneath. The questions that map onto existing profile
// fields (name, experience, favourite things to make, default post
// visibility) are saved through PATCH /profile, not here.

export const ONBOARDING_GOALS = ["stash", "idea", "learn", "share", "challenges", "sell"] as const;
export const ONBOARDING_EXPERIENCE = ["start", "couple", "years", "pro"] as const;
export const ONBOARDING_TOOLS = ["machine", "overlocker", "cover", "embroidery", "hand"] as const;
export const ONBOARDING_STASH = ["start", "drawer", "cupboard", "secret"] as const;
export const ONBOARDING_LAST_STEP = 8;
export const ONBOARDING_WRITES_PER_HOUR = 120;

/** Question 3 onto the profile's experience field. */
export const EXPERIENCE_LEVEL: Record<(typeof ONBOARDING_EXPERIENCE)[number], "beginner" | "intermediate" | "advanced"> = {
  start: "beginner", couple: "intermediate", years: "advanced", pro: "advanced",
};

type Goal = (typeof ONBOARDING_GOALS)[number];
type Fail<E extends string> = { ok: false; error: E };
type Ok<T> = { ok: true; value: T };

export interface OnboardingView {
  currentStep: number;
  goals: Goal[];
  experience: (typeof ONBOARDING_EXPERIENCE)[number] | null;
  tools: (typeof ONBOARDING_TOOLS)[number][];
  stashSize: (typeof ONBOARDING_STASH)[number] | null;
  completedAt: Date | null;
  skippedAt: Date | null;
}

export interface OnboardingInput {
  currentStep?: number;
  goals?: Goal[];
  experience?: OnboardingView["experience"];
  tools?: OnboardingView["tools"];
  stashSize?: OnboardingView["stashSize"];
}

const EMPTY: OnboardingView = { currentStep: 0, goals: [], experience: null, tools: [], stashSize: null, completedAt: null, skippedAt: null };

function view(row: Onboarding | undefined): OnboardingView {
  if (!row) return { ...EMPTY };
  return {
    currentStep: row.currentStep,
    goals: row.goals as Goal[],
    experience: row.experience as OnboardingView["experience"],
    tools: row.tools as OnboardingView["tools"],
    stashSize: row.stashSize as OnboardingView["stashSize"],
    completedAt: row.completedAt,
    skippedAt: row.skippedAt,
  };
}

async function ownRow(db: Tx, viewer: Viewer): Promise<Onboarding | undefined> {
  const [row] = await db.select().from(onboardingTable).where(own(onboardingTable, viewer)).limit(1);
  return row;
}

/** Your answers and step; the defaults (step 0, nothing answered) before you start. */
export async function getOnboarding(db: Tx, viewer: Viewer): Promise<OnboardingView> {
  if (!viewer.userId) throw new Error("getOnboarding needs a signed-in viewer");
  return view(await ownRow(db, viewer));
}

/** The same values in the same order, without repeats (a list answer saved twice stays one answer). */
const unique = <T>(values: T[] | undefined) => (values ? [...new Set(values)] : undefined);

// Every write goes through here: it upserts the caller's row with `changes`
// and counts the write in a one-hour window (rate limit). The profile row must
// exist first (the route calls ensureProfile).
async function write(db: Tx, viewer: Viewer, changes: Partial<typeof onboardingTable.$inferInsert>): Promise<Ok<OnboardingView> | Fail<"rate_limited">> {
  if (!viewer.userId) throw new Error("onboarding writes need a signed-in viewer");
  const existing = await ownRow(db, viewer);
  const now = new Date();
  const freshWindow = !existing || now.getTime() - existing.writeWindowAt.getTime() >= 3600_000;
  const writes = freshWindow ? 1 : existing.writeCount + 1;
  if (writes > ONBOARDING_WRITES_PER_HOUR) return { ok: false, error: "rate_limited" };
  const counter = { writeCount: writes, writeWindowAt: freshWindow ? now : existing.writeWindowAt, updatedAt: now };
  const [row] = await db
    .insert(onboardingTable)
    .values({ userId: viewer.userId, ...changes, ...counter })
    .onConflictDoUpdate({ target: onboardingTable.userId, set: { ...changes, ...counter } })
    .returning();
  return { ok: true, value: view(row) };
}

/** Save some answers and/or the step. Values were checked against the options by the API schema (and SQL CHECKs). */
export function updateOnboarding(db: Tx, viewer: Viewer, input: OnboardingInput) {
  const changes: Partial<typeof onboardingTable.$inferInsert> = {};
  if (input.currentStep !== undefined) changes.currentStep = input.currentStep;
  if (input.goals !== undefined) changes.goals = unique(input.goals);
  if (input.experience !== undefined) changes.experience = input.experience;
  if (input.tools !== undefined) changes.tools = unique(input.tools);
  if (input.stashSize !== undefined) changes.stashSize = input.stashSize;
  return write(db, viewer, changes);
}

export function completeOnboarding(db: Tx, viewer: Viewer) {
  return write(db, viewer, { completedAt: new Date(), currentStep: ONBOARDING_LAST_STEP });
}

/** "Skip for now" / "Finish setup later": the answers so far are kept. */
export function skipOnboarding(db: Tx, viewer: Viewer) {
  return write(db, viewer, { skippedAt: new Date() });
}

// ---- The Ready screen ------------------------------------------------------

const STEP_COPY: Record<Goal | "follow", { label: string; href: string }> = {
  stash: { label: "Add your first 3 fabrics to your stash", href: "/stash/new?kind=fabric" },
  idea: { label: "Save a pattern you’d love to make", href: "/catalog" },
  learn: { label: "Pick a beginner pattern and start a project", href: "/catalog" },
  share: { label: "Post your latest make", href: "/new" },
  challenges: { label: "Join this month’s challenge", href: "/challenges" },
  // Only offered once seller onboarding exists (the marketplace is "coming soon").
  sell: { label: "Set up your pattern shop", href: "/marketplace" },
  follow: { label: "Follow 3 sewists you like", href: "/explore" },
};
const SELLING_OPEN = false;
// When there are fewer than three, these fill the gaps (same order as the mockup).
const FILLERS = ["follow", "share", "stash"] as const;

/** Question 4's answers as catalog pattern categories (Costume and Mending have none). */
const MAKE_CATEGORY: Record<string, string> = {
  dresses: "dresses", tops: "tops", skirts: "skirts", trousers: "trousers", outerwear: "outerwear", knits: "knitwear", bags: "bags",
};
const RECOMMENDED = 3;

export function firstSteps(goals: Goal[]) {
  const ids: Array<Goal | "follow"> = [];
  for (const id of [...goals, ...FILLERS]) {
    if (id === "sell" && !SELLING_OPEN) continue;
    const label = STEP_COPY[id].label;
    if (!ids.some((x) => STEP_COPY[x].label === label)) ids.push(id);
  }
  return ids.slice(0, RECOMMENDED).map((id) => ({ id, ...STEP_COPY[id] }));
}

/**
 * First steps, three patterns and a challenge, from the caller's own answers
 * and public content only: shared catalog pattern pages (public reference
 * pages, never anyone's studio patterns) and running challenges (hosts on the
 * other side of a block left out).
 */
export async function onboardingRecommendations(db: Tx, viewer: Viewer) {
  const answers = await getOnboarding(db, viewer);
  const [profile] = await db.select({ favoriteGarments: profilesTable.favoriteGarments }).from(profilesTable).where(own(profilesTable, viewer)).limit(1);
  const makes = (profile?.favoriteGarments ?? []).map((m) => m.trim().toLowerCase());
  const beginner = answers.experience === null || answers.experience === "start";

  // Patterns: matching categories first, then the most reviewed; beginners get beginner patterns only.
  const categories = [...new Set(makes.map((m) => MAKE_CATEGORY[m]).filter(Boolean))];
  const reviews = sql`(SELECT count(*) FROM ${reviewsTable} WHERE ${reviewsTable.catalogId} = ${catalogTable.id})`;
  const rows = await db
    .select()
    .from(catalogTable)
    .where(and(eq(catalogTable.kind, "pattern"), beginner ? eq(catalogTable.difficulty, "beginner") : undefined))
    .orderBy(...(categories.length ? [desc(inArray(catalogTable.category, categories))] : []), desc(reviews), catalogTable.name)
    .limit(RECOMMENDED);
  const patterns = await entryViews(db, viewer, rows);

  // Challenge: mending if they make mending, else a stash challenge if that's a goal, else the most joined.
  const running = await listChallenges(db, viewer, "active");
  const about = (word: string) => running.find((c) => `${c.tag} ${c.title}`.toLowerCase().includes(word));
  const popular = [...running].sort((a, b) => b.members - a.members || b.entries - a.entries)[0];
  const challenge = (makes.includes("mending") ? about("mend") : undefined)
    ?? (answers.goals.includes("stash") ? about("stash") : undefined)
    ?? popular ?? null;

  return {
    firstSteps: firstSteps(answers.goals),
    patternsTitle: beginner ? "Beginner-friendly patterns" : "Patterns for you",
    patterns,
    challenge,
  };
}
