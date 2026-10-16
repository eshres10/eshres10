import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

// Imported after the harness has pointed DATABASE_URL at the test database.
const { canReadObject, getMakeForViewer, viewerFor } = await import("../src/access");

// The access module is the first line of defence; row-level security is the
// second. These tests run the module with RLS bypassed, so each rule must hold
// in the module by itself.
const origin = await startApp();
const ann = as(origin, "l_ann");
await ann("PATCH", "/api/profile", { handle: "l.ann", name: "Ann" });
const img = await ann("POST", "/api/storage/uploads/request-url", { name: "f.webp", size: 10, contentType: "image/webp" });
const photo = `/api/storage${img.json.objectPath}`;
const pdfUp = await ann("POST", "/api/storage/uploads/request-url", { name: "p.pdf", size: 10, contentType: "application/pdf" });
const pub = (await ann("POST", "/api/projects", { name: "Public", visibility: "public", coverImageUrl: photo })).json;
const fol = (await ann("POST", "/api/projects", { name: "Followers", visibility: "followers" })).json;
const prv = (await ann("POST", "/api/projects", { name: "Private" })).json;
await ownerSql("INSERT INTO sewspace_follows VALUES ('l_fred', 'l_ann'), ('l_bob', 'l_ann')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('l_ann', 'l_bob')");

const sees = async (user: string | null, id: number) =>
  Boolean(await withoutRls(user, (tx) => getMakeForViewer(tx, viewerFor(user), id)));

test("module alone: visibility for owner, follower, other, signed out, blocked", async () => {
  const table: Array<[string | null, boolean, boolean, boolean]> = [
    ["l_ann", true, true, true],
    ["l_fred", true, true, false],
    ["l_sam", true, false, false],
    [null, true, false, false],
    ["l_bob", false, false, false],
  ];
  for (const [user, p, f, x] of table) {
    assert.deepEqual([await sees(user, pub.id), await sees(user, fol.id), await sees(user, prv.id)], [p, f, x], `viewer ${user}`);
  }
});

test("module alone: files", async () => {
  const path = photo.replace("/api/storage", "");
  const read = (user: string | null, objectPath: string) => withoutRls(user, (tx) => canReadObject(tx, viewerFor(user), objectPath));
  assert.equal(await read(null, path), true, "cover of a public make");
  assert.equal(await read("l_bob", path), false, "blocked");
  assert.equal(await read(null, pdfUp.json.objectPath), false, "pattern PDF");
  assert.equal(await read("l_ann", pdfUp.json.objectPath), true, "owner");
});
