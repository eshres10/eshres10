import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects } from "./harness";

const dir = mkdtempSync(path.join(tmpdir(), "sewspace-posts-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Seams Club</title></head><body></body></html>`);
const origin = await startApp({ indexHtmlPath });

const pia = as(origin, "p_pia"); // author
const fay = as(origin, "p_fay"); // follows Pia
const oli = as(origin, "p_oli"); // another user, follows nobody
const ben = as(origin, "p_ben"); // follows Pia, but Pia blocked him
const anon = as(origin, null);

for (const [user, handle] of [[pia, "pia"], [fay, "fay"], [oli, "oli"], [ben, "ben"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.sews`, name: handle });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('p_fay', 'p_pia'), ('p_ben', 'p_pia')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('p_pia', 'p_ben')");

/** A camera-like JPEG: 3000x2000, rotated by EXIF, with GPS metadata. */
async function cameraJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#4a7a5c" } })
    .jpeg()
    .withExif({ IFD0: { Make: "PhoneCo", Model: "Snapper" }, IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "W" } })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** Uploads bytes like the browser would, then processes them into media. */
async function photo(user: ReturnType<typeof as>, bytes?: Buffer) {
  const up = await user("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" });
  assert.equal(up.status, 200, up.text);
  storedObjects.set(up.json.objectPath, { body: bytes ?? (await cameraJpeg()), contentType: "image/jpeg" });
  return user("POST", "/api/media", { objectPath: up.json.objectPath });
}

const m1 = (await photo(pia)).json;
const m2 = (await photo(pia)).json;
const make = (await pia("POST", "/api/projects", { name: "Linen shirt", visibility: "private" })).json;
const publicPost = (await pia("POST", "/api/posts", { kind: "photo", caption: "Finished my shirt!", visibility: "public", mediaIds: [m2.id, m1.id], projectId: make.id })).json;
const followersPost = (await pia("POST", "/api/posts", { kind: "status", caption: "Followers only thoughts", visibility: "followers" })).json;
const privatePost = (await pia("POST", "/api/posts", { kind: "status", caption: "Note to self", visibility: "private" })).json;

test("photos are resized to 1600 px WebP with a 400 px thumbnail and no EXIF or GPS", async () => {
  const res = await photo(pia);
  assert.equal(res.status, 201, res.text);
  assert.deepEqual([res.json.width, res.json.height], [1067, 1600], "EXIF rotation applied, longest side 1600");
  assert.match(res.json.color, /^#[0-9a-f]{6}$/);
  const full = storedObjects.get(res.json.url.replace("/api/storage", ""))!.body as Buffer;
  const thumb = storedObjects.get(res.json.thumbUrl.replace("/api/storage", ""))!.body as Buffer;
  const fullMeta = await sharp(full).metadata();
  const thumbMeta = await sharp(thumb).metadata();
  assert.equal(fullMeta.format, "webp");
  assert.equal(fullMeta.exif, undefined, "no EXIF (and so no GPS) on the stored image");
  assert.equal(thumbMeta.exif, undefined);
  assert.equal(Math.max(thumbMeta.width!, thumbMeta.height!), 400);
});

test("media can only be made from your own image uploads", async () => {
  const up = await pia("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" });
  storedObjects.set(up.json.objectPath, { body: await cameraJpeg(), contentType: "image/jpeg" });
  assert.equal((await fay("POST", "/api/media", { objectPath: up.json.objectPath })).status, 400, "someone else's upload");
  assert.equal((await photo(pia, Buffer.from("definitely not an image"))).status, 400, "not an image");
  const pdf = await pia("POST", "/api/storage/uploads/request-url", { name: "p.pdf", size: 1000, contentType: "application/pdf" });
  storedObjects.set(pdf.json.objectPath, { body: await cameraJpeg(), contentType: "application/pdf" });
  assert.equal((await pia("POST", "/api/media", { objectPath: pdf.json.objectPath })).status, 400, "pattern PDFs never become post photos");
  const pending = await pia("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" });
  assert.equal((await pia("POST", "/api/media", { objectPath: pending.json.objectPath })).status, 400, "upload not finished");
  assert.equal((await anon("POST", "/api/media", { objectPath: up.json.objectPath })).status, 401);
});

test("creating posts: photos keep their order; validation", async () => {
  assert.equal(publicPost.kind, "photo");
  assert.deepEqual(publicPost.media.map((m: { id: number }) => m.id), [m2.id, m1.id]);
  assert.equal(publicPost.author.handle, "pia.sews");
  assert.equal((await pia("POST", "/api/posts", { kind: "photo", caption: "no photos", visibility: "public", mediaIds: [] })).status, 400);
  assert.equal((await pia("POST", "/api/posts", { kind: "status", caption: "   ", visibility: "public" })).status, 400);
  assert.equal((await pia("POST", "/api/posts", { kind: "status", caption: "x", visibility: "public", mediaIds: [m1.id] })).status, 400);
  assert.equal((await pia("POST", "/api/posts", { kind: "photo", caption: "x", visibility: "public", mediaIds: Array.from({ length: 11 }, (_, i) => i + 1) })).status, 400);
  assert.equal((await fay("POST", "/api/posts", { kind: "photo", caption: "stolen", visibility: "public", mediaIds: [m1.id] })).status, 400, "someone else's photo");
  assert.equal((await fay("POST", "/api/posts", { kind: "status", caption: "x", visibility: "public", projectId: make.id })).status, 400, "someone else's make");
  assert.equal((await anon("POST", "/api/posts", { kind: "status", caption: "x", visibility: "public" })).status, 401);
  const noHandle = as(origin, "p_nohandle");
  assert.equal((await noHandle("POST", "/api/posts", { kind: "status", caption: "hi", visibility: "public" })).status, 409);
});

test("who can see each post", async () => {
  const sees = async (user: ReturnType<typeof as>, id: number) => (await user("GET", `/api/public/posts/${id}`)).status === 200;
  const table: Array<[string, ReturnType<typeof as>, boolean, boolean, boolean]> = [
    ["author", pia, true, true, true],
    ["follower", fay, true, true, false],
    ["other user", oli, true, false, false],
    ["signed out", anon, true, false, false],
    ["blocked", ben, false, false, false],
  ];
  for (const [who, user, pub, fol, prv] of table) {
    assert.deepEqual([await sees(user, publicPost.id), await sees(user, followersPost.id), await sees(user, privatePost.id)], [pub, fol, prv], who);
  }
});

test("post photos load exactly when the post is visible", async () => {
  const [full, thumb] = [publicPost.media[0].url, publicPost.media[0].thumbUrl];
  assert.equal((await anon("GET", full)).status, 200);
  assert.equal((await anon("GET", thumb)).status, 200);
  assert.equal((await ben("GET", full)).status, 404, "blocked");
  await pia("PATCH", `/api/posts/${publicPost.id}`, { visibility: "followers" });
  assert.equal((await anon("GET", full)).status, 404, "hidden once followers-only");
  assert.equal((await fay("GET", full)).status, 200, "followers still see it");
  await pia("PATCH", `/api/posts/${publicPost.id}`, { visibility: "public" });
  assert.equal((await anon("GET", thumb)).status, 200);
});

test("a tag shows only when the viewer may see the tagged make", async () => {
  assert.deepEqual((await pia("GET", `/api/public/posts/${publicPost.id}`)).json.tags.map((t: { kind: string }) => t.kind), ["make"]);
  assert.deepEqual((await anon("GET", `/api/public/posts/${publicPost.id}`)).json.tags, [], "private make stays hidden");
  await pia("PUT", `/api/visibility/project/${make.id}`, { visibility: "public" });
  assert.deepEqual((await anon("GET", `/api/public/posts/${publicPost.id}`)).json.tags, [{ kind: "make", id: make.id, name: "Linen shirt" }]);
});

test("home feed: people you follow plus yourself, newest first", async () => {
  const oliPost = (await oli("POST", "/api/posts", { kind: "status", caption: "Oli here", visibility: "public" })).json;
  const ids = async (user: ReturnType<typeof as>) => (await user("GET", "/api/feed")).json.items.map((p: { id: number }) => p.id);
  const fayFeed = await ids(fay);
  assert.ok(fayFeed.includes(publicPost.id) && fayFeed.includes(followersPost.id), "follower sees public + followers posts");
  assert.ok(!fayFeed.includes(privatePost.id) && !fayFeed.includes(oliPost.id), "not private posts, not people she doesn't follow");
  assert.ok((await ids(oli)).includes(oliPost.id), "your own posts are in your feed");
  assert.deepEqual(await ids(ben), [], "blocked: nothing from Pia");
  assert.equal((await anon("GET", "/api/feed")).status, 401);
  const createdAt = (await fay("GET", "/api/feed")).json.items.map((p: { createdAt: string }) => p.createdAt);
  assert.deepEqual(createdAt, [...createdAt].sort().reverse());
});

test("explore: public posts from everyone, works signed out, paginates, filters, respects blocks", async () => {
  for (let i = 0; i < 22; i++) await oli("POST", "/api/posts", { kind: "status", caption: `Oli ${i}`, visibility: "public" });
  const first = (await anon("GET", "/api/public/explore")).json;
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = (await anon("GET", `/api/public/explore?cursor=${first.nextCursor}`)).json;
  const all = [...first.items, ...second.items].map((p: { id: number }) => p.id);
  assert.equal(new Set(all).size, all.length, "no duplicates across pages");
  assert.ok(all.includes(publicPost.id));
  assert.ok(!all.includes(followersPost.id) && !all.includes(privatePost.id), "only public posts");
  const photos = (await anon("GET", "/api/public/explore?kind=photo")).json.items;
  assert.ok(photos.length >= 1 && photos.every((p: { kind: string }) => p.kind === "photo"));
  const makes = (await anon("GET", "/api/public/explore?kind=make")).json.items;
  assert.deepEqual(makes.map((p: { id: number }) => p.id), [publicPost.id]);
  const benSees = async () => {
    const ids: number[] = [];
    let cursor: string | null = "";
    while (cursor !== null) {
      const page = (await ben("GET", `/api/public/explore${cursor ? `?cursor=${cursor}` : ""}`)).json;
      ids.push(...page.items.map((p: { id: number }) => p.id));
      cursor = page.nextCursor;
    }
    return ids;
  };
  assert.ok(!(await benSees()).includes(publicPost.id), "blocked users don't see each other in explore");
});

test("only the author edits or deletes", async () => {
  assert.equal((await fay("PATCH", `/api/posts/${publicPost.id}`, { caption: "hacked" })).status, 404);
  assert.equal((await fay("DELETE", `/api/posts/${publicPost.id}`)).status, 404);
  const edited = await pia("PATCH", `/api/posts/${followersPost.id}`, { caption: "Edited thoughts" });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.json.caption, "Edited thoughts");
  const tmp = (await pia("POST", "/api/posts", { kind: "status", caption: "delete me", visibility: "public" })).json;
  assert.equal((await pia("DELETE", `/api/posts/${tmp.id}`)).status, 204);
  assert.equal((await anon("GET", `/api/public/posts/${tmp.id}`)).status, 404);
});

test("posting is rate limited", async () => {
  await ownerSql("INSERT INTO sewspace_posts (user_id, kind, caption, visibility) SELECT 'p_fay', 'status', 'spam ' || g, 'private' FROM generate_series(1, 30) g");
  const res = await fay("POST", "/api/posts", { kind: "status", caption: "one more", visibility: "public" });
  assert.equal(res.status, 429);
});

test("post pages get meta tags and public posts are in the sitemap", async () => {
  const page = await anon("GET", `/posts/${publicPost.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>pia on Seams Club: “Finished my shirt!”<\/title>/);
  assert.match(page.text, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/api\/storage\/objects\/media\//);
  assert.equal((await anon("GET", `/posts/${followersPost.id}`)).status, 404);
  const sitemap = (await anon("GET", "/sitemap.xml")).text;
  assert.match(sitemap, new RegExp(`/posts/${publicPost.id}</loc>`));
  assert.doesNotMatch(sitemap, new RegExp(`/posts/${followersPost.id}</loc>`));
});
