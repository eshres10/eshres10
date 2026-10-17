import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp } from "./harness";

// Phase F2: create a project in one step, then "Finish setting up": partial
// field updates, setup flags, pattern steps, and progress derived from steps.
const origin = await startApp();
const ann = as(origin, "f2_ann");
const ben = as(origin, "f2_ben");
const anon = as(origin, null);
await ann("PATCH", "/api/profile", { handle: "ann.f2", name: "Ann" });

const pattern = (await ann("POST", "/api/patterns", { name: "Bayside Top", garmentType: "Top", difficulty: "beginner", sizes: "6–24", yardage: 2.4, steps: ["Cut fabric and interfacing", "Staystitch the neckline", "Sew shoulder seams"] })).json;
const plain = (await ann("POST", "/api/patterns", { name: "No steps", garmentType: "Dress", difficulty: "beginner" })).json;
const fabric = (await ann("POST", "/api/fabrics", { name: "Chambray linen", type: "linen", color: "blue", quantity: 2.5, unit: "m" })).json;
const bensFabric = (await ben("POST", "/api/fabrics", { name: "Ben's denim", type: "denim", color: "blue" })).json;

let projectId = 0;
test("quick start: a name, a pattern, a garment; private, with an empty checklist", async () => {
  assert.equal(pattern.steps.length, 3);
  assert.equal(plain.steps, null);
  const r = await ann("POST", "/api/projects", { name: "Sailor top in navy linen", patternId: pattern.id, garment: "Top" });
  assert.equal(r.status, 201, r.text);
  projectId = r.json.id;
  assert.equal(r.json.visibility, "private");
  assert.equal(r.json.garment, "Top");
  assert.deepEqual(r.json.setup, { dismissed: false, visibilityChosen: false, stepsChoice: null });
  const old = await ownerSql(`INSERT INTO sewspace_projects (user_id, name) VALUES ('f2_ann', 'Older') RETURNING setup`);
  assert.deepEqual(old.rows[0].setup, {}, "rows inserted after the migration start empty");
});

test("fields: change a few things at once, only with your own items", async () => {
  const r = await ann("PATCH", `/api/projects/${projectId}/fields`, { fabricId: fabric.id, size: " 12 ", setup: { visibilityChosen: true } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.fabricId, fabric.id);
  assert.equal(r.json.size, "12");
  assert.equal(r.json.patternId, pattern.id, "fields left out are kept");
  assert.equal(r.json.setup.visibilityChosen, true);
  const merged = await ann("PATCH", `/api/projects/${projectId}/fields`, { setup: { stepsChoice: "own" } });
  assert.deepEqual(merged.json.setup, { dismissed: false, visibilityChosen: true, stepsChoice: "own" }, "setup flags merge");
  assert.equal((await ann("PATCH", `/api/projects/${projectId}/fields`, { fabricId: bensFabric.id })).status, 400, "not someone else's fabric");
  assert.equal((await ann("PATCH", `/api/projects/${projectId}/fields`, { setup: { stepsChoice: "maybe" } })).status, 400);
  assert.equal((await ben("PATCH", `/api/projects/${projectId}/fields`, { name: "Mine now" })).status, 404, "only the owner");
  assert.equal((await anon("PATCH", `/api/projects/${projectId}/fields`, { name: "x" })).status, 401);
  const journal = await ann("PATCH", `/api/projects/${projectId}/fields`, { notes: "Pre-washed twice", alterations: "" });
  assert.equal(journal.json.notes, "Pre-washed twice");
  assert.equal(journal.json.alterations, null, "an emptied field is cleared");
  const done = await ann("PATCH", `/api/projects/${projectId}/fields`, { status: "finished" });
  assert.ok(done.json.completedAt, "finishing records the date");
  await ann("PATCH", `/api/projects/${projectId}/fields`, { status: "planning" });
});

test("pattern steps become project steps; progress follows the steps", async () => {
  const other = (await ann("POST", "/api/projects", { name: "Plain dress", patternId: plain.id })).json;
  assert.equal((await ann("POST", `/api/projects/${other.id}/steps/from-pattern`)).status, 400, "a pattern without steps");
  assert.equal((await ben("POST", `/api/projects/${projectId}/steps/from-pattern`)).status, 404);
  const r = await ann("POST", `/api/projects/${projectId}/steps/from-pattern`);
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(r.json.map((s: { title: string }) => s.title), ["Cut fabric and interfacing", "Staystitch the neckline", "Sew shoulder seams"]);
  const project = (await ann("GET", `/api/projects/${projectId}`)).json;
  assert.equal(project.setup.stepsChoice, "pattern");
  assert.equal(project.progress, 0);
  await ann("PATCH", `/api/projects/${projectId}/steps/${r.json[0].id}`, { completed: true });
  assert.equal((await ann("GET", `/api/projects/${projectId}`)).json.progress, 33, "1 of 3 steps");
  for (const step of r.json) await ann("DELETE", `/api/projects/${projectId}/steps/${step.id}`);
  assert.equal((await ann("GET", `/api/projects/${projectId}`)).json.progress, 0, "no steps, no progress");
});

test("setup and pattern steps never reach public pages", async () => {
  await ann("PUT", `/api/visibility/pattern/${pattern.id}`, { visibility: "public" });
  await ann("PUT", `/api/visibility/project/${projectId}`, { visibility: "public" });
  const make = await anon("GET", `/api/public/makes/${projectId}`);
  assert.equal(make.status, 200, make.text);
  assert.doesNotMatch(make.text, /stepsChoice|visibilityChosen|Staystitch/);
});
