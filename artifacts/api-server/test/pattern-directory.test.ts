import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

process.env.ADMIN_USER_IDS = "pd_adm";

const { listCatalog, viewerFor } = await import("../src/access");

// Pattern directory (/catalog): filters with counts, sort, paging, public-only
// numbers and covers, where to get it, the designer account, and private saves.
const origin = await startApp();
const des = as(origin, "pd_des"); // a designer with an account
const mak = as(origin, "pd_mak"); // sews things
const fol = as(origin, "pd_fol"); // follows the maker
const oth = as(origin, "pd_oth");
const adm = as(origin, "pd_adm");
const anon = as(origin, null);
for (const [user, handle] of [[des, "des"], [mak, "mak"], [fol, "fol"], [oth, "oth"], [adm, "adm"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.pd`, name: handle });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('pd_fol', 'pd_mak')");

const created = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
const page = async (user: ReturnType<typeof as>, name: string, extra: Record<string, unknown> = {}) =>
  created(await user("POST", "/api/catalog", { kind: "pattern", name, maker: "Studio PD", category: "dresses", difficulty: "beginner", ...extra }));

const willa = await page(des, "Willa", { source: "designer", priceCents: 1600, currency: "AUD", designerHandle: "des.pd" });
const meadow = await page(des, "Meadow Skirt", { category: "skirts", difficulty: "intermediate", source: "free" });
const coat = await page(oth, "Chore Coat", { category: "outerwear", difficulty: "advanced", priceCents: 2200, currency: "usd" });
// Filler pages for paging (inserted directly: the API allows 20 new pages a day).
for (let i = 0; i < 26; i++) {
  await ownerSql(`INSERT INTO sewspace_catalog (kind, slug, name, maker, category, difficulty, created_by, created_at)
    VALUES ('pattern', 'pd-filler-${i}', 'Filler ${i}', 'Filler Co', 'tops', 'beginner', 'pd_oth', now() - interval '60 days')`);
}

// Makes of Willa: one public, one followers-only, one public through a private library pattern.
const pubLib = created(await mak("POST", "/api/patterns", { name: "My Willa", garmentType: "dress", difficulty: "beginner", visibility: "public" }));
const prvLib = created(await mak("POST", "/api/patterns", { name: "Willa copy", garmentType: "dress", difficulty: "beginner" }));
for (const id of [pubLib.id, prvLib.id]) assert.equal((await mak("PUT", `/api/catalog-links/pattern/${id}`, { catalogId: willa.id })).status, 200);
const up = async (path: string) => {
  await ownerSql(`INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES ($1, 'pd_mak', 'image/png', 'image')`, [path]);
  return `/api/storage${path}`;
};
const make = async (name: string, visibility: string, patternId: number, cover: string | null) =>
  created(await mak("POST", "/api/projects", { name, visibility, status: "finished", patternId, size: "12", coverImageUrl: cover }));
await make("Public Willa", "public", pubLib.id, await up("/objects/uploads/pd-public"));
await make("Followers Willa", "followers", pubLib.id, await up("/objects/uploads/pd-followers"));
await make("Private-pattern Willa", "public", prvLib.id, await up("/objects/uploads/pd-private"));
await mak("PUT", `/api/catalog/${willa.id}/review`, { rating: 5 });
await des("PUT", `/api/catalog/${coat.id}/review`, { rating: 4 });

const list = async (user: ReturnType<typeof as>, qs = "") => (await user("GET", `/api/public/catalog${qs}`)).json;
const find = (l: { items: Array<{ id: number }> }, id: number) => l.items.find((e) => e.id === id) as any;

test("public numbers and covers come from public makes only, for everyone", async () => {
  for (const [label, user] of [["signed out", anon], ["follower", fol], ["maker", mak]] as const) {
    const w = find(await list(user, "?q=willa"), willa.id);
    assert.equal(w.stats.makes, 1, `${label}: only the public make through a public pattern`);
    assert.equal(w.coverImageUrl, "/api/storage/objects/uploads/pd-public", `${label}: the cover is the public make's`);
  }
  const r = await anon("GET", "/api/public/catalog?q=willa");
  assert.ok(!/pd-followers|pd-private/.test(r.text), "followers-only and private photos never appear signed out");
});

test("where to get it, price and the designer account", async () => {
  const w = find(await list(anon, "?q=willa"), willa.id);
  assert.deepEqual([w.source, w.priceCents, w.currency, w.designer?.handle], ["designer", 1600, "AUD", "des.pd"]);
  const m = find(await list(anon, "?q=meadow"), meadow.id);
  assert.deepEqual([m.source, m.priceCents, m.designer], ["free", null, null]);
  assert.equal(find(await list(anon, "?q=chore"), coat.id).currency, "USD", "currency is upper-cased");
  assert.equal((await oth("POST", "/api/catalog", { kind: "pattern", name: "Fake", category: "tops", designerHandle: "des.pd" })).status, 400, "you can't name someone else");
  assert.equal((await des("PATCH", `/api/catalog/${coat.id}`, { designerHandle: "des.pd" })).status, 404, "or claim someone else's page");
  assert.equal((await oth("PATCH", `/api/catalog/${coat.id}`, { priceCents: 500 })).status, 400, "a price needs a currency");
  assert.equal((await adm("PATCH", `/api/catalog/${coat.id}`, { designerHandle: "des.pd" })).status, 200, "admins can name the designer");
  assert.equal(find(await list(anon, "?q=chore"), coat.id).designer.handle, "des.pd");
  assert.equal((await adm("PATCH", `/api/catalog/${coat.id}`, { designerHandle: null })).status, 200);
});

test("filters with counts, sort and paging", async () => {
  const all = await list(anon);
  assert.equal(all.total, 29);
  assert.equal(all.items.length, 24, "24 at a time");
  assert.ok(all.nextCursor);
  const next = await list(anon, `?cursor=${all.nextCursor}`);
  assert.equal(next.items.length, 5);
  assert.equal(next.nextCursor, null);
  assert.equal(new Set([...all.items, ...next.items].map((e: { id: number }) => e.id)).size, 29, "no repeats across pages");
  assert.equal(all.items[0].id, willa.id, "most made first");
  assert.deepEqual(all.facets.difficulty, { beginner: 27, intermediate: 1, advanced: 1 });
  assert.deepEqual(all.facets.source, { seams_club: 0, free: 1, designer: 28 });

  const begFree = await list(anon, "?difficulty=beginner,intermediate&source=free");
  assert.deepEqual(begFree.items.map((e: { id: number }) => e.id), [meadow.id]);
  assert.deepEqual(begFree.facets.difficulty, { beginner: 0, intermediate: 1, advanced: 0 }, "difficulty counts apply the source filter");
  assert.deepEqual(begFree.facets.source, { seams_club: 0, free: 1, designer: 27 }, "source counts apply the difficulty filter");

  assert.deepEqual((await list(anon, "?category=skirts")).items.map((e: { id: number }) => e.id), [meadow.id]);
  assert.deepEqual((await list(anon, "?minRating=4.5")).items.map((e: { id: number }) => e.id), [willa.id]);
  assert.deepEqual((await list(anon, "?q=outerwear")).items.map((e: { id: number }) => e.id), [coat.id], "search matches the category");
  assert.deepEqual((await list(anon, "?q=studio%20pd&sort=rating")).items.map((e: { id: number }) => e.id).slice(0, 2), [willa.id, coat.id], "top rated");
  assert.equal((await list(anon, "?sort=new")).items[0].isNew, true, "newest first, marked new");
  assert.equal(find(await list(anon, "?q=filler%2010"), (await list(anon, "?q=filler%2010")).items[0].id).isNew, false);
  assert.equal((await list(anon, "?q=nothing-like-this")).total, 0);
});

test("saves are private and limited", async () => {
  assert.equal((await anon("PUT", `/api/catalog/${willa.id}/save`)).status, 401);
  assert.deepEqual((await fol("PUT", `/api/catalog/${willa.id}/save`)).json, { saved: true });
  assert.equal((await fol("PUT", `/api/catalog/999999/save`)).status, 404);
  assert.equal(find(await list(fol, "?q=willa"), willa.id).savedByMe, true);
  assert.equal(find(await list(oth, "?q=willa"), willa.id).savedByMe, false, "nobody else sees your save");
  assert.equal(find(await list(anon, "?q=willa"), willa.id).savedByMe, false);
  assert.deepEqual((await fol("DELETE", `/api/catalog/${willa.id}/save`)).json, { saved: false });
  // The access module on its own (RLS bypassed) still reports only your saves.
  await fol("PUT", `/api/catalog/${willa.id}/save`);
  const raw = await withoutRls("pd_oth", (tx) => listCatalog(tx, viewerFor("pd_oth"), "pattern", { q: "willa" }));
  assert.equal(raw.items[0].savedByMe, false);
  // 120 saves an hour.
  await ownerSql(`INSERT INTO sewspace_catalog_saves (user_id, catalog_id) SELECT 'pd_oth', id FROM sewspace_catalog WHERE slug LIKE 'pd-filler-%'`);
  await ownerSql(`INSERT INTO sewspace_catalog (kind, slug, name, maker, category, created_by) SELECT 'pattern', 'pd-more-' || g, 'More ' || g, 'More Co', 'tops', 'pd_oth' FROM generate_series(1, 100) g`);
  await ownerSql(`INSERT INTO sewspace_catalog_saves (user_id, catalog_id) SELECT 'pd_oth', id FROM sewspace_catalog WHERE slug LIKE 'pd-more-%' LIMIT 94`);
  assert.equal((await oth("PUT", `/api/catalog/${meadow.id}/save`)).status, 429, "the 121st save in an hour waits");
});
