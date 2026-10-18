import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects, withoutRls } from "./harness";

// Explore step 4: collections and Hide / More like this are private to their
// owner, only take things you can see, and keep the Saved page in step.
const origin = await startApp();
const { addToCollection, listCollections, sendFeedback, viewerFor } = await import("../src/access");
const { EXPLORE_WRITES_PER_HOUR } = await import("../src/routes/collections");
const ann = as(origin, "co_ann"); // posts
const ben = as(origin, "co_ben"); // saves
const cy = as(origin, "co_cy"); // someone else
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [ben, "ben"], [cy, "cy"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.co`, name: handle });
}
const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201 || r.status === 204, r.text);
  return r.json;
};
async function photoPost(user: ReturnType<typeof as>, caption: string, visibility = "public") {
  const up = ok(await user("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" }));
  storedObjects.set(up.objectPath, { body: await sharp({ create: { width: 600, height: 900, channels: 3, background: "#775533" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
  const media = ok(await user("POST", "/api/media", { objectPath: up.objectPath }));
  return ok(await user("POST", "/api/posts", { kind: "photo", caption, visibility, mediaIds: [media.id], garment: "dresses" })) as { id: number };
}
const cards = async (user: ReturnType<typeof as>, q = "") => ok(await user("GET", `/api/public/explore/cards${q}`)).items as Array<{ type: string; itemId: number; saved: boolean }>;

const dress = await photoPost(ann, "Linen dress");
const followersOnly = await photoPost(ann, "Followers only", "followers");
const secret = await photoPost(ann, "Private", "private");

test("signed out: nothing", async () => {
  assert.equal((await anon("GET", "/api/collections")).status, 401);
  assert.equal((await anon("POST", "/api/collections", { name: "Mine" })).status, 401);
  assert.equal((await anon("POST", "/api/explore/feedback", { type: "post", id: dress.id, kind: "see_less" })).status, 401);
});

test("collections: private, named once, never anyone else's", async () => {
  const r = await ben("POST", "/api/collections", { name: "Quick saves" });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("cache-control"), null);
  const again = await ben("POST", "/api/collections", { name: "  quick   SAVES " });
  assert.equal(again.status, 200, "same name (any case) is the same collection");
  assert.equal(again.json.id, r.json.id);
  assert.equal((await ben("POST", "/api/collections", { name: "" })).status, 400);
  assert.equal((await ben("POST", "/api/collections", { name: "x".repeat(41) })).status, 400);
  const list = await ben("GET", "/api/collections");
  assert.equal(list.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(list.json.map((c: { name: string }) => c.name), ["Quick saves"]);
  assert.deepEqual(ok(await cy("GET", "/api/collections")), [], "nobody else sees them");
  assert.equal((await cy("POST", `/api/collections/${r.json.id}/items`, { type: "post", id: dress.id })).status, 404, "or adds to them");
});

test("saving: only things you can see; the Saved page and badge follow", async () => {
  const [quick] = ok(await ben("GET", "/api/collections"));
  const saved = ok(await ben("POST", `/api/collections/${quick.id}/items`, { type: "post", id: dress.id }));
  assert.equal(saved.count, 1);
  assert.ok(saved.coverUrl, "the post's photo is the cover");
  assert.equal((await ben("POST", `/api/collections/${quick.id}/items`, { type: "post", id: secret.id })).status, 404, "not a private post");
  assert.equal((await ben("POST", `/api/collections/${quick.id}/items`, { type: "post", id: followersOnly.id })).status, 404, "not followers-only unless you follow");
  assert.equal((await ben("POST", `/api/collections/${quick.id}/items`, { type: "post", id: 999999 })).status, 404);
  assert.ok(ok(await ben("GET", "/api/saved")).items.some((p: { id: number }) => p.id === dress.id), "on the Saved page too");
  assert.ok((await cards(ben)).find((c) => c.itemId === dress.id)!.saved, "Saved badge for Ben");
  assert.ok(!(await cards(cy)).find((c) => c.itemId === dress.id)!.saved, "not for anyone else");

  const page = ok(await ann("POST", "/api/catalog", { kind: "pattern", name: "Wren Wrap", maker: "Fern", category: "tops" }));
  ok(await ben("POST", `/api/collections/${quick.id}/items`, { type: "pattern", id: page.id }));
  assert.equal(ok(await ben("GET", `/api/catalog/${page.id}/me`)).saved, true, "a saved pattern page is hearted");

  // When Ann makes the post private, it stops counting for Ben.
  ok(await ann("PATCH", `/api/posts/${dress.id}`, { visibility: "private" }));
  assert.equal(ok(await ben("GET", "/api/collections"))[0].count, 1, "only the pattern still counts");
  ok(await ann("PATCH", `/api/posts/${dress.id}`, { visibility: "public" }));

  assert.equal((await ben("DELETE", `/api/collections/${quick.id}/items?type=post&itemId=${dress.id}`)).status, 204);
  assert.ok(!ok(await ben("GET", "/api/saved")).items.some((p: { id: number }) => p.id === dress.id), "out of its last collection: unsaved");
  assert.equal((await cy("DELETE", `/api/collections/${quick.id}/items?type=pattern&itemId=${page.id}`)).status, 404, "nobody else can take things out");
});

test("Hide stays hidden for you only, Undo brings it back; nothing you can't see", async () => {
  ok(await ben("POST", "/api/explore/feedback", { type: "post", id: dress.id, kind: "see_less" }));
  assert.ok(!(await cards(ben)).some((c) => c.itemId === dress.id), "gone after a refresh");
  assert.ok((await cards(cy)).some((c) => c.itemId === dress.id), "still there for others");
  ok(await ben("DELETE", `/api/explore/feedback?type=post&itemId=${dress.id}&kind=see_less`));
  assert.ok((await cards(ben)).some((c) => c.itemId === dress.id), "undo");
  assert.equal((await ben("POST", "/api/explore/feedback", { type: "post", id: secret.id, kind: "more_like" })).status, 404);
  ok(await ben("POST", "/api/explore/feedback", { type: "post", id: dress.id, kind: "more_like" }));
  const [{ n }] = (await ownerSql("SELECT count(*)::int AS n FROM sewspace_discover_feedback WHERE user_id = 'co_ben'")).rows;
  assert.equal(n, 1);
});

test("module alone (RLS bypassed) lists only your own collections", async () => {
  ok(await cy("POST", "/api/collections", { name: "Cy's" }));
  const mine = await withoutRls("co_ben", (tx) => listCollections(tx, viewerFor("co_ben")));
  assert.deepEqual(mine.map((c) => c.name), ["Quick saves"]);
  const ben_ = viewerFor("co_ben");
  assert.equal(await withoutRls("co_ben", (tx) => addToCollection(tx, ben_, mine[0].id, "post", secret.id)), null, "no private posts");
  assert.equal(await withoutRls("co_ben", (tx) => addToCollection(tx, ben_, mine[0].id, "post", followersOnly.id)), null, "no followers-only posts");
  assert.equal(await withoutRls("co_ben", (tx) => sendFeedback(tx, ben_, "post", secret.id, "see_less")), false);
  const cys = await withoutRls("co_cy", (tx) => listCollections(tx, viewerFor("co_cy")));
  assert.equal(await withoutRls("co_ben", (tx) => addToCollection(tx, ben_, cys[0].id, "post", dress.id)), null, "not someone else's collection");
  const [{ n }] = (await ownerSql(`SELECT count(*)::int AS n FROM sewspace_collection_items WHERE collection_id = ${cys[0].id}`)).rows;
  assert.equal(n, 0);
});

test("120 writes an hour", async () => {
  let last = 0;
  for (let i = 0; i < EXPLORE_WRITES_PER_HOUR + 2 && last !== 429; i++) last = (await cy("POST", "/api/collections", { name: `C${i % 3}` })).status;
  assert.equal(last, 429);
});
