import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

const { searchPosts, viewerFor } = await import("../src/access");

// Search on Explore: public posts by caption, people by handle or name, tags
// by prefix. Never followers-only or private content (not even your own), and
// nothing across a block in either direction.
const origin = await startApp();

const ann = as(origin, "s_ann"); // author
const fen = as(origin, "s_fen"); // follows Ann
const oak = as(origin, "s_oak"); // someone else
const bo = as(origin, "s_bo"); // Ann blocked them
const anon = as(origin, null);

for (const [user, handle, name] of [[ann, "ann.search", "Ann Okafor"], [fen, "fen.search", "Fen"], [oak, "oak.search", "Oak Linenworth"], [bo, "bo.search", "Bo"]] as const) {
  assert.equal((await user("PATCH", "/api/profile", { handle, name })).status, 200);
}
await ownerSql("INSERT INTO sewspace_profiles (user_id, name) VALUES ('s_nohandle', 'Linen Nohandle') ON CONFLICT DO NOTHING");
await ownerSql("INSERT INTO sewspace_follows VALUES ('s_fen', 's_ann')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('s_ann', 's_bo')");

const post = async (user: ReturnType<typeof as>, caption: string, visibility = "public") => {
  const r = await user("POST", "/api/posts", { kind: "status", caption, visibility });
  assert.equal(r.status, 201, r.text);
  return r.json.id as number;
};
const publicPost = await post(ann, "Washed LINEN wrap dress, finally done #linenwrap");
const followersPost = await post(ann, "Linen muslin, followers only", "followers");
const privatePost = await post(ann, "Linen secret plans", "private");
const boPost = await post(bo, "Bo's linen trousers #linenwrap");
const oakPost = await post(oak, "100% cotton_lawn shirt");

const ids = (r: { json: { items: Array<{ id: number }> } }) => r.json.items.map((p) => p.id).sort();
const find = (user: ReturnType<typeof as>, kind: string, q: string) => user("GET", `/api/public/search/${kind}?q=${encodeURIComponent(q)}`);

test("posts: public captions only, for everyone including the author", async () => {
  for (const [who, user] of [["signed out", anon], ["follower", fen], ["other", oak], ["author", ann]] as const) {
    const r = await find(user, "posts", "linen");
    assert.equal(r.status, 200, r.text);
    assert.ok(ids(r).includes(publicPost), `${who} finds the public post (any case)`);
    assert.ok(!ids(r).includes(followersPost), `${who}: followers-only is never searched`);
    assert.ok(!ids(r).includes(privatePost), `${who}: private is never searched`);
  }
  assert.ok(ids(await find(oak, "posts", "linen")).includes(boPost));
});

test("posts: nothing across a block, either way", async () => {
  assert.ok(!ids(await find(ann, "posts", "linen")).includes(boPost), "the blocker doesn't see the blocked");
  const asBo = ids(await find(bo, "posts", "linen"));
  assert.ok(!asBo.includes(publicPost), "the blocked doesn't see the blocker");
  assert.ok(asBo.includes(boPost));
});

test("posts: wildcards are literal and short queries return nothing", async () => {
  assert.deepEqual(ids(await find(anon, "posts", "%")), []);
  assert.deepEqual(ids(await find(anon, "posts", "l")), [], "one character is too short");
  assert.deepEqual(ids(await find(anon, "posts", "__")), [], "underscores are not wildcards");
  assert.deepEqual(ids(await find(anon, "posts", "0%")), [oakPost]);
  assert.deepEqual(ids(await find(anon, "posts", "n_l")), [oakPost]);
  assert.equal((await anon("GET", "/api/public/search/posts")).status, 200, "a missing q is an empty result");
});

test("posts: the access layer filters on its own (RLS bypassed)", async () => {
  const page = await withoutRls("s_fen", (tx) => searchPosts(tx, viewerFor("s_fen"), "linen"));
  const found = page.items.map((p: { id: number }) => p.id);
  assert.ok(found.includes(publicPost));
  assert.ok(!found.includes(followersPost) && !found.includes(privatePost), "visibility is checked in TypeScript too");
  const asBo = await withoutRls("s_bo", (tx) => searchPosts(tx, viewerFor("s_bo"), "linen"));
  assert.ok(!asBo.items.some((p: { id: number }) => p.id === publicPost), "blocks are checked in TypeScript too");
});

test("people: handle prefix or name, public fields only, no blocks, no handle-less profiles", async () => {
  const handles = async (user: ReturnType<typeof as>, q: string) => (await find(user, "people", q)).json.map((p: { handle: string }) => p.handle);
  assert.deepEqual(await handles(anon, "@ann"), ["ann.search"]);
  assert.deepEqual(await handles(anon, "okafor"), ["ann.search"], "by any part of the name");
  assert.deepEqual(await handles(anon, "linen"), ["oak.search"], "a profile without a handle isn't public");
  const person = (await find(anon, "people", "ann")).json[0];
  assert.deepEqual(Object.keys(person).sort(), ["avatarUrl", "handle", "name"]);
  assert.deepEqual(await handles(ann, "bo.s"), [], "the blocker doesn't find the blocked");
  assert.deepEqual(await handles(bo, "ann"), [], "the blocked doesn't find the blocker");
  assert.deepEqual(await handles(anon, "%"), []);
  const exactFirst = await handles(anon, ".search");
  assert.deepEqual(exactFirst, [], "handles match from the start");
});

test("tags: by prefix, counting public posts only and leaving out blocked people", async () => {
  const anonTags = (await find(anon, "tags", "#linen")).json;
  assert.deepEqual(anonTags, [{ tag: "linenwrap", posts: 2 }]);
  assert.deepEqual((await find(ann, "tags", "linen")).json, [{ tag: "linenwrap", posts: 1 }], "Bo's post isn't counted for Ann");
  assert.deepEqual((await find(anon, "tags", "li")).json.map((t: { tag: string }) => t.tag), ["linenwrap"]);
  assert.deepEqual((await find(anon, "tags", "x!")).json, []);
});
