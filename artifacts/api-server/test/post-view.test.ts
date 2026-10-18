import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

// The post view (Explore step 5): paged comments with replies, comment likes
// (private who, public numbers), "Liked by {someone you follow}". Nothing about
// a post or its comments reaches anyone who may not see the post, and nothing
// crosses a block.
const origin = await startApp();
const { listCommentsPage, setCommentLike, likedByFollowee, viewerFor } = await import("../src/access");
const { COMMENT_LIKES_PER_HOUR } = await import("../src/routes/social");
const ann = as(origin, "pv_ann"); // posts
const fen = as(origin, "pv_fen"); // follows Ann and Gus
const gus = as(origin, "pv_gus"); // comments, likes
const bo = as(origin, "pv_bo"); // blocked by Ann
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [fen, "fen"], [gus, "gus"], [bo, "bo"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.pv`, name: handle });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('pv_fen', 'pv_ann'), ('pv_fen', 'pv_gus')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('pv_ann', 'pv_bo')");

const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201 || r.status === 204, r.text);
  return r.json;
};
const post = async (caption: string, visibility = "public") =>
  ok(await ann("POST", "/api/posts", { kind: "status", caption, visibility })) as { id: number };
const page = (user: ReturnType<typeof as>, id: number, cursor = "") =>
  user("GET", `/api/public/posts/${id}/comments/page${cursor ? `?cursor=${cursor}` : ""}`);

const open = await post("Open to all");
const quiet = await post("Followers only", "followers");
const secret = await post("Just me", "private");

// 25 top-level comments (Gus 20, Fen 5), and two replies on the first.
for (let i = 1; i <= 25; i++) ok(await (i <= 20 ? gus : fen)("POST", `/api/posts/${open.id}/comments`, { body: `Comment ${i}` }));
const first = ok(await page(anon, open.id)).items[0] as { id: number };
ok(await ann("POST", `/api/posts/${open.id}/comments`, { body: "Thanks!", parentId: first.id }));
ok(await fen("POST", `/api/posts/${open.id}/comments`, { body: "Agreed", parentId: first.id }));
const quietComment = ok(await fen("POST", `/api/posts/${quiet.id}/comments`, { body: "Lovely" })) as { id: number };

test("comments come 20 at a time, oldest first, each with its replies", async () => {
  const one = ok(await page(anon, open.id));
  assert.equal(one.items.length, 20);
  assert.equal(one.items[0].body, "Comment 1");
  assert.deepEqual(one.items[0].replies.map((r: { body: string }) => r.body), ["Thanks!", "Agreed"]);
  assert.equal(one.total, 27, "comments and replies");
  assert.ok(one.nextCursor);
  const two = ok(await page(anon, open.id, one.nextCursor));
  assert.deepEqual(two.items.map((c: { body: string }) => c.body), ["Comment 21", "Comment 22", "Comment 23", "Comment 24", "Comment 25"]);
  assert.equal(two.nextCursor, null);
  assert.equal((await page(anon, open.id)).headers.get("cache-control"), null, "signed out, public: cacheable");
  assert.equal((await page(gus, open.id)).headers.get("cache-control"), "private, no-store", "signed in: never cached");
});

test("comments only on posts you may see", async () => {
  assert.equal((await page(anon, quiet.id)).status, 404, "signed out: no followers-only post");
  assert.equal((await page(gus, quiet.id)).status, 404, "not a follower");
  assert.equal(ok(await page(fen, quiet.id)).items.length, 1, "a follower sees them");
  for (const user of [anon, fen, gus]) assert.equal((await page(user, secret.id)).status, 404, "a private post: never");
  assert.equal((await page(bo, open.id)).status, 404, "nothing across a block");
});

test("comment likes: anyone sees the number, only you see your own like", async () => {
  const like = ok(await fen("PUT", `/api/comments/${first.id}/like`));
  assert.deepEqual(like, { liked: true, likeCount: 1 });
  ok(await fen("PUT", `/api/comments/${first.id}/like`)); // twice is still one
  const forGus = ok(await page(gus, open.id)).items[0];
  assert.deepEqual([forGus.likeCount, forGus.likedByMe], [1, false]);
  const forFen = ok(await page(fen, open.id)).items[0];
  assert.deepEqual([forFen.likeCount, forFen.likedByMe], [1, true]);
  assert.equal(ok(await page(anon, open.id)).items[0].likeCount, 1, "signed out sees the number");
  assert.equal(ok(await anon("GET", `/api/public/posts/${open.id}/comments`))[0].likeCount, 1, "the old list carries it too");
  assert.equal((await anon("PUT", `/api/comments/${first.id}/like`)).status, 401, "signed out can't like");
  assert.equal((await gus("PUT", `/api/comments/${quietComment.id}/like`)).status, 404, "not on a post you can't see");
  assert.equal((await bo("PUT", `/api/comments/${first.id}/like`)).status, 404, "not across a block");
  assert.equal((await gus("PUT", "/api/comments/999999/like")).status, 404);
  const [{ n }] = (await ownerSql("SELECT count(*)::int AS n FROM sewspace_comment_likes WHERE comment_id = $1", [first.id])).rows;
  assert.equal(n, 1);
  assert.deepEqual(ok(await fen("DELETE", `/api/comments/${first.id}/like`)), { liked: false, likeCount: 0 });
});

test("Liked by: the latest liker you follow, never someone hidden from you", async () => {
  ok(await gus("PUT", `/api/posts/${open.id}/like`));
  assert.equal(ok(await fen("GET", `/api/public/posts/${open.id}`)).likedBy?.handle, "gus.pv", "Fen follows Gus");
  assert.equal(ok(await gus("GET", `/api/public/posts/${open.id}`)).likedBy, null, "Gus follows nobody who liked it");
  assert.equal(ok(await anon("GET", `/api/public/posts/${open.id}`)).likedBy, null, "signed out: nobody");
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('pv_gus', 'pv_fen')");
  assert.equal(ok(await fen("GET", `/api/public/posts/${open.id}`)).likedBy, null, "not across a block");
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'pv_gus'");
});

test("module alone (RLS bypassed) keeps the same rules", async () => {
  assert.equal(await withoutRls(null, (tx) => listCommentsPage(tx, viewerFor(null), secret.id)), null, "private post");
  assert.equal(await withoutRls("pv_gus", (tx) => listCommentsPage(tx, viewerFor("pv_gus"), quiet.id)), null, "followers-only, not a follower");
  assert.equal(await withoutRls("pv_bo", (tx) => listCommentsPage(tx, viewerFor("pv_bo"), open.id)), null, "blocked");
  assert.equal(await withoutRls("pv_gus", (tx) => setCommentLike(tx, viewerFor("pv_gus"), quietComment.id, true)), null, "no like on a hidden post");
  assert.equal(await withoutRls("pv_bo", (tx) => setCommentLike(tx, viewerFor("pv_bo"), first.id, true)), null, "no like across a block");
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('pv_gus', 'pv_fen')");
  assert.equal(await withoutRls("pv_fen", (tx) => likedByFollowee(tx, viewerFor("pv_fen"), open.id)), null, "no liker across a block");
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'pv_gus'");
});

test("120 comment likes an hour", async () => {
  let last = 0;
  for (let i = 0; i < COMMENT_LIKES_PER_HOUR + 2 && last !== 429; i++) last = (await gus(i % 2 ? "DELETE" : "PUT", `/api/comments/${first.id}/like`)).status;
  assert.equal(last, 429);
});
