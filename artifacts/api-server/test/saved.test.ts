import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects, withoutRls } from "./harness";

// Saved page: All posts (saves, hearts, everything in a collection) and your
// collections with counts and covers. Private to you; only things you can
// still see.
const origin = await startApp();
const { savedOverview, viewerFor } = await import("../src/access");
const ann = as(origin, "sv_ann"); // posts
const ben = as(origin, "sv_ben"); // saves
const cy = as(origin, "sv_cy"); // someone else
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [ben, "ben"], [cy, "cy"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.sv`, name: handle });
}
const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201 || r.status === 204, r.text);
  return r.json;
};
async function photoPost(user: ReturnType<typeof as>, caption: string) {
  const up = ok(await user("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" }));
  storedObjects.set(up.objectPath, { body: await sharp({ create: { width: 600, height: 900, channels: 3, background: "#775533" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
  const media = ok(await user("POST", "/api/media", { objectPath: up.objectPath }));
  return ok(await user("POST", "/api/posts", { kind: "photo", caption, visibility: "public", mediaIds: [media.id] })) as { id: number };
}

const dress = await photoPost(ann, "Linen dress");
const top = await photoPost(ann, "Wrap top");
const words = ok(await ann("POST", "/api/posts", { kind: "status", caption: "Pre-wash linen?", visibility: "public", cardColor: "blue" })) as { id: number };
ok(await ben("PUT", `/api/posts/${dress.id}/save`));
const summer = ok(await ben("POST", "/api/collections", { name: "Summer makes" })) as { id: number };
ok(await ben("POST", `/api/collections/${summer.id}/items`, { type: "post", id: top.id }));
ok(await ben("POST", `/api/collections/${summer.id}/items`, { type: "post", id: words.id }));
const overview = (user: ReturnType<typeof as>) => user("GET", "/api/saved/overview");

test("signed out: nothing; signed in: only your own, never cached", async () => {
  assert.equal((await overview(anon)).status, 401);
  const r = await overview(ben);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(ok(await overview(cy)), { total: 0, all: { count: 0, covers: [] }, collections: [] }, "Cy sees nothing of Ben's");
});

test("All posts holds saves and everything in collections; collections carry counts and covers", async () => {
  const o = ok(await overview(ben));
  assert.equal(o.total, 3);
  assert.deepEqual(o.all.covers.map((c: { id: number }) => c.id), [words.id, top.id, dress.id], "newest first");
  assert.equal(o.collections.length, 1);
  assert.deepEqual([o.collections[0].name, o.collections[0].count], ["Summer makes", 2]);
  const [w, t] = o.collections[0].covers;
  assert.deepEqual([w.type, w.cardColor, w.imageUrl, w.href], ["post", "blue", null, `/posts/${words.id}`], "a words post: its card colour, no photo");
  assert.ok(t.imageUrl && t.width > 0, "a photo post: the thumbnail with its size");
});

test("something made private drops out of All posts, counts and covers", async () => {
  await ownerSql("UPDATE sewspace_posts SET visibility = 'private' WHERE id = $1", [top.id]);
  const o = ok(await overview(ben));
  assert.equal(o.total, 2);
  assert.ok(!o.all.covers.some((c: { id: number }) => c.id === top.id));
  assert.deepEqual([o.collections[0].count, o.collections[0].covers.length], [1, 1]);
  const alone = await withoutRls("sv_ben", (tx) => savedOverview(tx, viewerFor("sv_ben")));
  assert.equal(alone.total, 2, "the module alone keeps the same rule");
  await ownerSql("UPDATE sewspace_posts SET visibility = 'public' WHERE id = $1", [top.id]);
});

test("nothing across a block", async () => {
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('sv_ann', 'sv_ben')");
  const o = ok(await overview(ben));
  assert.deepEqual([o.total, o.collections[0].count], [0, 0]);
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'sv_ann'");
});
