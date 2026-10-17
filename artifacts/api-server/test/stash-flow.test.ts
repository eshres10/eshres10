import { test } from "node:test";
import assert from "node:assert/strict";
import { as, startApp } from "./harness";

// Phase F3: Add to stash. The swatch colour and pattern format fields, an
// optional pattern difficulty and an optional thread brand.
const origin = await startApp();
const ann = as(origin, "s3_ann");

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
