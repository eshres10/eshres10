import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { as, startApp, storedObjects } from "./harness";

// Phase F3: Add to stash. Colours picked from your own photos (no AI), the
// swatch colour and pattern format fields, and optional pattern difficulty.
const origin = await startApp();
const ann = as(origin, "s3_ann");
const ben = as(origin, "s3_ben");
const anon = as(origin, null);

async function upload(user: ReturnType<typeof as>, body: Buffer | string, contentType = "image/png", purpose?: string) {
  const r = await user("POST", "/api/storage/uploads/request-url", { name: contentType === "application/pdf" ? "p.pdf" : "p.png", size: 1000, contentType, ...(purpose ? { purpose } : {}) });
  assert.equal(r.status, 200, r.text);
  storedObjects.set(r.json.objectPath, { body, contentType });
  return `/api/storage${r.json.objectPath}`;
}
// Left two-thirds blue, right third cream.
const swatch = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#4060a0" } })
  .composite([{ input: await sharp({ create: { width: 100, height: 200, channels: 3, background: "#f0e8d8" } }).png().toBuffer(), left: 200, top: 0 }])
  .png().toBuffer();

test("colours come from your own photo, most common first", async () => {
  const url = await upload(ann, swatch);
  const r = await ann("POST", "/api/stash/colours", { imageUrl: url });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.colours.length, 2, "two flat colours, near-duplicates merged");
  const [first, second] = r.json.colours.map((h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  assert.ok(Math.abs(first[0] - 0x40) < 12 && Math.abs(first[2] - 0xa0) < 12, `blue first, got ${r.json.colours[0]}`);
  assert.ok(Math.abs(second[0] - 0xf0) < 12, `cream second, got ${r.json.colours[1]}`);
});

test("only your own image uploads", async () => {
  const bens = await upload(ben, swatch);
  assert.equal((await ann("POST", "/api/stash/colours", { imageUrl: bens })).status, 404, "someone else's photo");
  const pdf = await upload(ann, "%PDF-1.4", "application/pdf", "pattern_pdf");
  assert.equal((await ann("POST", "/api/stash/colours", { imageUrl: pdf })).status, 404, "a pattern PDF is not an image upload");
  const junk = await upload(ann, "not an image");
  assert.equal((await ann("POST", "/api/stash/colours", { imageUrl: junk })).status, 400);
  assert.equal((await ann("POST", "/api/stash/colours", { imageUrl: "https://example.com/x.png" })).status, 400);
  assert.equal((await anon("POST", "/api/stash/colours", { imageUrl: bens })).status, 401);
});

test("fabric swatch colour, thread with no brand, pattern format and no difficulty", async () => {
  const fabric = await ann("POST", "/api/fabrics", { name: "Chambray linen", type: "linen", color: "Chambray blue", colorHex: "#7f9cc4", quantity: 2.5, unit: "m", width: 140 });
  assert.equal(fabric.status, 201, fabric.text);
  assert.equal(fabric.json.colorHex, "#7f9cc4");
  assert.equal((await ann("POST", "/api/fabrics", { name: "x", type: "linen", color: "x", colorHex: "blue" })).status, 400, "hex only");
  const thread = await ann("POST", "/api/threads", { brand: "", colorName: "Navy 310", color: "#1f2a44", type: "all-purpose", quantity: 2 });
  assert.equal(thread.status, 201, thread.text);
  const pattern = await ann("POST", "/api/patterns", { name: "Bayside Sailor Top", garmentType: "Top", difficulty: "", format: "pdf" });
  assert.equal(pattern.status, 201, pattern.text);
  assert.deepEqual([pattern.json.format, pattern.json.difficulty], ["pdf", ""]);
  assert.equal((await ann("POST", "/api/patterns", { name: "x", garmentType: "Top", difficulty: "", format: "scroll" })).status, 400);
});
