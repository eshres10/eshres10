import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp } from "./harness";

process.env.ADMIN_USER_IDS = "pp_adm";

// Pattern page (step 3): gallery and fabrics from public data only, the size
// chart, review numbers that count every review, alterations, the designer's
// links and follow state, and profile shop / Instagram links.
const origin = await startApp();
const des = as(origin, "pp_des"); // the designer, who added the page
const mak = as(origin, "pp_mak"); // makes it
const fol = as(origin, "pp_fol"); // follows the maker
const oth = as(origin, "pp_oth");
const blk = as(origin, "pp_blk"); // the designer blocked them
const adm = as(origin, "pp_adm");
const anon = as(origin, null);
for (const [user, handle] of [[des, "des"], [mak, "mak"], [fol, "fol"], [oth, "oth"], [blk, "blk"], [adm, "adm"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.pp`, name: handle });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('pp_fol', 'pp_mak')");

const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
const willa = ok(await des("POST", "/api/catalog", { kind: "pattern", name: "Willa", maker: "Des Studio", category: "dresses", designerHandle: "des.pp" }));
const page = async (user: ReturnType<typeof as>) => ok(await user("GET", `/api/public/catalog/pattern/${willa.slug}`));

const up = async (name: string) => {
  await ownerSql(`INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES ($1, 'pp_mak', 'image/png', 'image')`, [`/objects/uploads/${name}`]);
  return `/api/storage/objects/uploads/${name}`;
};
const pubLib = ok(await mak("POST", "/api/patterns", { name: "My Willa", garmentType: "dress", difficulty: "", visibility: "public" }));
await mak("PUT", `/api/catalog-links/pattern/${pubLib.id}`, { catalogId: willa.id });
const pubLinen = ok(await mak("POST", "/api/fabrics", { name: "Oat linen", type: "Linen", color: "", visibility: "public" }));
const prvSilk = ok(await mak("POST", "/api/fabrics", { name: "Secret silk", type: "Silk", color: "" }));
const make = async (name: string, visibility: string, fabricId: number) =>
  ok(await mak("POST", "/api/projects", { name, visibility, status: "finished", patternId: pubLib.id, fabricId, size: "12", coverImageUrl: await up(name.replace(/\W/g, "")) }));
await make("Public linen", "public", pubLinen.id);
await make("Public secret silk", "public", prvSilk.id);
await make("Followers linen", "followers", pubLinen.id);

test("gallery and fabrics come from public data only", async () => {
  for (const [label, user] of [["signed out", anon], ["follower", fol], ["maker", mak]] as const) {
    const p = await page(user);
    assert.deepEqual(p.gallery.map((g: { url: string }) => g.url).sort(), ["/api/storage/objects/uploads/Publiclinen", "/api/storage/objects/uploads/Publicsecretsilk"], `${label}: public makes only`);
    assert.deepEqual(p.fabricsUsed, [{ name: "linen", count: 1 }], `${label}: a private fabric's type is never shown or counted`);
    assert.equal(p.entry.stats.makes, 2, `${label}: public makes`);
  }
  assert.equal((await page(fol)).makes.length, 3, "the makes list still shows a follower the followers-only make");
  for (const [label, user] of [["signed out", anon], ["someone who doesn't follow", oth]] as const) {
    const names = (await page(user)).makes.map((m: { name: string }) => m.name).sort();
    assert.deepEqual(names, ["Public linen", "Public secret silk"], `${label}: no followers-only make in the list`);
  }
});

test("size chart: the page's creator or an admin, labels once each", async () => {
  const chart = [{ label: "12", bustCm: 95, waistCm: 77, hipCm: 101 }, { label: "14", bustCm: 100, waistCm: 82, hipCm: 106 }];
  assert.deepEqual(ok(await des("PUT", `/api/catalog/${willa.id}/sizes`, { sizes: chart })), chart);
  assert.equal((await oth("PUT", `/api/catalog/${willa.id}/sizes`, { sizes: [] })).status, 404, "not someone else");
  assert.equal((await anon("PUT", `/api/catalog/${willa.id}/sizes`, { sizes: [] })).status, 401);
  assert.equal((await des("PUT", `/api/catalog/${willa.id}/sizes`, { sizes: [chart[0], chart[0]] })).status, 400, "labels once each");
  assert.equal((await des("PUT", `/api/catalog/${willa.id}/sizes`, { sizes: [{ label: "x", bustCm: 5, waistCm: null, hipCm: null }] })).status, 400, "sensible numbers");
  assert.deepEqual((await page(anon)).sizes, chart, "everyone reads it");
  assert.equal((await adm("PUT", `/api/catalog/${willa.id}/sizes`, { sizes: [...chart, { label: "16", bustCm: 105, waistCm: 87, hipCm: 111 }] })).status, 200, "admins can correct it");
  assert.equal((await page(anon)).sizes.length, 3);
});

test("review numbers count every review; alterations come from the list", async () => {
  assert.equal((await mak("PUT", `/api/catalog/${willa.id}/review`, { rating: 5, alterations: ["made_up"] })).status, 400, "only alterations from the list");
  ok(await mak("PUT", `/api/catalog/${willa.id}/review`, { rating: 5, alterations: ["fba", "swayback", "fba"] }));
  ok(await blk("PUT", `/api/catalog/${willa.id}/review`, { rating: 3, alterations: ["fba"] }));
  ok(await oth("PUT", `/api/catalog/${willa.id}/review`, { rating: 4 }));
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('pp_des', 'pp_blk')");
  const p = await page(des);
  assert.deepEqual(p.stars.map((s: { count: number }) => s.count), [1, 1, 1, 0, 0], "5, 4, 3, 2, 1 stars: the blocked reviewer still counts");
  assert.deepEqual(p.alterations, [{ id: "fba", count: 2 }, { id: "swayback", count: 1 }], "repeats dropped, most common first");
  const reviews = ok(await des("GET", `/api/public/catalog/pattern/${willa.slug}/reviews`));
  assert.equal(reviews.length, 2, "but their review isn't shown");
  assert.deepEqual(reviews.find((r: { author: { handle: string } }) => r.author.handle === "mak.pp").alterations, ["fba", "swayback"]);
});

test("designer: links, follow state and their page count", async () => {
  assert.equal((await des("PATCH", "/api/profile", { shopUrl: "http://shop.example" })).status, 400, "https only");
  assert.equal((await des("PATCH", "/api/profile", { instagram: "not a handle!" })).status, 400);
  const me = ok(await des("PATCH", "/api/profile", { shopUrl: "https://shop.example/des", instagram: "https://www.instagram.com/des.sews/" }));
  assert.deepEqual([me.shopUrl, me.instagram], ["https://shop.example/des", "des.sews"], "an Instagram link keeps the handle");
  const profile = ok(await anon("GET", "/api/public/profiles/des.pp"));
  assert.deepEqual([profile.shopUrl, profile.instagram], ["https://shop.example/des", "des.sews"], "links are public");

  const signedOut = (await page(anon)).designerInfo;
  assert.deepEqual(signedOut, { shopUrl: "https://shop.example/des", instagram: "des.sews", patterns: 1, followedByMe: false, isMe: false });
  ok(await oth("PUT", "/api/follows/des.pp"));
  assert.equal((await page(oth)).designerInfo.followedByMe, true);
  assert.equal((await page(des)).designerInfo.isMe, true);
  const blocked = await page(blk);
  assert.equal(blocked.entry.designer, null, "across a block the designer isn't shown");
  assert.equal(blocked.designerInfo, null);
  ok(await des("PATCH", "/api/profile", { shopUrl: "", instagram: "" }));
  assert.deepEqual([(await page(anon)).designerInfo.shopUrl, (await page(anon)).designerInfo.instagram], [null, null], "empty clears");
});

test("nothing private in the page", async () => {
  const r = await anon("GET", `/api/public/catalog/pattern/${willa.slug}`);
  assert.ok(!/Secret silk|Followers linen|measurement|pdfUrl|pp_/.test(r.text), "no private fabric, followers-only make, measurement or user id");
});
