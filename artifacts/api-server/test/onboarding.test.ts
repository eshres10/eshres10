import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

const { getOnboarding, onboardingRecommendations, firstSteps, viewerFor } = await import("../src/access");

// Phase O: Pip's onboarding answers are private to their owner, only take the
// listed options, are rate limited, and the Ready screen's recommendations use
// public content and the caller's own answers only.
const origin = await startApp();

const ann = as(origin, "o_ann");
const ben = as(origin, "o_ben");
const host = as(origin, "o_host"); // hosts challenges
const bo = as(origin, "o_bo"); // Ann blocked them
const anon = as(origin, null);

for (const [user, handle] of [[ann, "ann.onb"], [ben, "ben.onb"], [host, "host.onb"], [bo, "bo.onb"]] as const) {
  assert.equal((await user("PATCH", "/api/profile", { handle, name: handle })).status, 200);
}
await ownerSql("INSERT INTO sewspace_blocks VALUES ('o_ann', 'o_bo')");

test("defaults before starting, and signed out gets nothing", async () => {
  const r = await ann("GET", "/api/onboarding");
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { currentStep: 0, goals: [], experience: null, tools: [], stashSize: null, completedAt: null, skippedAt: null });
  assert.equal((await anon("GET", "/api/onboarding")).status, 401);
  assert.equal((await anon("PATCH", "/api/onboarding", { currentStep: 1 })).status, 401);
  assert.equal((await anon("GET", "/api/onboarding/recommendations")).status, 401);
});

test("saving answers step by step; going back keeps them; null clears", async () => {
  let r = await ann("PATCH", "/api/onboarding", { currentStep: 2, goals: ["stash", "learn", "stash"] });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.goals, ["stash", "learn"], "repeats are dropped, order kept");
  r = await ann("PATCH", "/api/onboarding", { currentStep: 3, experience: "start" });
  assert.deepEqual([r.json.currentStep, r.json.goals, r.json.experience], [3, ["stash", "learn"], "start"], "only the fields sent change");
  r = await ann("PATCH", "/api/onboarding", { currentStep: 6, tools: ["machine", "hand"], stashSize: "secret" });
  r = await ann("PATCH", "/api/onboarding", { currentStep: 5 });
  assert.deepEqual([r.json.currentStep, r.json.stashSize], [5, "secret"], "going back keeps answers");
  r = await ann("PATCH", "/api/onboarding", { stashSize: null });
  assert.equal(r.json.stashSize, null, "null clears an answer");
  assert.deepEqual((await ann("GET", "/api/onboarding")).json.tools, ["machine", "hand"], "resume from what was saved");
});

test("only the listed options", async () => {
  for (const body of [{ goals: ["knitting"] }, { experience: "expert" }, { tools: ["loom"] }, { stashSize: "huge" }, { currentStep: 9 }, { currentStep: -1 }, { goals: "stash" }]) {
    assert.equal((await ann("PATCH", "/api/onboarding", body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await ann("GET", "/api/onboarding")).json.currentStep, 5, "nothing changed");
});

test("nobody else reads or changes someone's answers", async () => {
  const theirs = await ben("GET", "/api/onboarding");
  assert.deepEqual(theirs.json.goals, [], "Ben sees his own (empty) answers, not Ann's");
  await ben("PATCH", "/api/onboarding", { goals: ["sell"] });
  assert.deepEqual((await ann("GET", "/api/onboarding")).json.goals, ["stash", "learn"], "Ben's write only touched Ben's row");
  const rows = await ownerSql("SELECT user_id, goals FROM sewspace_onboarding ORDER BY user_id");
  assert.deepEqual(rows.rows.map((r) => [r.user_id, r.goals]), [["o_ann", ["stash", "learn"]], ["o_ben", ["sell"]]]);
});

test("the access layer filters to your own row on its own (RLS bypassed)", async () => {
  const asBen = await withoutRls("o_ben", (tx) => getOnboarding(tx, viewerFor("o_ben")));
  assert.deepEqual(asBen.goals, ["sell"]);
  const asHost = await withoutRls("o_host", (tx) => getOnboarding(tx, viewerFor("o_host")));
  assert.equal(asHost.currentStep, 0, "someone without a row sees defaults, not another person's row");
  assert.deepEqual(asHost.goals, []);
});

test("complete and skip", async () => {
  const skipped = await ben("POST", "/api/onboarding/skip");
  assert.equal(skipped.status, 200, skipped.text);
  assert.ok(skipped.json.skippedAt);
  assert.deepEqual(skipped.json.goals, ["sell"], "skipping keeps the answers");
  const done = await ann("POST", "/api/onboarding/complete");
  assert.ok(done.json.completedAt);
  assert.equal(done.json.currentStep, 8);
  assert.equal(done.json.skippedAt, null);
});

test("120 writes an hour", async () => {
  await ownerSql("UPDATE sewspace_onboarding SET write_count = 119, write_window_at = now() WHERE user_id = 'o_ben'");
  assert.equal((await ben("PATCH", "/api/onboarding", { currentStep: 2 })).status, 200, "the 120th write");
  assert.equal((await ben("PATCH", "/api/onboarding", { currentStep: 3 })).status, 429);
  assert.equal((await ben("POST", "/api/onboarding/complete")).status, 429);
  assert.equal((await ben("GET", "/api/onboarding")).json.currentStep, 2, "the refused write changed nothing");
  await ownerSql("UPDATE sewspace_onboarding SET write_window_at = now() - interval '61 minutes' WHERE user_id = 'o_ben'");
  assert.equal((await ben("PATCH", "/api/onboarding", { currentStep: 3 })).status, 200, "a new hour, a new allowance");
});

test("default post visibility: a private profile preference", async () => {
  assert.equal((await host("GET", "/api/profile")).json.defaultPostVisibility, "public", "existing behaviour: Public");
  const r = await ann("PATCH", "/api/profile", { defaultPostVisibility: "followers" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.defaultPostVisibility, "followers");
  assert.equal((await ann("PATCH", "/api/profile", { defaultPostVisibility: "friends" })).status, 400);
  const pub = await anon("GET", "/api/public/profiles/ann.onb");
  assert.equal(pub.status, 200);
  assert.equal("defaultPostVisibility" in pub.json, false, "not on the public profile");
});

test("first steps follow the goals, fill gaps, and leave out the shop for now", () => {
  assert.deepEqual(firstSteps(["share", "stash"]).map((s) => s.id), ["share", "stash", "follow"]);
  assert.deepEqual(firstSteps([]).map((s) => s.id), ["follow", "share", "stash"]);
  assert.deepEqual(firstSteps(["sell", "challenges"]).map((s) => s.id), ["challenges", "follow", "share"], "no seller onboarding yet");
  assert.equal(firstSteps(["learn"])[0].label, "Pick a beginner pattern and start a project");
});

test("recommendations: public patterns for the answers, a running challenge, nothing private", async () => {
  await ownerSql(`INSERT INTO sewspace_catalog (kind, slug, name, maker, category, difficulty, created_by) VALUES
    ('pattern', 'o-willa-dress', 'Willa Dress', 'O', 'dresses', 'beginner', 'o_host'),
    ('pattern', 'o-hard-dress', 'Couture Dress', 'O', 'dresses', 'advanced', 'o_host'),
    ('pattern', 'o-easy-top', 'Easy Top', 'O', 'tops', 'beginner', 'o_host'),
    ('pattern', 'o-easy-bag', 'Easy Bag', 'O', 'bags', 'beginner', 'o_host'),
    ('pattern', 'o-easy-skirt', 'Easy Skirt', 'O', 'skirts', 'beginner', 'o_host'),
    ('product', 'o-linen', 'Linen', 'O', 'fabric', null, 'o_host')`);
  // A private studio pattern of Ann's must never be recommended.
  await ownerSql(`INSERT INTO sewspace_patterns (user_id, name, garment_type, difficulty, visibility) VALUES ('o_ann', 'My Secret Dress', 'Dress', 'beginner', 'private')`);
  await ownerSql(`INSERT INTO sewspace_challenges (slug, tag, title, description, rules, starts_at, ends_at, created_by) VALUES
    ('makeitmend', 'MakeItMend', 'Make It Mend', '', '', now() - interval '1 day', now() + interval '5 days', 'o_host'),
    ('stashbust', 'StashBust', 'Sew From Your Stash', '', '', now() - interval '1 day', now() + interval '9 days', 'o_host'),
    ('bigone', 'BigOne', 'The big one', '', '', now() - interval '1 day', now() + interval '20 days', 'o_host'),
    ('bosmend', 'BosMend', 'Bo mends', '', '', now() - interval '1 day', now() + interval '20 days', 'o_bo'),
    ('oldmend', 'OldMend', 'Mended last year', '', '', now() - interval '60 days', now() - interval '30 days', 'o_host')`);
  await ownerSql(`INSERT INTO sewspace_challenge_members (challenge_id, user_id) SELECT id, u FROM sewspace_challenges, unnest(ARRAY['o_host','o_ben','o_bo']) u WHERE slug IN ('bigone', 'bosmend')`);

  // Ann: just starting out, likes dresses and mending, wants a stash tracker.
  await ann("PATCH", "/api/profile", { favoriteGarments: ["Dresses", "Mending"] });
  let r = await ann("GET", "/api/onboarding/recommendations");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.patternsTitle, "Beginner-friendly patterns");
  assert.equal(r.json.patterns.length, 3);
  assert.equal(r.json.patterns[0].name, "Willa Dress", "the matching category first");
  assert.ok(r.json.patterns.every((p: { difficulty: string }) => p.difficulty === "beginner"), "beginners get beginner patterns only");
  assert.ok(!JSON.stringify(r.json).includes("My Secret Dress"), "never a studio pattern");
  assert.ok(!JSON.stringify(r.json).includes("createdBy") && !JSON.stringify(r.json).includes("o_host"), "no creator ids");
  assert.equal(r.json.challenge.slug, "makeitmend", "Mending picks the mending challenge");
  assert.deepEqual(r.json.firstSteps.map((s: { id: string }) => s.id), ["stash", "learn", "follow"]);

  // Without Mending, the stash goal picks the stash challenge.
  await ann("PATCH", "/api/profile", { favoriteGarments: ["Dresses"] });
  assert.equal((await ann("GET", "/api/onboarding/recommendations")).json.challenge.slug, "stashbust");

  // Ben: five years or more, no stash goal: any difficulty, the most joined challenge
  // (Bo's has as many members but Ben isn't blocked, so it may compete; Ann never sees it).
  await ben("PATCH", "/api/onboarding", { experience: "years", goals: ["share"] });
  r = await ben("GET", "/api/onboarding/recommendations");
  assert.equal(r.json.patternsTitle, "Patterns for you");
  assert.ok(r.json.patterns.some((p: { name: string }) => p.name === "Couture Dress"), "not limited to beginner patterns");
  assert.ok(["bigone", "bosmend"].includes(r.json.challenge.slug), "the most joined running challenge");

  // Ann with no matching goal or makes: most joined, but never a blocked host's.
  await ann("PATCH", "/api/onboarding", { goals: ["share"] });
  await ann("PATCH", "/api/profile", { favoriteGarments: [] });
  const asAnn = (await ann("GET", "/api/onboarding/recommendations")).json;
  assert.equal(asAnn.challenge.slug, "bigone", "Bo's challenge is hidden across the block");
  const raw = await withoutRls("o_ann", (tx) => onboardingRecommendations(tx, viewerFor("o_ann")));
  assert.equal(raw.challenge?.slug, "bigone", "the access layer leaves the blocked host out on its own");
  assert.ok(!raw.patterns.some((p: { name: string }) => p.name === "My Secret Dress"));
  assert.ok(!JSON.stringify(raw).includes("oldmend"), "ended challenges are never offered");
});

test("no running challenge: no challenge card", async () => {
  await ownerSql("UPDATE sewspace_challenges SET ends_at = now() - interval '1 minute', starts_at = now() - interval '2 days' WHERE ends_at > now()");
  assert.equal((await ann("GET", "/api/onboarding/recommendations")).json.challenge, null);
});
