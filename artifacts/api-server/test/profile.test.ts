import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp } from "./harness";

const origin = await startApp();
const ann = as(origin, "user_ann");
const bea = as(origin, "user_bea");
const anon = as(origin, null);

test("GET /profile creates an empty profile with no demo data", async () => {
  const res = await ann("GET", "/api/profile");
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.handle, null);
  assert.equal(res.json.needsHandle, true);
  assert.equal(res.json.bio, "");
  assert.ok(res.json.joinedAt);
  const fabrics = await ann("GET", "/api/fabrics");
  assert.deepEqual(fabrics.json, []);
  const projects = await ann("GET", "/api/projects");
  assert.deepEqual(projects.json, []);
});

test("signed-out visitors cannot use studio routes", async () => {
  for (const path of ["/api/profile", "/api/fabrics", "/api/projects", "/api/handles/availability?handle=ann"]) {
    assert.equal((await anon("GET", path)).status, 401, path);
  }
});

test("claiming a handle, case-insensitive uniqueness and reserved words", async () => {
  const claim = await ann("PATCH", "/api/profile", { handle: "@Ann.Sews", name: "Ann", bio: "  Linen forever  " });
  assert.equal(claim.status, 200, claim.text);
  assert.equal(claim.json.handle, "ann.sews");
  assert.equal(claim.json.bio, "Linen forever");
  assert.equal(claim.json.needsHandle, false);

  const mine = await ann("GET", "/api/handles/availability?handle=ANN.SEWS");
  assert.deepEqual([mine.json.available, mine.json.reason], [true, "yours"]);

  const taken = await bea("GET", "/api/handles/availability?handle=Ann.Sews");
  assert.equal(taken.json.available, false);
  assert.equal(taken.json.reason, "taken");
  assert.equal(taken.json.suggestion, "ann.sews.sews");

  const conflict = await bea("PATCH", "/api/profile", { handle: "ANN.sews" });
  assert.equal(conflict.status, 409);

  const reserved = await bea("PATCH", "/api/profile", { handle: "forum" });
  assert.equal(reserved.status, 400);
  const reservedCheck = await bea("GET", "/api/handles/availability?handle=forum");
  assert.equal(reservedCheck.json.reason, "reserved");
  assert.ok(reservedCheck.json.suggestion);

  const bad = await bea("PATCH", "/api/profile", { handle: "bea sews!" });
  assert.equal(bad.status, 400);
});

test("public profile is readable signed out and shows public fields only", async () => {
  await ann("PATCH", "/api/profile", { units: "imperial", experience: "advanced" });
  const res = await anon("GET", "/api/public/profiles/ANN.SEWS");
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(Object.keys(res.json).sort(), ["avatarUrl", "bio", "followedByMe", "handle", "instagram", "isMe", "joinedAt", "name", "shopUrl", "stats"]);
  assert.deepEqual(Object.keys(res.json.stats).sort(), ["challengesEntered", "followers", "followersOnlyMakes", "followersOnlyPosts", "following", "makes", "posts"]);
  assert.equal(res.json.handle, "ann.sews");
  assert.equal(res.json.name, "Ann");
  assert.equal((await anon("GET", "/api/public/profiles/nobody.here")).status, 404);
  // A profile without a handle is not public.
  await bea("GET", "/api/profile");
  const [{ id }] = (await ownerSql("SELECT id FROM sewspace_profiles WHERE user_id = 'user_bea'")).rows;
  assert.ok(id);
  assert.equal((await anon("GET", "/api/public/profiles/user_bea")).status, 404);
});

test("avatar must be the user's own avatar upload", async () => {
  const up = await ann("POST", "/api/storage/uploads/request-url", { name: "me.webp", size: 1000, contentType: "image/webp", purpose: "avatar" });
  assert.equal(up.status, 200, up.text);
  const avatarUrl = `/api/storage${up.json.objectPath}`;
  assert.equal((await bea("PATCH", "/api/profile", { avatarUrl })).status, 400, "someone else's upload");
  assert.equal((await ann("PATCH", "/api/profile", { avatarUrl: "https://evil.example/x.png" })).status, 400, "external URL");
  const img = await ann("POST", "/api/storage/uploads/request-url", { name: "fabric.webp", size: 1000, contentType: "image/webp" });
  assert.equal((await ann("PATCH", "/api/profile", { avatarUrl: `/api/storage${img.json.objectPath}` })).status, 400, "non-avatar upload");
  const ok = await ann("PATCH", "/api/profile", { avatarUrl });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.avatarUrl, avatarUrl);
  // The avatar is now public; signed-out visitors can load it.
  assert.equal((await anon("GET", avatarUrl)).status, 200);
});
