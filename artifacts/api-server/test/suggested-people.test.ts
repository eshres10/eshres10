import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

// Home's "Sewists to follow": people with public work, not you, not already
// followed, never across a block, counting public makes only.
const origin = await startApp();
const { suggestedPeople, viewerFor } = await import("../src/access");
const ann = as(origin, "sp_ann");
const anon = as(origin, null);
const users = ["sp_ann", "sp_ben", "sp_cal", "sp_dee", "sp_eve", "sp_fay"];
for (const id of users) await as(origin, id)("PATCH", "/api/profile", { handle: id.replace("_", "."), name: id.slice(3) });
// Ben: 2 public makes + 1 private. Cal: only private work. Dee: public, but Ann follows her.
// Eve: public, but Ann blocked her. Fay: one public post, no makes.
await ownerSql(`INSERT INTO sewspace_projects (user_id, name, visibility) VALUES
  ('sp_ben', 'A', 'public'), ('sp_ben', 'B', 'public'), ('sp_ben', 'C', 'private'),
  ('sp_cal', 'D', 'private'), ('sp_dee', 'E', 'public'), ('sp_eve', 'F', 'public'), ('sp_ann', 'G', 'public')`);
await ownerSql(`INSERT INTO sewspace_posts (user_id, kind, caption, visibility) VALUES
  ('sp_cal', 'status', 'quiet', 'followers'), ('sp_fay', 'status', 'hello', 'public')`);
await ownerSql("INSERT INTO sewspace_follows VALUES ('sp_ann', 'sp_dee')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('sp_ann', 'sp_eve')");

const mine = (rows: Array<{ handle: string; makes: number }>) => rows.filter((r) => r.handle.startsWith("sp."));

test("people with public work, most public makes first, counting public makes only", async () => {
  const r = await ann("GET", "/api/me/suggested-people");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(mine(r.json).map((p: { handle: string; makes: number }) => [p.handle, p.makes]), [["sp.ben", 2], ["sp.fay", 0]],
    "not Ann, not Cal (nothing public), not Dee (followed), not Eve (blocked)");
  assert.equal((await anon("GET", "/api/me/suggested-people")).status, 401);
});

test("blocked the other way round: still left out; the module alone keeps the same rules", async () => {
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('sp_fay', 'sp_ann')");
  assert.deepEqual(mine((await ann("GET", "/api/me/suggested-people")).json).map((p: { handle: string }) => p.handle), ["sp.ben"]);
  const alone = await withoutRls("sp_ann", (tx) => suggestedPeople(tx, viewerFor("sp_ann"), 50));
  assert.deepEqual(mine(alone).map((p) => p.handle), ["sp.ben"]);
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'sp_fay'");
});
