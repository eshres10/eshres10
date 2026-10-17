import { test } from "node:test";
import assert from "node:assert/strict";
import { as, startApp, withoutRls } from "./harness";

// Pattern page step 4: GET /api/catalog/:id/me is the caller's own extras
// (stash matches, closest size label, library, makes). Measurements never
// leave the server. Helpful votes are one per person and rate limited.
const origin = await startApp();
const { closestSize, bodyFrom, parseFabricNeeded, catalogMe } = await import("../src/access/pattern-me");
const des = as(origin, "pm_des");
const sue = as(origin, "pm_sue"); // metric, measured
const ian = as(origin, "pm_ian"); // imperial, measured
const nob = as(origin, "pm_nob"); // no measurements, no stash
const anon = as(origin, null);
for (const [user, handle] of [[des, "des"], [sue, "sue"], [ian, "ian"], [nob, "nob"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.pm`, name: handle });
}
await ian("PATCH", "/api/profile", { units: "imperial" });

const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
const page = ok(await des("POST", "/api/catalog", { kind: "pattern", name: "Arden", maker: "Des", category: "dresses", yardage: "2.5–3.2 m" }));
ok(await des("PUT", `/api/catalog/${page.id}/sizes`, { sizes: [
  { label: "10", bustCm: 88, waistCm: 70, hipCm: 94 },
  { label: "12", bustCm: 93, waistCm: 75, hipCm: 99 },
  { label: "14", bustCm: 98, waistCm: 80, hipCm: 104 },
  { label: "16", bustCm: 103, waistCm: 85, hipCm: 109 },
] }));
const me = async (user: ReturnType<typeof as>) => user("GET", `/api/catalog/${page.id}/me`);

ok(await sue("POST", "/api/measurement-profiles", { name: "Old", recordedAt: "2025-01-01", measurements: { bust: 87, waist: 69, fullHip: 93 } }));
ok(await sue("POST", "/api/measurement-profiles", { name: "Now", recordedAt: "2026-06-01", measurements: { bust: 97.5, waist: 79.3, fullHip: 103.1 } }));
ok(await ian("POST", "/api/measurement-profiles", { name: "Me", recordedAt: "2026-01-01", measurements: { bust: 36.5, waist: 29.5, fullHip: 39 } }));
const linen = ok(await sue("POST", "/api/fabrics", { name: "Long linen", type: "Linen", color: "", quantity: 3.5, unit: "m" }));
const cotton = ok(await sue("POST", "/api/fabrics", { name: "Short cotton", type: "Cotton", color: "", quantity: 2.8, unit: "m" }));
ok(await sue("POST", "/api/fabrics", { name: "Scrap", type: "Cotton", color: "", quantity: 1, unit: "m" }));
const yards = ok(await sue("POST", "/api/fabrics", { name: "Yard goods", type: "Rayon", color: "", quantity: 4, unit: "yd" }));
ok(await nob("POST", "/api/fabrics", { name: "Nob's linen", type: "Linen", color: "", quantity: 9, unit: "m", visibility: "public" }));

test("signed out: 401; unknown page: 404", async () => {
  assert.equal((await me(anon)).status, 401);
  assert.equal((await sue("GET", "/api/catalog/999999/me")).status, 404);
});

test("closest size from your latest set, label only; never cached", async () => {
  const r = await me(sue);
  const body = ok(r);
  assert.equal(body.closestSize, "14", "the newer set (2026), not the old one");
  assert.deepEqual(body.nearSizes, ["12", "14", "16"]);
  assert.equal(body.hasMeasurements, true);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.ok(!/97\.5|79\.3|103\.1|"bust"|"waist"|fullHip|measurement/i.test(r.text.replace(/hasMeasurements/, "")), "no measurement values or keys in the response");
  assert.equal(ok(await me(ian)).closestSize, "12", "inches are converted (36.5 in = 92.7 cm)");
  const nobody = ok(await me(nob));
  assert.deepEqual([nobody.closestSize, nobody.nearSizes, nobody.hasMeasurements], [null, [], false]);
});

test("in your stash: only your own fabric that is long enough", async () => {
  const body = ok(await me(sue));
  assert.deepEqual(body.fabricNeeded, { minMetres: 2.5, maxMetres: 3.2 });
  assert.deepEqual(body.stash.map((f: { id: number; enough: string }) => [f.id, f.enough]), [[yards.id, "all"], [linen.id, "all"], [cotton.id, "some"]], "4 yd = 3.66 m first, the 1 m scrap left out");
  assert.ok(!ok(await me(nob)).stash.some((f: { id: number }) => [linen.id, cotton.id, yards.id].includes(f.id)), "never someone else's fabric");
  assert.equal(ok(await me(nob)).stash.length, 1, "nob's own, even though it's public it's theirs");
  assert.deepEqual(ok(await me(des)).stash, [], "no fabric, nothing to show");
});

test("module alone (RLS bypassed) still keeps to the caller's own rows", async () => {
  const viewer = (userId: string) => ({ userId, isAdmin: false });
  const nobs = await withoutRls("pm_nob", (tx) => catalogMe(tx, viewer("pm_nob"), page.id));
  assert.deepEqual(nobs?.stash.map((f) => f.name), ["Nob's linen"], "not Sue's fabric");
  assert.equal(nobs?.closestSize, null, "not Sue's measurements");
  const ians = await withoutRls("pm_ian", (tx) => catalogMe(tx, viewer("pm_ian"), page.id));
  assert.equal(ians?.closestSize, "12", "Ian's own latest set, not Sue's");
});

test("library, makes and saved are the caller's own", async () => {
  const before = ok(await me(sue));
  assert.deepEqual([before.libraryPatternId, before.made, before.saved, before.owned], [null, [], false, false]);
  const lib = ok(await sue("POST", `/api/catalog/${page.id}/library`));
  const make = ok(await sue("POST", "/api/projects", { name: "My Arden", patternId: lib.patternId, status: "sewing" }));
  ok(await sue("PUT", `/api/catalog/${page.id}/save`));
  const after = ok(await me(sue));
  assert.equal(after.libraryPatternId, lib.patternId);
  assert.deepEqual(after.made, [{ id: make.id, name: "My Arden", status: "sewing" }]);
  assert.equal(after.saved, true);
  assert.equal(after.owned, false, "nothing is sold on Seams Club yet");
  const other = ok(await me(ian));
  assert.deepEqual([other.libraryPatternId, other.made, other.saved], [null, [], false], "someone else's library, makes and saves never show");
});

test("helpful: one vote per person, not your own, rate limited", async () => {
  const review = ok(await sue("PUT", `/api/catalog/${page.id}/review`, { rating: 5 }));
  ok(await ian("PUT", `/api/reviews/${review.id}/helpful`));
  assert.equal(ok(await ian("PUT", `/api/reviews/${review.id}/helpful`)).helpfulCount, 1, "voting twice still counts once");
  assert.equal(ok(await nob("PUT", `/api/reviews/${review.id}/helpful`)).helpfulCount, 2);
  assert.equal((await sue("PUT", `/api/reviews/${review.id}/helpful`)).status, 400, "not your own");
  let last = 0;
  for (let i = 0; i < 120 && last !== 429; i++) last = (await nob(i % 2 ? "PUT" : "DELETE", `/api/reviews/${review.id}/helpful`)).status;
  assert.equal(last, 429, "120 an hour");
});

test("measurements are never in any pattern response, for anyone", async () => {
  // As JSON values (":97.5,"), so timestamps like "12:29:36.512Z" don't match.
  const secret = /[:[,]\s*(97\.5|79\.3|103\.1|36\.5|29\.5)\s*[,}\]]|"fullHip"|"bust"|measurementProfileId/;
  const reads: Array<[string, ReturnType<typeof as>, string]> = [
    ["page", sue, `/api/public/catalog/pattern/${page.slug}`],
    ["page signed out", anon, `/api/public/catalog/pattern/${page.slug}`],
    ["directory", sue, "/api/public/catalog?kind=pattern"],
    ["reviews", sue, `/api/public/catalog/pattern/${page.slug}/reviews`],
    ["your extras", sue, `/api/catalog/${page.id}/me`],
    ["someone else's view", ian, `/api/catalog/${page.id}/me`],
    ["profile", anon, "/api/public/profiles/sue.pm"],
  ];
  for (const [label, user, url] of reads) {
    const r = await user("GET", url);
    assert.equal(r.status, 200, `${label}: ${r.text}`);
    assert.ok(!secret.test(r.text), `${label}: no measurement values or keys`);
  }
});

test("helpers: fabric amounts need a unit; closest size uses the measurements both have", () => {
  assert.deepEqual(parseFabricNeeded("3 yards"), { minMetres: 3 * 0.9144, maxMetres: 3 * 0.9144 });
  assert.deepEqual(parseFabricNeeded("2,4 m"), { minMetres: 2.4, maxMetres: 2.4 });
  assert.equal(parseFabricNeeded("2.5–3"), null, "no unit: not guessed");
  assert.equal(parseFabricNeeded(""), null);
  const chart = [{ label: "S", bustCm: 86, waistCm: null, hipCm: 92 }, { label: "M", bustCm: 94, waistCm: null, hipCm: 100 }];
  assert.equal(closestSize(chart, bodyFrom({ waist: 70, fullHip: 99 }, "metric")), "M", "hip only, since the chart has no waist");
  assert.equal(closestSize(chart, bodyFrom({ waist: 70 }, "metric")), null, "nothing to compare");
});
