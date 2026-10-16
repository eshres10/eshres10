import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { as, ownerSql, startApp } from "./harness";

const dir = mkdtempSync(path.join(tmpdir(), "sewspace-vis-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Sewspace</title></head><body><div id="root"></div></body></html>`);
const origin = await startApp({ indexHtmlPath });

const ann = as(origin, "v_ann"); // owner
const fred = as(origin, "v_fred"); // follows Ann
const sam = as(origin, "v_sam"); // another signed-in user
const bob = as(origin, "v_bob"); // follows Ann but Ann blocked him
const anon = as(origin, null);

async function upload(user: ReturnType<typeof as>, body: Record<string, unknown> = {}) {
  const res = await user("POST", "/api/storage/uploads/request-url", { name: "f.webp", size: 1000, contentType: "image/webp", ...body });
  assert.equal(res.status, 200, res.text);
  return `/api/storage${res.json.objectPath}`;
}

// Ann's studio: a public make linking a public pattern (with a PDF), a
// followers-only fabric, private thread and her measurements.
await ann("PATCH", "/api/profile", { handle: "v.ann", name: "Ann" });
const pdf = await upload(ann, { name: "p.pdf", contentType: "application/pdf", purpose: "pattern_pdf" });
const cover = await upload(ann);
const photo = await upload(ann);
const fabricImage = await upload(ann);
const pattern = (await ann("POST", "/api/patterns", { name: "Wrap", garmentType: "Dress", difficulty: "Beginner", pdfUrl: pdf, visibility: "public" })).json;
const fabric = (await ann("POST", "/api/fabrics", { name: "Linen", type: "Linen", color: "green", imageUrl: fabricImage, visibility: "followers" })).json;
const thread = (await ann("POST", "/api/threads", { brand: "G", color: "#000", colorName: "Black", type: "Poly" })).json;
const measurements = (await ann("POST", "/api/measurement-profiles", { name: "Me", recordedAt: "2026-01-01", measurements: { bust: 90 } })).json;
const make = (await ann("POST", "/api/projects", {
  name: "Linen wrap dress", size: "12", alterations: "FBA +2 cm", coverImageUrl: cover, visibility: "public",
  patternId: pattern.id, fabricId: fabric.id, threadId: thread.id, measurementProfileId: measurements.id,
})).json;
await ann("POST", `/api/projects/${make.id}/photos`, { url: photo });
const draft = (await ann("POST", "/api/projects", { name: "Secret toile" })).json;
const forFollowers = (await ann("POST", "/api/projects", { name: "Followers jacket", visibility: "followers" })).json;
await ownerSql("INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('v_fred', 'v_ann'), ('v_bob', 'v_ann')");
await ownerSql("INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES ('v_ann', 'v_bob')");

test("new items are private by default; created items report visibility", async () => {
  assert.equal(thread.visibility, "private");
  assert.equal(draft.visibility, "private");
  assert.equal(draft.publishedAt, null);
  assert.equal(make.visibility, "public");
  assert.ok(make.publishedAt, "sharing a make records when it was published");
});

test("public make: readable by everyone except blocked users; never leaks measurements or PDFs", async () => {
  for (const [who, user] of [["owner", ann], ["follower", fred], ["other user", sam], ["signed out", anon]] as const) {
    const res = await user("GET", `/api/public/makes/${make.id}`);
    assert.equal(res.status, 200, `${who}: ${res.text}`);
    assert.equal(res.json.name, "Linen wrap dress");
    assert.equal(res.json.size, "12");
    assert.equal(res.json.owner.handle, "v.ann");
    assert.equal(res.json.photos.length, 1);
    assert.doesNotMatch(res.text, /measurement|pdf|bust/i, `${who} must not see measurements or the PDF`);
  }
  assert.equal((await bob("GET", `/api/public/makes/${make.id}`)).status, 404, "blocked user");
  assert.equal((await ann("GET", `/api/public/makes/${make.id}`)).json.isOwner, true);
  assert.equal((await sam("GET", `/api/public/makes/${make.id}`)).json.isOwner, false);
});

test("materials on a make show only what the viewer may see", async () => {
  const kinds = async (user: ReturnType<typeof as>) => (await user("GET", `/api/public/makes/${make.id}`)).json.materials.map((m: { kind: string }) => m.kind).sort();
  assert.deepEqual(await kinds(ann), ["fabric", "pattern", "thread"], "owner sees all");
  assert.deepEqual(await kinds(fred), ["fabric", "pattern"], "follower: public pattern + followers fabric");
  assert.deepEqual(await kinds(sam), ["pattern"], "others: public pattern only");
  assert.deepEqual(await kinds(anon), ["pattern"], "signed out: public pattern only");
});

test("followers-only and private makes", async () => {
  assert.equal((await fred("GET", `/api/public/makes/${forFollowers.id}`)).status, 200);
  assert.equal((await sam("GET", `/api/public/makes/${forFollowers.id}`)).status, 404);
  assert.equal((await anon("GET", `/api/public/makes/${forFollowers.id}`)).status, 404);
  assert.equal((await bob("GET", `/api/public/makes/${forFollowers.id}`)).status, 404, "a block beats following");
  for (const user of [fred, sam, anon, bob]) assert.equal((await user("GET", `/api/public/makes/${draft.id}`)).status, 404);
  assert.equal((await ann("GET", `/api/public/makes/${draft.id}`)).status, 200, "owner can preview a private make");
});

test("photos follow the make: readable while visible, hidden once private", async () => {
  assert.equal((await anon("GET", photo)).status, 200);
  assert.equal((await anon("GET", cover)).status, 200);
  assert.equal((await anon("GET", fabricImage)).status, 404, "followers-only fabric image");
  assert.equal((await fred("GET", fabricImage)).status, 200);
  assert.equal((await bob("GET", photo)).status, 404, "blocked");
  assert.equal((await anon("GET", pdf)).status, 404, "pattern PDF is never public");
  assert.equal((await fred("GET", pdf)).status, 404);
});

test("only the owner can change visibility; first share sets publishedAt", async () => {
  assert.equal((await sam("PUT", `/api/visibility/project/${draft.id}`, { visibility: "public" })).status, 404);
  assert.equal((await anon("PUT", `/api/visibility/project/${draft.id}`, { visibility: "public" })).status, 401);
  assert.equal((await ann("PUT", `/api/visibility/project/${draft.id}`, { visibility: "everyone" })).status, 400);
  const res = await ann("PUT", `/api/visibility/project/${draft.id}`, { visibility: "public" });
  assert.equal(res.status, 200, res.text);
  assert.equal((await anon("GET", `/api/public/makes/${draft.id}`)).status, 200);
  const first = (await ann("GET", `/api/projects/${draft.id}`)).json.publishedAt;
  assert.ok(first);
  await ann("PUT", `/api/visibility/project/${draft.id}`, { visibility: "private" });
  assert.equal((await anon("GET", `/api/public/makes/${draft.id}`)).status, 404, "hidden again immediately");
  await ann("PUT", `/api/visibility/project/${draft.id}`, { visibility: "followers" });
  assert.equal((await ann("GET", `/api/projects/${draft.id}`)).json.publishedAt, first, "publishedAt keeps the first share");
  assert.equal((await ann("PUT", `/api/visibility/thread/${thread.id}`, { visibility: "public" })).status, 200);
  assert.equal((await sam("PUT", `/api/visibility/fabric/${fabric.id}`, { visibility: "private" })).status, 404);
});

test("your studio lists only your own items, even when others share theirs", async () => {
  const fabrics = (await sam("GET", "/api/fabrics")).json;
  const projects = (await fred("GET", "/api/projects")).json;
  assert.deepEqual(fabrics, []);
  assert.deepEqual(projects, []);
  assert.equal((await fred("GET", `/api/projects/${make.id}`)).status, 404, "studio detail is owner-only");
});

test("make pages get meta tags and appear in the sitemap only when public", async () => {
  const page = await anon("GET", `/makes/${make.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>Linen wrap dress by @v\.ann · SewSpace<\/title>/);
  assert.match(page.text, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/api\/storage\/objects\/uploads\//);
  assert.match(page.headers.get("cache-control") ?? "", /public/);
  assert.equal((await anon("GET", `/makes/${forFollowers.id}`)).status, 404);
  const followerPage = await fred("GET", `/makes/${forFollowers.id}`);
  assert.equal(followerPage.status, 200);
  assert.match(followerPage.headers.get("cache-control") ?? "", /no-store/);
  assert.match(followerPage.text, /noindex/);
  assert.equal((await anon("GET", "/makes/not-a-number")).status, 404);
  const sitemap = (await anon("GET", "/sitemap.xml")).text;
  assert.match(sitemap, new RegExp(`/makes/${make.id}</loc>`));
  assert.doesNotMatch(sitemap, new RegExp(`/makes/${forFollowers.id}</loc>`));
});
