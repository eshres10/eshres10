import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

const { listIdeas, updateIdea, deleteIdea, viewerFor } = await import("../src/access");

// Phase S2: "My ideas" are private pattern + fabric pairs. Nobody else reads,
// changes or deletes them, and they can only point at your own items.
const origin = await startApp();
const ann = as(origin, "id_ann");
const ben = as(origin, "id_ben");
const anon = as(origin, null);

const pattern = (await ann("POST", "/api/patterns", { name: "Willa Dress", garmentType: "Dress", difficulty: "", coverImageUrl: null })).json;
const fabric = (await ann("POST", "/api/fabrics", { name: "Polka dot cotton", type: "cotton", color: "" })).json;
const bensPattern = (await ben("POST", "/api/patterns", { name: "Ben's pattern", garmentType: "Top", difficulty: "", visibility: "public" })).json;
const bensFabric = (await ben("POST", "/api/fabrics", { name: "Ben's fabric", type: "linen", color: "", visibility: "public" })).json;

test("save, list, edit and delete your ideas", async () => {
  const r = await ann("POST", "/api/ideas", { patternId: pattern.id, fabricId: fabric.id, note: "  For   summer " });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual([r.json.pattern.name, r.json.fabric.name, r.json.note], ["Willa Dress", "Polka dot cotton", "For summer"]);
  const second = (await ann("POST", "/api/ideas", { patternId: pattern.id, fabricId: fabric.id })).json;
  assert.deepEqual((await ann("GET", "/api/ideas")).json.map((i: { id: number }) => i.id), [second.id, r.json.id], "newest first");
  const edited = await ann("PATCH", `/api/ideas/${r.json.id}`, { note: "Pockets!" });
  assert.equal(edited.json.note, "Pockets!");
  assert.equal((await ann("POST", "/api/ideas", { patternId: pattern.id, fabricId: fabric.id, note: "x".repeat(81) })).status, 400, "80 characters at most");
  assert.equal((await ann("POST", "/api/ideas", { patternId: pattern.id })).status, 400, "needs both");
  assert.equal((await ann("DELETE", `/api/ideas/${second.id}`)).status, 204);
  assert.equal((await ann("GET", "/api/ideas")).json.length, 1);
});

test("only your own items, and nobody else sees or changes your ideas", async () => {
  assert.equal((await ann("POST", "/api/ideas", { patternId: bensPattern.id, fabricId: fabric.id })).status, 400, "someone else's public pattern");
  assert.equal((await ann("POST", "/api/ideas", { patternId: pattern.id, fabricId: bensFabric.id })).status, 400, "someone else's public fabric");
  const [idea] = (await ann("GET", "/api/ideas")).json;
  assert.equal((await ann("PATCH", `/api/ideas/${idea.id}`, { fabricId: bensFabric.id })).status, 400, "can't repoint");
  assert.deepEqual((await ben("GET", "/api/ideas")).json, [], "Ben sees none");
  assert.equal((await ben("PATCH", `/api/ideas/${idea.id}`, { note: "mine" })).status, 404);
  assert.equal((await ben("DELETE", `/api/ideas/${idea.id}`)).status, 404);
  assert.equal((await anon("GET", "/api/ideas")).status, 401, "signed out");

  // Each layer on its own: the access module with RLS bypassed.
  assert.deepEqual(await withoutRls("id_ben", (tx) => listIdeas(tx, viewerFor("id_ben"))), [], "the access layer filters to your own");
  assert.equal((await withoutRls("id_ben", (tx) => updateIdea(tx, viewerFor("id_ben"), idea.id, { note: "x" }))).ok, false);
  assert.equal(await withoutRls("id_ben", (tx) => deleteIdea(tx, viewerFor("id_ben"), idea.id)), false);
  assert.equal((await withoutRls("id_ann", (tx) => updateIdea(tx, viewerFor("id_ann"), idea.id, { patternId: bensPattern.id }))).ok, false, "and checks the items are yours");
});

test("deleting the pattern or fabric deletes the idea; 60 an hour", async () => {
  const f2 = (await ann("POST", "/api/fabrics", { name: "Spare", type: "linen", color: "" })).json;
  await ann("POST", "/api/ideas", { patternId: pattern.id, fabricId: f2.id });
  const before = (await ann("GET", "/api/ideas")).json.length;
  await ann("DELETE", `/api/fabrics/${f2.id}`);
  assert.equal((await ann("GET", "/api/ideas")).json.length, before - 1);
  await ownerSql("INSERT INTO sewspace_ideas (user_id, pattern_id, fabric_id) SELECT 'id_ann', $1, $2 FROM generate_series(1, 60)", [pattern.id, fabric.id]);
  assert.equal((await ann("POST", "/api/ideas", { patternId: pattern.id, fabricId: fabric.id })).status, 429);
});
