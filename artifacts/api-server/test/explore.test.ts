import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects, withoutRls } from "./harness";

// Explore: the mixed browse page. Signed out sees public things only;
// followers-only posts reach followers; blocks hide both ways; things you hid
// stay hidden until you undo; filters use the post's own labels.
const origin = await startApp();
const { exploreCards, viewerFor } = await import("../src/access");
const ann = as(origin, "xp_ann"); // posts
const fen = as(origin, "xp_fen"); // follows Ann
const oak = as(origin, "xp_oak"); // someone else
const bo = as(origin, "xp_bo"); // blocked by Ann
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [fen, "fen"], [oak, "oak"], [bo, "bo"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.xp`, name: handle });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('xp_fen', 'xp_ann')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('xp_ann', 'xp_bo')");

const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
async function photoPost(user: ReturnType<typeof as>, caption: string, extra: Record<string, unknown> = {}) {
  const up = ok(await user("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" }));
  storedObjects.set(up.objectPath, { body: await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#335577" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
  const media = ok(await user("POST", "/api/media", { objectPath: up.objectPath }));
  return ok(await user("POST", "/api/posts", { kind: "photo", caption, visibility: "public", mediaIds: [media.id], ...extra })) as { id: number };
}
type Card = { type: string; key: string; post: { id: number; chip: string | null; photo: { width: number; height: number } } | null; [k: string]: any };
const cards = async (user: ReturnType<typeof as>, query = "") => ok(await user("GET", `/api/public/explore/cards${query}`)) as { items: Card[]; nextCursor: string | null; total: number };
const postIds = (page: { items: Card[] }) => page.items.filter((c) => c.type === "post").map((c) => c.post!.id);

const dress = await photoPost(ann, "Linen dress", { garment: "dresses" });
const followers = await photoPost(ann, "For my followers", { visibility: "followers", garment: "dresses" });
const secret = await photoPost(ann, "Just mine", { visibility: "private", garment: "dresses" });
const linen = await photoPost(oak, "Fabric haul! #thrifted", { fabric: "haul" });
const top = await photoPost(oak, "A boxy top", { garment: "tops" });
const words = ok(await ann("POST", "/api/posts", { kind: "status", caption: "Words only", visibility: "public" })) as { id: number };
const quietWords = ok(await ann("POST", "/api/posts", { kind: "status", caption: "Words for followers", visibility: "followers" })) as { id: number };

test("signed out: public photo and words posts only, with photo sizes, never cached as private", async () => {
  const r = await anon("GET", "/api/public/explore/cards");
  assert.equal(r.status, 200, r.text);
  assert.notEqual(r.headers.get("cache-control"), "private, no-store");
  const page = r.json;
  assert.deepEqual(postIds(page).sort(), [dress.id, linen.id, top.id, words.id].sort(), "no followers-only or private posts");
  assert.equal(page.total, 4);
  assert.equal(page.items.find((c: Card) => c.post?.id === words.id).post.photo, null, "a words card has no photo");
  const card = page.items.find((c: Card) => c.post?.id === dress.id);
  assert.deepEqual([card.post.photo.width, card.post.photo.height], [800, 1000], "real size, so the grid can hold the space");
});

test("followers-only reaches followers; private never; blocks hide both ways", async () => {
  const fens = postIds(await cards(fen));
  assert.ok(fens.includes(followers.id) && !fens.includes(secret.id), "a follower sees followers-only, not private");
  const oaks = postIds(await cards(oak));
  assert.ok(!oaks.includes(followers.id) && !oaks.includes(secret.id), "others see neither");
  const bos = postIds(await cards(bo));
  assert.ok(!bos.includes(dress.id), "blocked: nothing of Ann's, even public");
  const r = await fen("GET", "/api/public/explore/cards");
  assert.equal(r.headers.get("cache-control"), "private, no-store", "signed in: never cached");
});

test("Photos: photo posts only, never words posts", async () => {
  assert.deepEqual(postIds(await cards(anon, "?sub=photos")).sort(), [dress.id, linen.id, top.id].sort(), "signed out: public photo posts");
  const fens = postIds(await cards(fen, "?sub=photos"));
  assert.ok(!fens.includes(words.id) && !fens.includes(quietWords.id), "no words posts");
  assert.deepEqual(postIds(await cards(bo, "?sub=photos")).filter((id) => id === dress.id), [], "nothing across a block");
  assert.deepEqual(postIds(await cards(anon, "?tab=patterns&sub=photos")), [], "Patterns has no Photos filter");
});

test("Words: status posts only, by the same visibility rules", async () => {
  assert.deepEqual(postIds(await cards(anon, "?sub=words")), [words.id], "signed out: public words posts");
  assert.deepEqual(postIds(await cards(fen, "?sub=words")).sort(), [words.id, quietWords.id].sort(), "a follower also gets followers-only words");
  assert.deepEqual(postIds(await cards(oak, "?sub=words")), [words.id]);
  assert.deepEqual(postIds(await cards(bo, "?sub=words")), [], "nothing across a block");
  assert.ok(postIds(await cards(fen)).includes(quietWords.id), "For you mixes them in");
  assert.deepEqual(postIds(await cards(anon, "?tab=patterns&sub=words")), [], "Patterns has no Words filter (falls back to For you: pattern pages only)");
});

test("filters use the post's labels; Upcycle uses the hashtags; Fabric shows fabric posts", async () => {
  assert.deepEqual(postIds(await cards(anon, "?sub=dresses")), [dress.id]);
  assert.deepEqual(postIds(await cards(anon, "?sub=tops")), [top.id]);
  assert.deepEqual(postIds(await cards(anon, "?sub=upcycle")), [linen.id], "#thrifted counts as upcycle");
  const fabric = await cards(anon, "?tab=fabric");
  assert.deepEqual(postIds(fabric), [linen.id]);
  assert.equal(fabric.items[0].post!.chip, null, "the fabric label is never shown");
  assert.deepEqual(postIds(await cards(anon, "?tab=fabric&sub=hauls")), [linen.id]);
  assert.deepEqual(postIds(await cards(anon, "?tab=fabric&sub=linen")), []);
  assert.deepEqual(postIds(await cards(anon, "?sub=nonsense")).length, 4, "an unknown filter means the first one (photo and words posts)");
  assert.equal((await anon("PATCH", `/api/posts/${dress.id}`, { garment: "hats" })).status, 401);
  assert.equal((await ann("PATCH", `/api/posts/${dress.id}`, { garment: "hats" })).status, 400, "only the fixed garments");
});

test("hidden things stay hidden for you only; undo brings them back", async () => {
  await ownerSql("INSERT INTO sewspace_discover_feedback (user_id, item_type, item_id, kind) VALUES ('xp_oak', 'post', $1, 'see_less')", [dress.id]);
  assert.ok(!postIds(await cards(oak)).includes(dress.id), "hidden for Oak, after a refresh too");
  assert.ok(postIds(await cards(fen)).includes(dress.id), "not for anyone else");
  await ownerSql("DELETE FROM sewspace_discover_feedback WHERE user_id = 'xp_oak'");
  assert.ok(postIds(await cards(oak)).includes(dress.id), "undo");
});

test("For you lifts people you follow", async () => {
  const fresh = await photoPost(oak, "Newest of all", { garment: "tops" });
  const fens = postIds(await cards(fen));
  assert.equal(fens[0], quietWords.id, "Ann's posts (her newest, a words post) come first for her follower, even though Oak posted later");
  assert.ok(fens.indexOf(followers.id) < fens.indexOf(fresh.id), "her photo posts too");
  assert.equal(postIds(await cards(anon))[0], fresh.id, "signed out: newest first");
});

test("patterns, challenges and threads", async () => {
  const skirt = ok(await ann("POST", "/api/catalog", { kind: "pattern", name: "Tiered Skirt", maker: "Linden", category: "skirts", source: "free" }));
  ok(await ann("POST", "/api/catalog", { kind: "pattern", name: "Box Tee", maker: "Northside", category: "tops", priceCents: 1600, currency: "AUD" }));
  const pats = await cards(anon, "?tab=patterns&sub=bottoms");
  assert.deepEqual(pats.items.map((c) => c.pattern.name), ["Tiered Skirt"], "Bottoms = trousers and skirts");
  assert.equal(pats.items[0].pattern.free, true);
  assert.equal((await cards(anon, "?tab=patterns")).total, 2);
  assert.equal((await cards(anon, "?tab=patterns&sub=upcycle")).total, 0, "no pattern category for upcycle");
  assert.ok(skirt.id);

  const now = Date.now(), day = 86400_000;
  const start = async (tag: string, from: number, to: number) => ok(await ann("POST", "/api/challenges", { tag, title: tag, description: "", rules: "", startsAt: new Date(now + from).toISOString(), endsAt: new Date(now + to).toISOString() }));
  await start("XpSoon", 5 * day, 9 * day);
  await start("XpRunning", -3600_000, 3 * day);
  const run = await cards(anon, "?tab=challenges");
  assert.deepEqual(run.items.map((c) => c.challenge.slug), ["xprunning", "xpsoon"], "running now, then starting soon");
  assert.deepEqual((await cards(anon, "?tab=challenges&sub=soon")).items.map((c) => c.challenge.slug), ["xpsoon"]);
  ok(await ann("POST", "/api/challenges/xprunning/entries", { postId: dress.id }));
  const withCover = await cards(anon, "?tab=challenges&sub=running");
  assert.equal(withCover.items[0].challenge.cover.width, 800, "the entry photo is the cover");
  assert.equal((await cards(bo, "?tab=challenges")).total, 0, "nothing across a block with the host");

  ok(await oak("POST", "/api/forum/topics", { board: "fitting", kind: "question", title: "Gaping back neckline?", body: "Every top stands away at the back." }));
  ok(await oak("POST", "/api/forum/topics", { board: "patterns", kind: "question", title: "Wren Wrap tie?", body: "Step 9." }));
  assert.deepEqual((await cards(anon, "?tab=forum&sub=pattern-help")).items.map((c) => c.thread.title), ["Wren Wrap tie?"]);
  assert.equal((await cards(anon, "?tab=forum")).total, 2);
});

test("30 a page, no repeats", async () => {
  // Straight into the database: the API allows 30 posts an hour.
  await ownerSql(`WITH p AS (
      INSERT INTO sewspace_posts (user_id, kind, caption, visibility) SELECT 'xp_oak', 'photo', 'Page ' || g, 'public' FROM generate_series(1, 31) g RETURNING id)
    INSERT INTO sewspace_post_media (post_id, media_id, user_id, position)
      SELECT p.id, (SELECT media_id FROM sewspace_post_media WHERE post_id = $1), 'xp_oak', 0 FROM p`, [top.id]);
  const first = await cards(anon);
  assert.equal(first.items.length, 30);
  assert.ok(first.nextCursor);
  const second = await cards(anon, `?cursor=${first.nextCursor}`);
  const all = [...postIds(first), ...postIds(second)];
  assert.equal(new Set(all).size, all.length, "no repeats");
  assert.equal(all.length, first.total);
});

test("module alone (RLS bypassed) keeps the same rules", async () => {
  const out = await withoutRls(null, (tx) => exploreCards(tx, viewerFor(null)));
  const ids = out.items.filter((c) => c.post).map((c) => c.post!.id);
  assert.ok(!ids.includes(followers.id) && !ids.includes(secret.id), "signed out: public only");
  const oaks = await withoutRls("xp_oak", (tx) => exploreCards(tx, viewerFor("xp_oak"), "explore", "dresses"));
  assert.ok(!oaks.items.some((c) => c.post?.id === secret.id || c.post?.id === followers.id), "others: no private or followers-only");
  const bos = await withoutRls("xp_bo", (tx) => exploreCards(tx, viewerFor("xp_bo")));
  assert.ok(!bos.items.some((c) => c.post?.id === dress.id), "blocked: nothing of Ann's");
});
