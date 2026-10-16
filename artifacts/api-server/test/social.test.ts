import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

process.env.ADMIN_USER_IDS = "s_adm";
const { listComments, listReports, setLike, viewerFor } = await import("../src/access");

// Phase 4: likes, comments, saves, follows, blocks, reports and admin review,
// for the author, a follower, another user, signed out, a blocked user and an admin.
const origin = await startApp();
const ana = as(origin, "s_ana"); // author
const fay = as(origin, "s_fay"); // will follow Ana
const oli = as(origin, "s_oli"); // signed in, doesn't follow
const ben = as(origin, "s_ben"); // Ana will block him
const adm = as(origin, "s_adm"); // admin
const nob = as(origin, "s_nob"); // signed in, no handle yet
const anon = as(origin, null);

for (const [user, handle] of [[ana, "ana"], [fay, "fay"], [oli, "oli"], [ben, "ben"], [adm, "adm"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.soc`, name: handle });
}
await nob("GET", "/api/profile");

const post = async (caption: string, visibility: string) => {
  const r = await ana("POST", "/api/posts", { kind: "status", caption, visibility });
  assert.equal(r.status, 201, r.text);
  return r.json.id as number;
};
const pub = await post("Public post", "public");
const fol = await post("Followers post", "followers");
const prv = await post("Private post", "private");
const quiet = await post("Another public post", "public");

test("follow and unfollow", async () => {
  assert.equal((await anon("PUT", "/api/follows/ana.soc")).status, 401);
  const r = await fay("PUT", "/api/follows/ANA.soc");
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { following: true, followers: 1 });
  assert.deepEqual((await fay("PUT", "/api/follows/ana.soc")).json, { following: true, followers: 1 }, "idempotent");
  assert.equal((await ana("PUT", "/api/follows/ana.soc")).status, 400, "not yourself");
  assert.equal((await fay("PUT", "/api/follows/nobody.here")).status, 404);
  assert.equal((await fay("GET", "/api/public/profiles/ana.soc")).json.followedByMe, true);
  assert.equal((await oli("GET", "/api/public/profiles/ana.soc")).json.followedByMe, false);
  // Following opens followers-only posts.
  assert.equal((await fay("GET", `/api/public/posts/${fol}`)).status, 200);
  assert.equal((await oli("GET", `/api/public/posts/${fol}`)).status, 404);
});

test("likes: only posts you may see, counted on every post", async () => {
  assert.equal((await anon("PUT", `/api/posts/${pub}/like`)).status, 401);
  assert.deepEqual((await oli("PUT", `/api/posts/${pub}/like`)).json, { liked: true, likeCount: 1 });
  assert.deepEqual((await oli("PUT", `/api/posts/${pub}/like`)).json, { liked: true, likeCount: 1 }, "idempotent");
  assert.deepEqual((await fay("PUT", `/api/posts/${pub}/like`)).json, { liked: true, likeCount: 2 });
  assert.equal((await oli("PUT", `/api/posts/${fol}/like`)).status, 404, "followers-only, not following");
  assert.equal((await fay("PUT", `/api/posts/${fol}/like`)).status, 200);
  assert.equal((await fay("PUT", `/api/posts/${prv}/like`)).status, 404, "private");
  const seen = await oli("GET", `/api/public/posts/${pub}`);
  assert.equal(seen.json.likeCount, 2);
  assert.equal(seen.json.likedByMe, true);
  const signedOut = await anon("GET", `/api/public/posts/${pub}`);
  assert.deepEqual([signedOut.json.likeCount, signedOut.json.likedByMe], [2, false]);
  assert.deepEqual((await fay("DELETE", `/api/posts/${fol}/like`)).json, { liked: false, likeCount: 0 });
});

test("explore can sort by likes", async () => {
  const recent = await anon("GET", "/api/public/explore");
  const popular = await anon("GET", "/api/public/explore?sort=popular");
  assert.equal(recent.json.items[0].id, quiet, "newest first");
  assert.equal(popular.json.items[0].id, pub, "most liked first");
  assert.ok(!popular.json.items.some((p: { id: number }) => p.id === fol || p.id === prv), "public posts only");
});

let topId = 0;
test("comments and one level of replies", async () => {
  const top = await oli("POST", `/api/posts/${pub}/comments`, { body: "  Lovely fit!  " });
  assert.equal(top.status, 201, top.text);
  assert.equal(top.json.body, "Lovely fit!");
  topId = top.json.id;
  const reply = await fay("POST", `/api/posts/${pub}/comments`, { body: "Agreed", parentId: topId });
  assert.equal(reply.status, 201, reply.text);
  assert.equal((await fay("POST", `/api/posts/${pub}/comments`, { body: "Nested", parentId: reply.json.id })).status, 400, "one level only");
  assert.equal((await oli("POST", `/api/posts/${fol}/comments`, { body: "Hi" })).status, 404, "can't comment on what you can't see");
  assert.equal((await oli("POST", `/api/posts/${pub}/comments`, { body: "   " })).status, 400);
  assert.equal((await nob("POST", `/api/posts/${pub}/comments`, { body: "Hi" })).status, 409, "needs a handle");
  assert.equal((await anon("POST", `/api/posts/${pub}/comments`, { body: "Hi" })).status, 401);

  const list = await anon("GET", `/api/public/posts/${pub}/comments`);
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].replies.length, 1);
  assert.equal(list.json[0].author.handle, "oli.soc");
  assert.equal(list.json[0].canDelete, false);
  assert.ok(!/s_oli|s_fay/.test(list.text), "no user ids");
  assert.equal((await anon("GET", `/api/public/posts/${fol}/comments`)).status, 404);
  assert.equal((await ana("GET", `/api/public/posts/${pub}/comments`)).json[0].canDelete, true, "post author may delete");
  assert.equal((await anon("GET", `/api/public/posts/${pub}`)).json.commentCount, 2);
});

test("deleting comments: yours, or any on your post", async () => {
  const extra = (await fay("POST", `/api/posts/${pub}/comments`, { body: "Mine" })).json;
  assert.equal((await oli("DELETE", `/api/comments/${extra.id}`)).status, 404, "not yours");
  assert.equal((await fay("DELETE", `/api/comments/${extra.id}`)).status, 204);
  assert.equal((await ana("DELETE", `/api/comments/${topId}`)).status, 204, "post author removes a thread");
  assert.equal((await anon("GET", `/api/public/posts/${pub}/comments`)).json.length, 0, "replies go with it");
});

test("saves are private and follow visibility", async () => {
  assert.deepEqual((await fay("PUT", `/api/posts/${fol}/save`)).json, { saved: true });
  assert.equal((await oli("PUT", `/api/posts/${fol}/save`)).status, 404);
  const saved = await fay("GET", "/api/saved");
  assert.deepEqual(saved.json.items.map((p: { id: number }) => p.id), [fol]);
  assert.equal(saved.json.items[0].savedByMe, true);
  assert.equal((await anon("GET", "/api/saved")).status, 401);
  // After unfollowing, the followers-only post drops out of Saved.
  assert.deepEqual((await fay("DELETE", "/api/follows/ana.soc")).json, { following: false, followers: 0 });
  assert.equal((await fay("GET", "/api/saved")).json.items.length, 0);
  await fay("PUT", "/api/follows/ana.soc");
  assert.equal((await fay("GET", "/api/saved")).json.items.length, 1);
});

test("blocking hides both people from each other and ends follows", async () => {
  await ben("PUT", "/api/follows/ana.soc");
  const c = await ben("POST", `/api/posts/${pub}/comments`, { body: "From Ben" });
  assert.equal(c.status, 201);
  assert.equal((await ana("PUT", "/api/blocks/ben.soc")).status, 204);
  assert.equal((await ana("PUT", "/api/blocks/ben.soc")).status, 204, "idempotent");
  assert.equal((await ana("PUT", "/api/blocks/ana.soc")).status, 400, "not yourself");
  assert.deepEqual((await ana("GET", "/api/blocks")).json.map((b: { handle: string }) => b.handle), ["ben.soc"]);
  assert.equal((await ben("GET", "/api/blocks")).json.length, 0);

  assert.equal((await ana("GET", `/api/public/posts/${pub}/comments`)).json.length, 0, "Ana no longer sees Ben's comment");
  assert.equal((await ana("GET", `/api/public/posts/${pub}`)).json.commentCount, 0);
  assert.equal((await oli("GET", `/api/public/posts/${pub}/comments`)).json.length, 1, "others still do");
  assert.equal((await ben("GET", "/api/public/profiles/ana.soc")).status, 404);
  assert.equal((await ben("PUT", `/api/posts/${pub}/like`)).status, 404);
  assert.equal((await ben("POST", `/api/posts/${pub}/comments`, { body: "x" })).status, 404);
  assert.equal((await ben("PUT", "/api/follows/ana.soc")).status, 404);
  assert.equal((await ana("GET", "/api/public/profiles/ana.soc")).json.stats.followers, 1, "Ben's follow ended");

  assert.equal((await ana("DELETE", "/api/blocks/ben.soc")).status, 204);
  assert.equal((await ana("GET", "/api/blocks")).json.length, 0);
  assert.equal((await ben("GET", "/api/public/profiles/ana.soc")).status, 200);
  await ana("PUT", "/api/blocks/ben.soc");
});

test("reports and admin review", async () => {
  const r = await oli("POST", "/api/reports", { targetKind: "post", targetId: String(pub), reason: "spam", details: "Ad" });
  assert.equal(r.status, 201, r.text);
  const again = await oli("POST", "/api/reports", { targetKind: "post", targetId: String(pub), reason: "spam" });
  assert.equal(again.json.id, r.json.id, "one open report per person and thing");
  assert.equal((await fay("POST", "/api/reports", { targetKind: "post", targetId: String(pub), reason: "harassment" })).status, 201);
  assert.equal((await oli("POST", "/api/reports", { targetKind: "post", targetId: String(fol), reason: "spam" })).status, 404, "can't report what you can't see");
  assert.equal((await ben("POST", "/api/reports", { targetKind: "profile", targetId: "ana.soc", reason: "spam" })).status, 404, "blocked");
  assert.equal((await nob("POST", "/api/reports", { targetKind: "post", targetId: String(pub), reason: "spam" })).status, 409);
  const prof = await oli("POST", "/api/reports", { targetKind: "profile", targetId: "ana.soc", reason: "other" });
  assert.equal(prof.status, 201);

  assert.equal((await oli("GET", "/api/admin/reports")).status, 403);
  assert.equal((await anon("GET", "/api/admin/reports")).status, 401);
  assert.equal((await oli("GET", "/api/profile")).json.isAdmin, false);
  assert.equal((await adm("GET", "/api/profile")).json.isAdmin, true);
  const open = await adm("GET", "/api/admin/reports");
  assert.equal(open.status, 200, open.text);
  const first = open.json.find((x: { id: number }) => x.id === r.json.id);
  assert.deepEqual(first.target, { authorHandle: "ana.soc", authorName: "ana", text: "Public post", imageUrl: null, link: `/posts/${pub}` });
  assert.equal(first.openReportsOnTarget, 2);
  assert.equal(first.reporter.handle, "oli.soc");

  assert.equal((await oli("POST", `/api/admin/reports/${r.json.id}/resolve`, { action: "remove" })).status, 403);
  assert.equal((await adm("POST", `/api/admin/reports/${prof.json.id}/resolve`, { action: "remove" })).status, 400, "profiles aren't removed");
  const removed = await adm("POST", `/api/admin/reports/${r.json.id}/resolve`, { action: "remove" });
  assert.equal(removed.status, 200, removed.text);
  assert.deepEqual([removed.json.status, removed.json.stillExists, removed.json.target.link], ["removed", false, null]);
  assert.equal((await anon("GET", `/api/public/posts/${pub}`)).status, 404, "post is gone");
  assert.equal((await adm("GET", "/api/admin/reports")).json.filter((x: { targetKind: string }) => x.targetKind === "post").length, 0, "Fay's report closed too");
  assert.equal((await adm("POST", `/api/admin/reports/${prof.json.id}/resolve`, { action: "dismiss" })).json.status, "dismissed");
  assert.equal((await adm("GET", "/api/admin/reports?status=removed")).json.length, 2);
});

test("module alone: likes, comments across blocks and admin checks hold without RLS", async () => {
  // Oli doesn't follow Ana: no liking her followers-only post.
  assert.equal(await withoutRls("s_oli", (tx) => setLike(tx, viewerFor("s_oli"), fol, true)), null);
  // Ben's comments are hidden from Ana without RLS: the module filters them and
  // also looks up authors through the block-aware profile view.
  await ownerSql(`INSERT INTO sewspace_comments (post_id, user_id, body) VALUES ($1, 's_ben', 'hidden from Ana')`, [quiet]);
  const forAna = await withoutRls("s_ana", (tx) => listComments(tx, viewerFor("s_ana"), quiet));
  assert.equal(forAna?.length, 0);
  const forOli = await withoutRls("s_oli", (tx) => listComments(tx, viewerFor("s_oli"), quiet));
  assert.equal(forOli?.length, 1);
  assert.equal(await withoutRls("s_oli", (tx) => listReports(tx, viewerFor("s_oli"))), null, "only admins list reports");
});
