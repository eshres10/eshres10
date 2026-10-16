import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp } from "./harness";

const origin = await startApp();
const ann = as(origin, "user_ann");
const bea = as(origin, "user_bea");
const anon = as(origin, null);

async function upload(user: ReturnType<typeof as>, body: Record<string, unknown>) {
  const res = await user("POST", "/api/storage/uploads/request-url", { name: "f.webp", size: 1000, contentType: "image/webp", ...body });
  assert.equal(res.status, 200, res.text);
  return `/api/storage${res.json.objectPath}`;
}

test("uploads are served to their owner only; others get 404, not 403", async () => {
  const url = await upload(ann, {});
  assert.equal((await ann("GET", url)).status, 200);
  assert.equal((await bea("GET", url)).status, 404);
  assert.equal((await anon("GET", url)).status, 404);
  assert.equal((await bea("GET", "/api/storage/objects/uploads/does-not-exist")).status, 404);
});

test("legacy files: readable by the user whose row references them", async () => {
  // A file uploaded before owners were recorded: no sewspace_uploads row.
  await ownerSql("INSERT INTO sewspace_fabrics (user_id, name, type, color, image_url) VALUES ('user_ann', 'Old', 'Linen', 'green', '/api/storage/objects/uploads/legacy-1')");
  assert.equal((await ann("GET", "/api/storage/objects/uploads/legacy-1")).status, 200);
  assert.equal((await bea("GET", "/api/storage/objects/uploads/legacy-1")).status, 404);
  assert.equal((await anon("GET", "/api/storage/objects/uploads/legacy-1")).status, 404);
});

test("pattern PDFs and visualisations are never public, even when set as an avatar", async () => {
  await ann("PATCH", "/api/profile", { handle: "ann.pdf" });
  const pdf = await upload(ann, { name: "p.pdf", contentType: "application/pdf", purpose: "pattern_pdf" });
  assert.equal((await ann("PATCH", "/api/profile", { avatarUrl: pdf })).status, 400);
  await ownerSql("UPDATE sewspace_profiles SET avatar_url = $1 WHERE user_id = 'user_ann'", [pdf]);
  assert.equal((await anon("GET", pdf)).status, 404);
  assert.equal((await bea("GET", pdf)).status, 404);
  await ownerSql("INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES ('/objects/visualizations/user_ann/v.png', 'user_ann', 'image/png', 'visualization')");
  await ownerSql("UPDATE sewspace_profiles SET avatar_url = '/api/storage/objects/visualizations/user_ann/v.png' WHERE user_id = 'user_ann'");
  assert.equal((await anon("GET", "/api/storage/objects/visualizations/user_ann/v.png")).status, 404);
  assert.equal((await ann("GET", "/api/storage/objects/visualizations/user_ann/v.png")).status, 200);
});

test("upload purpose must match the file type", async () => {
  const res = await ann("POST", "/api/storage/uploads/request-url", { name: "x.webp", size: 10, contentType: "image/webp", purpose: "pattern_pdf" });
  assert.equal(res.status, 415);
  const pdfAsImage = await ann("POST", "/api/storage/uploads/request-url", { name: "x.pdf", size: 10, contentType: "application/pdf", purpose: "avatar" });
  assert.equal(pdfAsImage.status, 415);
  assert.equal((await anon("POST", "/api/storage/uploads/request-url", { name: "x.webp", size: 10, contentType: "image/webp" })).status, 401);
});

test("analyze-pdf refuses PDFs the user doesn't own (before any AI call)", async () => {
  const pdf = await upload(ann, { name: "p.pdf", contentType: "application/pdf", purpose: "pattern_pdf" });
  const res = await bea("POST", "/api/patterns/analyze-pdf", { pdfUrl: pdf });
  assert.equal(res.status, 404, res.text);
  const image = await upload(ann, {});
  assert.equal((await ann("POST", "/api/patterns/analyze-pdf", { pdfUrl: image })).status, 404, "an image is not a pattern PDF");
});
