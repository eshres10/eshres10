import { test } from "node:test";
import assert from "node:assert/strict";
import { as, startApp } from "./harness";

// A status post's card colour: one of five brand colours, yellow unless
// chosen, set and changed by the author only, shown wherever the post is.
const origin = await startApp();
const ann = as(origin, "cc_ann");
const ben = as(origin, "cc_ben");
const anon = as(origin, null);
await ann("PATCH", "/api/profile", { handle: "ann.cc", name: "Ann" });
await ben("PATCH", "/api/profile", { handle: "ben.cc", name: "Ben" });
const make = (body: Record<string, unknown>) => ann("POST", "/api/posts", { kind: "status", caption: "Hi", visibility: "public", ...body });

test("yellow unless chosen; only the five brand colours", async () => {
  assert.equal((await make({})).json.cardColor, "yellow");
  const r = await make({ cardColor: "blue" });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.cardColor, "blue");
  for (const bad of ["green", "#ff0000", ""]) assert.equal((await make({ cardColor: bad })).status, 400, bad);
});

test("the author changes it; nobody else; it shows with the post", async () => {
  const post = (await make({ cardColor: "peach" })).json as { id: number };
  assert.equal((await ann("PATCH", `/api/posts/${post.id}`, { cardColor: "black" })).json.cardColor, "black");
  assert.equal((await ann("PATCH", `/api/posts/${post.id}`, { caption: "Edited" })).json.cardColor, "black", "left out: kept");
  assert.equal((await ben("PATCH", `/api/posts/${post.id}`, { cardColor: "red" })).status, 404);
  assert.equal((await anon("GET", `/api/public/posts/${post.id}`)).json.cardColor, "black");
  const cards = (await anon("GET", "/api/public/explore/cards?sub=words")).json as { items: Array<{ post: { id: number; cardColor: string } | null }> };
  assert.equal(cards.items.find((c) => c.post?.id === post.id)?.post?.cardColor, "black", "Explore's words card carries it");
});
