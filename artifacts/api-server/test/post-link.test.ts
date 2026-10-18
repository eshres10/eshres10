import { test } from "node:test";
import assert from "node:assert/strict";
import { as, startApp } from "./harness";

// A link on a post: only http(s), https:// added when left out, the author
// sets and clears it, and it follows the post's visibility.
const origin = await startApp();
const ann = as(origin, "pl_ann");
const ben = as(origin, "pl_ben");
const anon = as(origin, null);
await ann("PATCH", "/api/profile", { handle: "ann.pl", name: "Ann" });
await ben("PATCH", "/api/profile", { handle: "ben.pl", name: "Ben" });
const make = (body: Record<string, unknown>) => ann("POST", "/api/posts", { kind: "status", caption: "Hi", visibility: "public", ...body });

test("links are http(s); https:// is added when left out", async () => {
  const r = await make({ linkUrl: "  example.com/wren-wrap " });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.linkUrl, "https://example.com/wren-wrap");
  assert.equal((await make({ linkUrl: "http://example.com" })).json.linkUrl, "http://example.com");
  assert.equal((await make({})).json.linkUrl, null, "optional");
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "https://user:pw@example.com", "https://exa mple.com", "localhost", `https://example.com/${"a".repeat(500)}`]) {
    assert.equal((await make({ linkUrl: bad })).status, 400, bad);
  }
});

test("the author edits or removes it; nobody else; it follows the post", async () => {
  const post = (await make({ linkUrl: "https://example.com/a" })).json as { id: number };
  assert.equal((await ann("PATCH", `/api/posts/${post.id}`, { linkUrl: "example.com/b" })).json.linkUrl, "https://example.com/b");
  assert.equal((await ann("PATCH", `/api/posts/${post.id}`, { caption: "Edited" })).json.linkUrl, "https://example.com/b", "left out: kept");
  assert.equal((await ben("PATCH", `/api/posts/${post.id}`, { linkUrl: "https://spam.example" })).status, 404);
  assert.equal((await anon("GET", `/api/public/posts/${post.id}`)).json.linkUrl, "https://example.com/b", "public post: anyone sees it");
  assert.equal((await ann("PATCH", `/api/posts/${post.id}`, { linkUrl: "" })).json.linkUrl, null, "empty removes it");
  const secret = (await make({ visibility: "private", linkUrl: "https://example.com/secret" })).json as { id: number };
  assert.equal((await ben("GET", `/api/public/posts/${secret.id}`)).status, 404, "a private post's link goes nowhere");
});
