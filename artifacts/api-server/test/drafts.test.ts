import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

const { getDraft, viewerFor } = await import("../src/access");

// Phase F0: one private draft per flow. Only the owner reads, replaces or
// deletes it; files in it must be the owner's own uploads.
const origin = await startApp();
const ann = as(origin, "d_ann");
const ben = as(origin, "d_ben");
const anon = as(origin, null);

async function upload(user: ReturnType<typeof as>, contentType = "image/webp", purpose?: string) {
  const res = await user("POST", "/api/storage/uploads/request-url", { name: contentType === "application/pdf" ? "f.pdf" : "f.webp", size: 1000, contentType, ...(purpose ? { purpose } : {}) });
  assert.equal(res.status, 200, res.text);
  return `/api/storage${res.json.objectPath}`;
}

test("save, read back, replace and delete your own draft", async () => {
  assert.deepEqual((await ann("GET", "/api/drafts/post")).json, { draft: null });
  const photo = await upload(ann);
  const saved = await ann("PUT", "/api/drafts/post", { payload: { caption: "Half done #linen", photos: [{ url: photo }] } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.json.kind, "post");
  const read = await ann("GET", "/api/drafts/post");
  assert.equal(read.json.draft.payload.caption, "Half done #linen");
  await ann("PUT", "/api/drafts/post", { payload: { caption: "Newer" } });
  assert.equal((await ann("GET", "/api/drafts/post")).json.draft.payload.caption, "Newer", "one draft per kind, replaced");
  assert.equal((await ownerSql("SELECT count(*)::int AS n FROM sewspace_drafts WHERE user_id = 'd_ann' AND kind = 'post'")).rows[0].n, 1);
  // A pattern PDF of your own may sit in a stash draft (drafts are private).
  const pdf = await upload(ann, "application/pdf", "pattern_pdf");
  assert.equal((await ann("PUT", "/api/drafts/stash", { payload: { pdfUrl: pdf } })).status, 200);
  assert.equal((await ann("DELETE", "/api/drafts/post")).status, 204);
  assert.deepEqual((await ann("GET", "/api/drafts/post")).json, { draft: null });
  assert.equal((await ann("GET", "/api/drafts/stash")).json.draft.payload.pdfUrl, pdf, "other kinds are separate");
});

test("nobody else can read, replace or delete it", async () => {
  await ann("PUT", "/api/drafts/topic", { payload: { title: "Which interfacing?" } });
  assert.deepEqual((await ben("GET", "/api/drafts/topic")).json, { draft: null });
  await ben("PUT", "/api/drafts/topic", { payload: { title: "Ben's own" } });
  assert.equal((await ben("DELETE", "/api/drafts/topic")).status, 204);
  assert.equal((await ann("GET", "/api/drafts/topic")).json.draft.payload.title, "Which interfacing?", "Ben's save and delete touched only Ben's draft");
  for (const [method, body] of [["GET"], ["PUT", { payload: {} }], ["DELETE"]] as const) {
    assert.equal((await anon(method, "/api/drafts/topic", body)).status, 401, `${method} signed out`);
  }
});

test("module alone (RLS bypassed) still filters to the caller", async () => {
  assert.equal(await withoutRls("d_ben", (tx) => getDraft(tx, viewerFor("d_ben"), "topic")), null);
  assert.equal((await withoutRls("d_ann", (tx) => getDraft(tx, viewerFor("d_ann"), "topic")))?.payload.title, "Which interfacing?");
});

test("files must be your own uploads", async () => {
  const bens = await upload(ben);
  const r = await ann("PUT", "/api/drafts/post", { payload: { photos: [{ url: bens }] } });
  assert.equal(r.status, 400, r.text);
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { nested: { deep: [bens.replace(/^\/api\/storage/, "")] } } })).status, 400, "raw object paths too, at any depth");
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { url: "/api/storage/objects/uploads/made-up" } })).status, 400, "unknown files");
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { caption: "see /api/storage on the forum" } })).status, 200, "plain text that merely mentions a path is fine");
});

test("size and shape limits", async () => {
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { caption: "x".repeat(70_000) } })).status, 413);
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { caption: "x".repeat(60_000) } })).status, 200);
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { caption: "x".repeat(300_000) } })).status, 413, "over the body limit");
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: [1, 2] })).status, 400);
  assert.equal((await ann("PUT", "/api/drafts/post", { payload: { c: "a\u0000b" } })).status, 400);
  assert.equal((await ann("PUT", "/api/drafts/recipe", { payload: {} })).status, 404);
});
