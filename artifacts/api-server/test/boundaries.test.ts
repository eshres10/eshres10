import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Route handlers must reach the database only through scoped()/withUser(), so
// row-level security always applies. The owner connection bypasses RLS.
test("routes never import the owner connection", () => {
  const dir = path.resolve(import.meta.dirname, "../src/routes");
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), "utf8");
    assert.doesNotMatch(source, /\b(ownerDb|pool)\b/, `${file} uses the owner connection`);
  }
});
