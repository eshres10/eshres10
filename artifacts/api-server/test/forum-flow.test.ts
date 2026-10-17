import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects, withoutRls } from "./harness";

const { canReadObject, viewerFor } = await import("../src/access");

// Phase F4: the forum flow. Show & tell photos belong to the topic (shared to
// the feed or not) and follow it: everyone sees them except across a block.
// Polls count only filled options, and topics take at most 5 tags.
const origin = await startApp();
const ann = as(origin, "f4_ann");
const ben = as(origin, "f4_ben");
const blk = as(origin, "f4_blk"); // Ann blocked them
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [ben, "ben"], [blk, "blk"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.f4`, name: handle });
}
await ownerSql("INSERT INTO sewspace_blocks VALUES ('f4_ann', 'f4_blk')");

async function photo(user: ReturnType<typeof as>) {
  const up = await user("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" });
  storedObjects.set(up.json.objectPath, { body: await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#5f8c6e" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
  const res = await user("POST", "/api/media", { objectPath: up.json.objectPath });
  assert.equal(res.status, 201, res.text);
  return res.json as { id: number; url: string; thumbUrl: string };
}
const show = { board: "fitting", kind: "show_tell", title: "My first Willa Dress", body: "Graded 12 to 14." };
const one = await photo(ann), two = await photo(ann), bens = await photo(ben);

test("show & tell needs a photo of your own", async () => {
  const none = await ann("POST", "/api/forum/topics", { ...show, shareToFeed: true });
  assert.equal(none.status, 400);
  assert.equal(none.json.error, "Show & tell needs at least one photo.");
  assert.equal((await ann("POST", "/api/forum/topics", { ...show, mediaIds: [bens.id] })).status, 400, "someone else's photo");
  assert.equal((await ann("POST", "/api/forum/topics", { board: "fitting", kind: "question", title: "Photos on a question?", mediaIds: [one.id] })).status, 400, "photos only on show & tell");
});

test("photos follow the topic, shared to the feed or not", async () => {
  const quiet = await ann("POST", "/api/forum/topics", { ...show, shareToFeed: false, mediaIds: [two.id, one.id] });
  assert.equal(quiet.status, 201, quiet.text);
  assert.equal(quiet.json.post, null, "not on the feed");
  assert.deepEqual(quiet.json.photos.map((p: { id: number }) => p.id), [two.id, one.id], "in the order given");

  const shared = await ann("POST", "/api/forum/topics", { ...show, title: "Willa, shared", shareToFeed: true, mediaIds: [one.id] });
  assert.equal(shared.status, 201, shared.text);
  assert.equal(shared.json.post.media[0].id, one.id, "the feed post has the same photo");

  const seen = (await anon("GET", `/api/public/forum/topics/${quiet.json.id}`)).json;
  assert.equal(seen.photos.length, 2, "signed out sees the photos");
  assert.equal((await anon("GET", two.thumbUrl)).status, 200, "and the files");
  assert.equal((await ben("GET", two.url)).status, 200);
  const list = (await anon("GET", "/api/public/forum/topics?filter=show_tell")).json.items;
  assert.equal(list.find((t: { id: number }) => t.id === quiet.json.id).photos.length, 2, "cards carry the photos");

  assert.equal((await blk("GET", `/api/public/forum/topics/${quiet.json.id}`)).status, 404, "blocked: no topic");
  assert.equal((await blk("GET", two.url)).status, 404, "blocked: no file");

  // Each layer on its own: the access module with RLS bypassed.
  const path = two.url.replace(/^\/api\/storage/, "");
  const read = (user: string | null) => withoutRls(user, (tx) => canReadObject(tx, viewerFor(user), path));
  assert.equal(await read(null), true);
  assert.equal(await read("f4_ben"), true);
  assert.equal(await read("f4_blk"), false, "the access layer hides it across a block too");

  await ann("DELETE", `/api/forum/topics/${quiet.json.id}`);
  assert.equal((await ben("GET", two.url)).status, 404, "deleting the topic makes its photos private again");
});

test("polls count filled options; at most 5 tags", async () => {
  const poll = { board: "patterns", kind: "poll", title: "Which collar for the sailor top?" };
  const r = await ann("POST", "/api/forum/topics", { ...poll, pollOptions: ["Sailor collar", "", "  "] });
  assert.equal(r.status, 400, "one filled option is not a poll");
  assert.equal((await ann("POST", "/api/forum/topics", { ...poll, pollOptions: ["Sailor collar", "Peter Pan", ""] })).status, 201);
  assert.equal((await ann("POST", "/api/forum/topics", { board: "fabric", kind: "info", title: "Tags", tags: ["a1", "b2", "c3", "d4", "e5", "f6"] })).status, 400, "six tags");
  const ok = await ann("POST", "/api/forum/topics", { board: "fabric", kind: "info", title: "Tags", tags: ["Willa Dress", "linen", "#fit"] });
  assert.deepEqual(ok.json.tags, ["willa-dress", "linen", "fit"]);
});

test("Already asked? matches questions by shared title words, minus blocks", async () => {
  await ann("POST", "/api/forum/topics", { board: "fitting", kind: "question", title: "Which interfacing for a linen collar?" });
  await blk("POST", "/api/forum/topics", { board: "fitting", kind: "question", title: "Interfacing a shirt collar" });
  await ben("POST", "/api/forum/topics", { board: "fabric", kind: "info", title: "Interfacing collar linen guide" });
  const similar = async (user: ReturnType<typeof as>, q: string) =>
    (await user("GET", `/api/public/forum/similar?q=${encodeURIComponent(q)}`)).json.map((t: { title: string }) => t.title);
  assert.deepEqual((await similar(ben, "What interfacing for my collar?")).sort(), ["Interfacing a shirt collar", "Which interfacing for a linen collar?"], "questions only");
  assert.deepEqual(await similar(ben, "Which interfacing for a linen collar?"), ["Which interfacing for a linen collar?", "Interfacing a shirt collar"], "most shared words first");
  assert.deepEqual(await similar(ann, "What interfacing for my collar?"), ["Which interfacing for a linen collar?"], "not across a block");
  assert.deepEqual(await similar(anon, "the and for"), [], "small words don't count");
  assert.deepEqual(await similar(anon, "interfacing 100%_"), [], "one shared word of two isn't enough; wildcards are literal");
});
