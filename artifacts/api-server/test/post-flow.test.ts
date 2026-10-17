import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects, withoutRls } from "./harness";

const { parseHashtags, tagPage, viewerFor } = await import("../src/access");

// Phase F1: the new post flow. Alt text, display shape, editing photos, and
// hashtags (parsing, counts that only use public posts, suggestions, the
// /tags page) for the author, a follower, others, signed out and blocked.
const dir = mkdtempSync(path.join(tmpdir(), "sewspace-postflow-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Sewspace</title><meta name="robots" content="index, follow" /></head><body></body></html>`);
const origin = await startApp({ indexHtmlPath });

const ann = as(origin, "t_ann"); // author
const fen = as(origin, "t_fen"); // follows Ann
const oak = as(origin, "t_oak"); // another person
const bo = as(origin, "t_bo"); // Ann blocked them
const anon = as(origin, null);

for (const [user, handle] of [[ann, "ann"], [fen, "fen"], [oak, "oak"], [bo, "bo"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.tags`, name: handle });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('t_fen', 't_ann')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('t_ann', 't_bo')");

async function photo(user: ReturnType<typeof as>) {
  const up = await user("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" });
  assert.equal(up.status, 200, up.text);
  storedObjects.set(up.json.objectPath, { body: await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#335577" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
  const res = await user("POST", "/api/media", { objectPath: up.json.objectPath });
  assert.equal(res.status, 201, res.text);
  return res.json as { id: number };
}
const post = async (user: ReturnType<typeof as>, caption: string, visibility = "public") => {
  const r = await user("POST", "/api/posts", { kind: "status", caption, visibility });
  assert.equal(r.status, 201, r.text);
  return r.json.id as number;
};

let photoPost = 0;
const [p1, p2, p3] = [await photo(ann), await photo(ann), await photo(ann)];

test("parsing hashtags", () => {
  assert.deepEqual(parseHashtags("Done! #Linen #linen #sewing_2026 and#not, a#b, &#39; url/#frag, #x" + "y".repeat(60) + " #ok."), ["linen", "sewing_2026", "ok"]);
});
test("creating a photo post with alt text, a shape and hashtags", async () => {
  const foreign = await photo(oak);
  assert.equal((await ann("POST", "/api/posts", { kind: "photo", caption: "x", visibility: "public", mediaIds: [p1.id], altTexts: [{ mediaId: foreign.id, text: "not mine" }] })).status, 400, "alt text only for this post's photos");
  assert.equal((await ann("POST", "/api/posts", { kind: "photo", caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "), visibility: "public", mediaIds: [p1.id] })).status, 400, "at most 30 hashtags");
  assert.equal((await ann("POST", "/api/posts", { kind: "photo", caption: "x", visibility: "public", mediaIds: [p1.id], aspect: "16:9" })).status, 400);
  const r = await ann("POST", "/api/posts", {
    kind: "photo", caption: "Sailor collar set is done! #SailorCollar #linen", visibility: "public", mediaIds: [p1.id, p2.id], aspect: "1:1",
    altTexts: [{ mediaId: p1.id, text: "Navy sailor collar top on a hanger" }],
  });
  assert.equal(r.status, 201, r.text);
  photoPost = r.json.id;
  assert.equal(r.json.aspect, "1:1");
  assert.deepEqual(r.json.media.map((m: { altText: string }) => m.altText), ["Navy sailor collar top on a hanger", ""]);
  const status = await ann("POST", "/api/posts", { kind: "status", caption: "No shape given", visibility: "public" });
  assert.equal(status.json.aspect, "4:5", "new posts default to 4:5");
  const tags = await ownerSql("SELECT h.tag FROM sewspace_post_hashtags ph JOIN sewspace_hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = $1 ORDER BY h.tag", [photoPost]);
  assert.deepEqual(tags.rows.map((t) => t.tag), ["linen", "sailorcollar"]);
});

test("editing a post: photos, order, alt text, shape, hashtags", async () => {
  const foreign = await photo(oak);
  assert.equal((await oak("PATCH", `/api/posts/${photoPost}`, { caption: "mine now" })).status, 404, "only the author edits");
  assert.equal((await ann("PATCH", `/api/posts/${photoPost}`, { mediaIds: [p1.id, foreign.id] })).status, 400, "only your own photos");
  assert.equal((await ann("PATCH", `/api/posts/${photoPost}`, { mediaIds: [] })).status, 400, "a photo post keeps at least one photo");
  assert.equal((await ann("PATCH", `/api/posts/${photoPost}`, { altTexts: [{ mediaId: p3.id, text: "not on the post yet" }] })).status, 400);
  const r = await ann("PATCH", `/api/posts/${photoPost}`, {
    caption: "Sailor collar set #linen #offcuts", mediaIds: [p3.id, p1.id], aspect: "original",
    altTexts: [{ mediaId: p3.id, text: "Knot bag" }],
  });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.media.map((m: { id: number }) => m.id), [p3.id, p1.id], "reordered, one removed, one added");
  assert.equal(r.json.media[0].altText, "Knot bag");
  assert.equal(r.json.aspect, "original");
  const tags = await ownerSql("SELECT h.tag FROM sewspace_post_hashtags ph JOIN sewspace_hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = $1 ORDER BY h.tag", [photoPost]);
  assert.deepEqual(tags.rows.map((t) => t.tag), ["linen", "offcuts"], "hashtags follow the new caption");
  const statusPost = await post(ann, "A status #wip");
  assert.equal((await ann("PATCH", `/api/posts/${statusPost}`, { caption: "  " })).status, 400, "a status can't be emptied");
  assert.equal((await ann("PATCH", `/api/posts/${statusPost}`, { mediaIds: [p2.id] })).status, 400, "a status has no photos");
});

test("hashtag counts use public posts only and respect blocks", async () => {
  await post(ann, "#linen followers-only", "followers");
  await post(ann, "#linen #secretlinen private", "private");
  await post(oak, "#linen from oak");
  await post(bo, "#linen from bo");
  const count = async (user: ReturnType<typeof as>) => (await user("GET", "/api/hashtags/suggest?q=lin")).json.find((t: { tag: string }) => t.tag === "linen")?.posts;
  assert.equal(await count(oak), 3, "Ann's public post, Oak's and Bo's");
  assert.equal(await count(fen), 3, "a follower's count ignores followers-only posts too");
  assert.equal(await count(ann), 2, "Ann: her private and followers-only posts aren't counted, nor Bo (blocked)");
  assert.equal(await count(bo), 2, "Bo doesn't count Ann's posts");
  const suggestions = (await ann("GET", "/api/hashtags/suggest?q=%23SEC")).json;
  assert.deepEqual(suggestions, [], "a tag only on private posts is never suggested, even to its author");
  assert.equal((await anon("GET", "/api/hashtags/suggest?q=lin")).status, 401);
  assert.deepEqual((await ann("GET", "/api/hashtags/suggest?q=no%20spaces")).json, []);
});

test("suggestions with no prefix come from the make, challenge and recent tags", async () => {
  const make = (await ann("POST", "/api/projects", { name: "Bayside Sailor Top", visibility: "private" })).json;
  const theirs = (await oak("POST", "/api/projects", { name: "Oak Secret", visibility: "private" })).json;
  await ownerSql(`INSERT INTO sewspace_challenges (slug, tag, title, starts_at, ends_at, created_by) VALUES ('sewfromyourstash', 'SewFromYourStash', 'Stash', now(), now() + interval '10 days', 't_oak')`);
  const r = await ann("GET", `/api/hashtags/suggest?projectId=${make.id}&challenge=SewFromYourStash`);
  assert.equal(r.status, 200, r.text);
  const tags = r.json.map((t: { tag: string }) => t.tag);
  assert.deepEqual(tags.slice(0, 2), ["baysidesailortop", "sewfromyourstash"]);
  assert.ok(tags.includes("offcuts"), "recent own tags");
  assert.ok(tags.length <= 6);
  const sneaky = (await ann("GET", `/api/hashtags/suggest?projectId=${theirs.id}`)).json.map((t: { tag: string }) => t.tag);
  assert.ok(!sneaky.includes("oaksecret"), "someone else's make name is never used");
});

test("tag pages: public posts only, blocks apply, works signed out", async () => {
  const handles = async (user: ReturnType<typeof as>) => {
    const r = await user("GET", "/api/public/tags/Linen");
    assert.equal(r.status, 200, r.text);
    return r.json.items.map((p: { author: { handle: string }; visibility: string }) => `${p.author.handle}:${p.visibility}`);
  };
  assert.deepEqual((await handles(anon)).sort(), ["ann.tags:public", "bo.tags:public", "oak.tags:public"]);
  assert.deepEqual((await handles(fen)).sort(), ["ann.tags:public", "bo.tags:public", "oak.tags:public"], "no followers-only posts, even for a follower");
  assert.deepEqual((await handles(ann)).sort(), ["ann.tags:public", "oak.tags:public"], "no private posts, even your own; blocked people hidden");
  assert.deepEqual((await handles(bo)).sort(), ["bo.tags:public", "oak.tags:public"]);
  assert.equal((await anon("GET", "/api/public/tags/linen")).json.posts, 3);
  assert.equal((await anon("GET", "/api/public/tags/secretlinen")).json.items.length, 0);
  assert.equal((await anon("GET", "/api/public/tags/not%20a%20tag")).status, 404);
});

test("module alone (RLS bypassed): tag pages still show public posts only", async () => {
  const page = await withoutRls("t_fen", (tx) => tagPage(tx, viewerFor("t_fen"), "linen"));
  assert.ok(page!.items.every((p) => p.visibility === "public"));
  const asAnn = await withoutRls("t_ann", (tx) => tagPage(tx, viewerFor("t_ann"), "linen"));
  assert.ok(!asAnn!.items.some((p) => p.author.handle === "bo.tags"), "blocked people hidden by the module too");
});

test("page HTML: /tags/:tag has meta; edit and new-topic pages are plain, private and noindex", async () => {
  const tag = await fetch(`${origin}/tags/linen`);
  const html = await tag.text();
  assert.equal(tag.status, 200);
  assert.match(html, /<title>#linen · Seams Club<\/title>/);
  assert.match(html, /3 public posts tagged #linen/);
  assert.equal((await fetch(`${origin}/tags/bad%20tag`)).status, 404);
  for (const p of [`/posts/${photoPost}/edit`, "/forum/new"]) {
    const res = await fetch(origin + p);
    const body = await res.text();
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get("cache-control"), "private, no-store", p);
    assert.match(body, /<meta name="robots" content="noindex, nofollow" \/>/, p);
    assert.equal((body.match(/name="robots"/g) ?? []).length, 1, `${p}: one robots tag`);
    assert.doesNotMatch(body, /og:title/, `${p}: no page meta`);
  }
  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  assert.match(sitemap, /\/tags\/linen</);
  assert.doesNotMatch(sitemap, /secretlinen/);
});
