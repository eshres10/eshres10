import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { as, ownerSql, startApp, withoutRls } from "./harness";

process.env.ADMIN_USER_IDS = "k_adm";
const { getCatalogPage, listReviews, viewerFor } = await import("../src/access");

// Phase 5: shared pattern and product pages, links from your studio, reviews,
// helpful votes, and what each kind of viewer sees on a page.
const dir = mkdtempSync(path.join(tmpdir(), "sewspace-catalog-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Sewspace</title></head><body></body></html>`);
const origin = await startApp({ indexHtmlPath });

const kim = as(origin, "k_kim"); // makes things with the pattern
const fol = as(origin, "k_fol"); // follows Kim
const oth = as(origin, "k_oth"); // signed in, doesn't follow
const blk = as(origin, "k_blk"); // Kim blocked them
const adm = as(origin, "k_adm"); // admin
const nob = as(origin, "k_nob"); // no handle
const anon = as(origin, null);

for (const [user, handle] of [[kim, "kim"], [fol, "fol"], [oth, "oth"], [blk, "blk"], [adm, "adm"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.cat`, name: handle });
}
await nob("GET", "/api/profile");
await ownerSql("INSERT INTO sewspace_follows VALUES ('k_fol', 'k_kim')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('k_kim', 'k_blk')");

const created = async (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
const pubPattern = await created(await kim("POST", "/api/patterns", { name: "My Willa", garmentType: "dress", difficulty: "intermediate", visibility: "public" }));
const prvPattern = await created(await kim("POST", "/api/patterns", { name: "Willa (second copy)", garmentType: "dress", difficulty: "intermediate" }));
const linen = await created(await kim("POST", "/api/fabrics", { name: "Oat linen", type: "Linen", color: "#ddccaa", visibility: "public" }));
const make = async (name: string, visibility: string, patternId: number) =>
  created(await kim("POST", "/api/projects", { name, visibility, status: "finished", patternId, fabricId: linen.id, size: "12" }));
const m1 = await make("Public Willa", "public", pubPattern.id);
const m2 = await make("Followers Willa", "followers", pubPattern.id);
const m3 = await make("Willa with a private pattern", "public", prvPattern.id);

let willa: { id: number; slug: string };
let thread: { id: number; slug: string };

test("adding pages: one per maker and name, signed in with a handle", async () => {
  assert.equal((await anon("POST", "/api/catalog", { kind: "pattern", name: "Willa Dress", category: "dresses" })).status, 401);
  assert.equal((await nob("POST", "/api/catalog", { kind: "pattern", name: "Willa Dress", category: "dresses" })).status, 409);
  const r = await kim("POST", "/api/catalog", { kind: "pattern", name: "Willa  Dress", maker: "Fernhill", category: "Dresses", url: "https://fernhill.example/willa", difficulty: "intermediate", sizes: "0–24" });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.slug, "fernhill-willa-dress");
  assert.equal(r.json.name, "Willa Dress");
  assert.equal(r.json.canEdit, true);
  willa = r.json;
  const again = await oth("POST", "/api/catalog", { kind: "pattern", name: "willa dress", maker: "FERNHILL", category: "dresses" });
  assert.equal(again.status, 200, "same maker and name: the existing page");
  assert.equal(again.json.id, willa.id);
  assert.equal(again.json.canEdit, false);
  assert.equal((await oth("POST", "/api/catalog", { kind: "pattern", name: "X", category: "spaceships" })).status, 400);
  assert.equal((await oth("POST", "/api/catalog", { kind: "product", name: "X", category: "fabric", url: "javascript:alert(1)" })).status, 400);
  const t = await oth("POST", "/api/catalog", { kind: "product", name: "Mara 100", maker: "Gütermann", category: "thread", sizes: "ignored on products" });
  assert.equal(t.status, 201, t.text);
  assert.equal(t.json.slug, "gutermann-mara-100");
  assert.equal(t.json.sizes, null);
  thread = t.json;
  assert.ok(!/k_kim|createdBy/.test(r.text), "creator is never shown");
});

test("corrections: the person who added it, or an admin", async () => {
  assert.equal((await oth("PATCH", `/api/catalog/${willa.id}`, { description: "Hijack" })).status, 404);
  assert.equal((await kim("PATCH", `/api/catalog/${willa.id}`, { description: "A wrap dress with pockets." })).json.description, "A wrap dress with pockets.");
  const byAdmin = await adm("PATCH", `/api/catalog/${willa.id}`, { maker: "Fernhill Patterns" });
  assert.equal(byAdmin.status, 200, byAdmin.text);
  assert.equal(byAdmin.json.slug, "fernhill-willa-dress", "the slug never changes");
});

test("linking your own items to pages", async () => {
  assert.equal((await kim("PUT", `/api/catalog-links/pattern/${pubPattern.id}`, { catalogId: willa.id })).status, 200);
  assert.equal((await kim("PUT", `/api/catalog-links/pattern/${prvPattern.id}`, { catalogId: willa.id })).status, 200);
  assert.equal((await oth("PUT", `/api/catalog-links/pattern/${pubPattern.id}`, { catalogId: null })).status, 404, "not yours");
  assert.equal((await kim("PUT", `/api/catalog-links/fabric/${linen.id}`, { catalogId: willa.id })).status, 400, "fabrics link to product pages");
  assert.equal((await kim("PUT", `/api/catalog-links/pattern/${pubPattern.id}`, { catalogId: 999999 })).status, 404);
  const mine = await kim("GET", "/api/patterns");
  assert.equal(mine.json.find((p: { id: number }) => p.id === pubPattern.id).catalogId, willa.id);
});

test("a page shows only makes the viewer may see, through items they may see", async () => {
  const table: Array<[string, ReturnType<typeof as>, number[]]> = [
    ["signed out", anon, [m1.id]],
    ["other user", oth, [m1.id]],
    ["follower", fol, [m1.id, m2.id]],
    ["owner", kim, [m1.id, m2.id, m3.id]],
    ["blocked", blk, []],
  ];
  for (const [label, user, ids] of table) {
    const r = await user("GET", "/api/public/catalog/pattern/fernhill-willa-dress");
    assert.equal(r.status, 200, `${label}: ${r.text}`);
    assert.deepEqual(r.json.makes.map((m: { id: number }) => m.id).sort(), [...ids].sort(), label);
    assert.equal(r.json.entry.stats.makes, ids.length, label);
    assert.ok(!/pdfUrl|measurement|k_kim/.test(r.text), `${label}: nothing private`);
  }
  const out = await anon("GET", "/api/public/catalog/pattern/fernhill-willa-dress");
  assert.deepEqual(out.json.fabricsUsed, [{ name: "linen", count: 1 }]);
  assert.equal(out.json.makes[0].usedWith, "Oat linen");
  assert.equal(out.json.makes[0].owner.handle, "kim.cat");
  assert.equal((await anon("GET", "/api/public/catalog/pattern/nope")).status, 404);
  assert.equal((await anon("GET", "/api/public/catalog/product/fernhill-willa-dress")).status, 404, "kind matters");
});

let othReview = 0, blkReview = 0, kimReview = 0;
test("reviews: one each, own makes only, pattern scores only on patterns", async () => {
  assert.equal((await anon("PUT", `/api/catalog/${willa.id}/review`, { rating: 5 })).status, 401);
  assert.equal((await oth("PUT", `/api/catalog/${willa.id}/review`, { rating: 4, makeId: m1.id })).status, 400, "not your make");
  assert.equal((await oth("PUT", `/api/catalog/${willa.id}/review`, { rating: 9 })).status, 400);
  const r = await oth("PUT", `/api/catalog/${willa.id}/review`, { rating: 3, fit: 3, sizing: "small", sizeMade: "14", body: "Runs small in the bust." });
  assert.equal(r.status, 200, r.text);
  othReview = r.json.id;
  const updated = await oth("PUT", `/api/catalog/${willa.id}/review`, { rating: 4, fit: 3, sizing: "small", body: "Runs small; size up." });
  assert.equal(updated.json.id, othReview, "updates the same review");
  kimReview = (await kim("PUT", `/api/catalog/${willa.id}/review`, { rating: 5, sizing: "true", body: "Love it", makeId: m2.id })).json.id;
  blkReview = (await blk("PUT", `/api/catalog/${willa.id}/review`, { rating: 1, body: "Not for me" })).json.id;
  const product = await oth("PUT", `/api/catalog/${thread.id}/review`, { rating: 5, fit: 2, sizing: "large", body: "Strong" });
  assert.deepEqual([product.json.fit, product.json.sizing], [null, null], "pattern-only scores dropped");

  const signedOut = await anon("GET", "/api/public/catalog/pattern/fernhill-willa-dress/reviews");
  assert.equal(signedOut.json.length, 3);
  assert.equal(signedOut.json.find((x: { id: number }) => x.id === kimReview).make, null, "followers-only make hidden");
  assert.equal((await fol("GET", "/api/public/catalog/pattern/fernhill-willa-dress/reviews")).json.find((x: { id: number }) => x.id === kimReview).make.id, m2.id);
  const forKim = await kim("GET", "/api/public/catalog/pattern/fernhill-willa-dress/reviews");
  assert.deepEqual(forKim.json.map((x: { id: number }) => x.id).sort(), [othReview, kimReview].sort(), "blocked person's review hidden");
  const stats = (await kim("GET", "/api/public/catalog/pattern/fernhill-willa-dress")).json.entry.stats;
  assert.deepEqual([stats.reviews, stats.rating, stats.runsSmall, stats.runsTrue], [3, 3.3, 1, 1], "numbers count every review");
  assert.equal((await kim("GET", "/api/public/catalog/pattern/fernhill-willa-dress")).json.myReview.id, kimReview);
});

test("helpful votes", async () => {
  assert.deepEqual((await fol("PUT", `/api/reviews/${othReview}/helpful`)).json, { helpful: true, helpfulCount: 1 });
  assert.equal((await oth("PUT", `/api/reviews/${othReview}/helpful`)).status, 400, "not your own");
  assert.equal((await blk("PUT", `/api/reviews/${kimReview}/helpful`)).status, 404, "across a block");
  const list = await fol("GET", "/api/public/catalog/pattern/fernhill-willa-dress/reviews");
  assert.equal(list.json[0].id, othReview, "most helpful first");
  assert.equal(list.json[0].helpedByMe, true);
  assert.deepEqual((await fol("DELETE", `/api/reviews/${othReview}/helpful`)).json, { helpful: false, helpfulCount: 0 });
});

test("save a pattern page to your library", async () => {
  const first = await oth("POST", `/api/catalog/${willa.id}/library`);
  assert.deepEqual([first.status, first.json.created], [200, true]);
  const again = await oth("POST", `/api/catalog/${willa.id}/library`);
  assert.deepEqual([again.json.created, again.json.patternId], [false, first.json.patternId]);
  const pattern = (await oth("GET", "/api/patterns")).json.find((p: { id: number }) => p.id === first.json.patternId);
  assert.deepEqual([pattern.name, pattern.designer, pattern.visibility, pattern.catalogId], ["Willa Dress", "Fernhill Patterns", "private", willa.id]);
  assert.equal((await oth("GET", "/api/public/catalog/pattern/fernhill-willa-dress")).json.inMyLibrary, true);
  assert.equal((await oth("POST", `/api/catalog/${thread.id}/library`)).status, 400);
});

test("makes and profiles link materials to their pages", async () => {
  const m = await anon("GET", `/api/public/makes/${m1.id}`);
  assert.deepEqual(m.json.materials.find((x: { kind: string }) => x.kind === "pattern").catalog, { kind: "pattern", slug: "fernhill-willa-dress", name: "Willa Dress" });
  assert.equal(m.json.materials.find((x: { kind: string }) => x.kind === "fabric").catalog, null);
  const used = await anon("GET", "/api/public/profiles/kim.cat/used");
  assert.equal(used.json.items.find((x: { kind: string }) => x.kind === "pattern").catalog.slug, "fernhill-willa-dress");
});

test("browse and search", async () => {
  const all = await anon("GET", "/api/public/catalog?kind=pattern");
  assert.deepEqual(all.json.items.map((x: { slug: string }) => x.slug), ["fernhill-willa-dress"]);
  assert.equal((await anon("GET", "/api/public/catalog?kind=pattern&q=WIL")).json.items.length, 1);
  assert.equal((await anon("GET", "/api/public/catalog?kind=pattern&q=100%25_")).json.items.length, 0, "wildcards are literal");
  assert.deepEqual((await anon("GET", "/api/public/catalog?kind=product&q=mara")).json.items.map((x: { slug: string }) => x.slug), ["gutermann-mara-100"]);
  assert.equal((await anon("GET", `/api/public/catalog-entries/${willa.id}`)).json.slug, "fernhill-willa-dress");
});

test("reviews can be reported and removed by an admin", async () => {
  const r = await fol("POST", "/api/reports", { targetKind: "review", targetId: String(blkReview), reason: "harassment" });
  assert.equal(r.status, 201, r.text);
  assert.equal((await kim("POST", "/api/reports", { targetKind: "review", targetId: String(blkReview), reason: "spam" })).status, 404, "can't report what you can't see");
  const open = (await adm("GET", "/api/admin/reports")).json.find((x: { id: number }) => x.id === r.json.id);
  assert.equal(open.target.link, `/catalog/pattern/fernhill-willa-dress#review-${blkReview}`);
  const removed = await adm("POST", `/api/admin/reports/${r.json.id}/resolve`, { action: "remove" });
  assert.deepEqual([removed.json.status, removed.json.stillExists], ["removed", false]);
  assert.equal((await anon("GET", "/api/public/catalog/pattern/fernhill-willa-dress")).json.entry.stats.reviews, 2);
});

test("page HTML and sitemap", async () => {
  const page = await fetch(`${origin}/catalog/pattern/fernhill-willa-dress`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>Willa Dress by Fernhill Patterns · Sewing pattern · SewSpace<\/title>/);
  assert.match(html, /rel="canonical" href="[^"]*\/catalog\/pattern\/fernhill-willa-dress"/);
  assert.equal(page.headers.get("cache-control"), "public, max-age=60");
  assert.equal((await fetch(`${origin}/catalog`)).status, 200);
  assert.equal((await fetch(`${origin}/catalog/pattern/missing`)).status, 404);
  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  assert.match(sitemap, /\/catalog\/pattern\/fernhill-willa-dress/);
  assert.match(sitemap, /\/catalog\/product\/gutermann-mara-100/);
});

test("module alone: makes and reviews follow the rules without RLS", async () => {
  const page = await withoutRls(null, (tx) => getCatalogPage(tx, viewerFor(null), "pattern", "fernhill-willa-dress"));
  assert.deepEqual(page?.makes.map((m) => m.id), [m1.id], "followers-only make and private pattern stay out");
  await ownerSql("INSERT INTO sewspace_reviews (catalog_id, user_id, rating, body) VALUES ($1, 'k_blk', 2, 'again')", [thread.id]);
  const forKim = await withoutRls("k_kim", (tx) => listReviews(tx, viewerFor("k_kim"), "product", "gutermann-mara-100"));
  assert.deepEqual(forKim?.map((r) => r.author.handle), ["oth.cat"]);
});
