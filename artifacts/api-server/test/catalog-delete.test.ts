import { test } from "node:test";
import assert from "node:assert/strict";
import { as, startApp, withoutRls } from "./harness";

// Shared pages: the person who added one may delete it while nobody else uses
// it (owner decision after a page added from a private pattern showed up in
// the directory). Their own pattern stays, unlinked.
const origin = await startApp();
const { deleteCatalogEntry } = await import("../src/access/catalog");
const ena = as(origin, "cd_ena");
const ben = as(origin, "cd_ben");
const anon = as(origin, null);
for (const [user, handle] of [[ena, "ena"], [ben, "ben"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.cd`, name: handle });
}
const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
const addPage = (name: string) => ena("POST", "/api/catalog", { kind: "pattern", name, maker: "Tint of Mint", category: "trousers" }).then(ok);
const pageOf = async (user: ReturnType<typeof as>, slug: string) => user("GET", `/api/public/catalog/pattern/${slug}`);

test("the creator deletes an unused page; their private pattern stays, unlinked", async () => {
  const mine = ok(await ena("POST", "/api/patterns", { name: "Ines", garmentType: "trousers", difficulty: "" }));
  const page = await addPage("Ines Pants");
  ok(await ena("PUT", `/api/catalog-links/pattern/${mine.id}`, { catalogId: page.id }));
  assert.equal(ok(await pageOf(ena, page.slug)).canDelete, true, "the creator may delete it");
  assert.equal(ok(await pageOf(ben, page.slug)).canDelete, false, "nobody else is offered it");
  assert.equal(ok(await pageOf(anon, page.slug)).canDelete, false);
  assert.equal((await anon("DELETE", `/api/catalog/${page.id}`)).status, 401);
  assert.equal((await ben("DELETE", `/api/catalog/${page.id}`)).status, 404, "not someone else's");

  assert.equal((await ena("DELETE", `/api/catalog/${page.id}`)).status, 204);
  assert.equal((await pageOf(anon, page.slug)).status, 404, "gone from the site");
  const list = ok(await anon("GET", "/api/public/catalog?kind=pattern&q=Ines"));
  assert.equal(list.items.length, 0, "and from the directory");
  const after = ok(await ena("GET", "/api/patterns")).find((p: { id: number }) => p.id === mine.id);
  assert.equal(after.catalogId, null, "her own pattern is still there, unlinked");
});

test("not while someone else uses it", async () => {
  for (const [label, use] of [
    ["a review", (id: number) => ben("PUT", `/api/catalog/${id}/review`, { rating: 4 })],
    ["a save", (id: number) => ben("PUT", `/api/catalog/${id}/save`)],
    ["their library", (id: number) => ben("POST", `/api/catalog/${id}/library`)],
  ] as const) {
    const page = await addPage(`Used by ${label}`);
    ok(await use(page.id));
    assert.equal(ok(await pageOf(ena, page.slug)).canDelete, false, `${label}: not offered`);
    assert.equal((await ena("DELETE", `/api/catalog/${page.id}`)).status, 409, `${label}: refused`);
    assert.equal((await pageOf(anon, page.slug)).status, 200, `${label}: still there`);
  }
});

test("module alone (RLS bypassed) still deletes only the creator's own page", async () => {
  const page = await addPage("Module check");
  const viewer = (userId: string) => ({ userId, isAdmin: false });
  assert.deepEqual(await withoutRls("cd_ben", (tx) => deleteCatalogEntry(tx, viewer("cd_ben"), page.id)), { ok: false, error: "not_found" });
  assert.equal((await pageOf(anon, page.slug)).status, 200);
});
