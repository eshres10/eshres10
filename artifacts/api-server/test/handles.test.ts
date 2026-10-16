import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBaseFromName, handleCandidates, handleProblem, normaliseHandle, RESERVED_HANDLES } from "../src/access/handles";

test("normalises handles: trims, drops @, lowercases", () => {
  assert.equal(normaliseHandle("  @Ann.Sews "), "ann.sews");
});

test("handle format rules", () => {
  assert.equal(handleProblem("ab"), "too_short");
  assert.equal(handleProblem("a".repeat(31)), "too_long");
  assert.equal(handleProblem("ann-sews"), "invalid_characters");
  assert.equal(handleProblem("ann sews"), "invalid_characters");
  assert.equal(handleProblem("ann_sews.2"), null);
  assert.equal(handleProblem("a".repeat(30)), null);
});

test("every route word from the brief is reserved", () => {
  for (const word of ["admin", "api", "explore", "feed", "forum", "settings", "studio", "challenges", "patterns", "products", "makes", "sign-in", "sign-up", "help"]) {
    assert.ok(RESERVED_HANDLES.has(word), word);
  }
  assert.equal(handleProblem("forum"), "reserved");
  assert.equal(handleProblem("vite"), "reserved");
});

test("suggests a handle from a display name", () => {
  assert.equal(handleBaseFromName("Ana María López"), "ana.maria.lopez");
  assert.equal(handleBaseFromName("Jo"), "jo.sews");
  assert.equal(handleBaseFromName("!!"), "maker");
  assert.equal(handleBaseFromName("Admin"), "admin.sews");
  const candidates = handleCandidates("ann");
  assert.deepEqual(candidates.slice(0, 3), ["ann", "ann.sews", "ann2"]);
  for (const c of candidates) assert.equal(handleProblem(c), null, c);
});
