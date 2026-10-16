import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp } from "./harness";

const origin = await startApp();
const ann = as(origin, "user_ann");
const bea = as(origin, "user_bea");

async function upload(user: ReturnType<typeof as>, body: Record<string, unknown> = {}) {
  const res = await user("POST", "/api/storage/uploads/request-url", { name: "f.webp", size: 1000, contentType: "image/webp", ...body });
  return `/api/storage${res.json.objectPath}`;
}

const fabric = { name: "Linen", type: "Linen", color: "green" };

test("create and update reject another user's file or an external URL", async () => {
  const annImage = await upload(ann);
  const beaImage = await upload(bea);
  assert.equal((await ann("POST", "/api/fabrics", { ...fabric, imageUrl: beaImage })).status, 400);
  assert.equal((await ann("POST", "/api/fabrics", { ...fabric, imageUrl: "https://example.com/x.jpg" })).status, 400);
  assert.equal((await ann("POST", "/api/threads", { brand: "G", color: "#000", colorName: "Black", type: "Poly", imageUrl: beaImage })).status, 400);
  assert.equal((await ann("POST", "/api/patterns", { name: "P", garmentType: "Dress", difficulty: "Beginner", coverImageUrl: beaImage })).status, 400);
  const beaPdf = await upload(bea, { name: "p.pdf", contentType: "application/pdf" });
  assert.equal((await ann("POST", "/api/patterns", { name: "P", garmentType: "Dress", difficulty: "Beginner", pdfUrl: beaPdf })).status, 400);
  assert.equal((await ann("POST", "/api/projects", { name: "Dress", coverImageUrl: beaImage })).status, 400);

  const created = await ann("POST", "/api/fabrics", { ...fabric, imageUrl: annImage });
  assert.equal(created.status, 201, created.text);
  assert.equal((await ann("PATCH", `/api/fabrics/${created.json.id}`, { ...fabric, imageUrl: beaImage })).status, 400);
  assert.equal((await ann("PATCH", `/api/fabrics/${created.json.id}`, { ...fabric, name: "Washed linen", imageUrl: annImage })).status, 200);

  const project = await ann("POST", "/api/projects", { name: "Dress" });
  assert.equal(project.status, 201, project.text);
  assert.equal((await ann("POST", `/api/projects/${project.json.id}/photos`, { url: beaImage })).status, 400);
  const photo = await ann("POST", `/api/projects/${project.json.id}/photos`, { url: annImage });
  assert.equal(photo.status, 201, photo.text);
  assert.equal((await ann("PATCH", `/api/projects/${project.json.id}/photos/${photo.json.id}`, { url: beaImage })).status, 400);
});

test("legacy external URLs stay editable when unchanged", async () => {
  await ownerSql("INSERT INTO sewspace_threads (id, user_id, brand, color, color_name, type, image_url) VALUES (9001, 'user_ann', 'G', '#000', 'Black', 'Poly', 'https://old.example/t.jpg')");
  const thread = { brand: "Gütermann", color: "#000", colorName: "Black", type: "Poly" };
  const res = await ann("PATCH", "/api/threads/9001", { ...thread, imageUrl: "https://old.example/t.jpg" });
  assert.equal(res.status, 200, res.text);
  assert.equal((await ann("PATCH", "/api/threads/9001", { ...thread, imageUrl: "https://other.example/t.jpg" })).status, 400);
});

test("another user cannot read, edit, delete or link your studio rows", async () => {
  const pattern = await ann("POST", "/api/patterns", { name: "Wrap", garmentType: "Dress", difficulty: "Beginner" });
  const fab = await ann("POST", "/api/fabrics", fabric);
  assert.equal((await bea("GET", "/api/patterns")).json.length, 0);
  assert.equal((await bea("PATCH", `/api/fabrics/${fab.json.id}`, { ...fabric, name: "mine" })).status, 404);
  assert.equal((await bea("DELETE", `/api/patterns/${pattern.json.id}`)).status, 404);
  // Linking someone else's pattern is refused by the database policy and reads as not found.
  const link = await bea("POST", "/api/projects", { name: "Copy", patternId: pattern.json.id });
  assert.equal(link.status, 404, link.text);
  assert.equal((await ann("GET", "/api/patterns")).json.length >= 1, true);
});

test("recommendations work with patterns but no fabrics", async () => {
  const cara = as(origin, "user_cara");
  await cara("POST", "/api/patterns", { name: "Skirt", garmentType: "Skirt", difficulty: "Beginner" });
  const res = await cara("GET", "/api/recommendations");
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json, []);
});
