import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { as, ownerSql, startApp, withoutRls } from "./harness";

process.env.ADMIN_USER_IDS = "g_adm";
const { getChallengePage, listEntries, viewerFor } = await import("../src/access");

// Phase 6: challenges. Starting, joining, entering, host removal, sorting,
// and what the host, an entrant, a follower, others, signed-out and blocked
// people see.
const dir = mkdtempSync(path.join(tmpdir(), "sewspace-challenges-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Seams Club</title></head><body></body></html>`);
const origin = await startApp({ indexHtmlPath });

const host = as(origin, "g_host");
const ent = as(origin, "g_ent"); // enters
const fol = as(origin, "g_fol"); // follows the entrant
const oth = as(origin, "g_oth"); // another entrant
const blk = as(origin, "g_blk"); // the host blocked them
const adm = as(origin, "g_adm");
const nob = as(origin, "g_nob"); // no handle
const anon = as(origin, null);

for (const [user, handle] of [[host, "host"], [ent, "ent"], [fol, "fol"], [oth, "oth"], [blk, "blk"], [adm, "adm"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.chl`, name: handle });
}
await nob("GET", "/api/profile");
await ownerSql("INSERT INTO sewspace_follows VALUES ('g_fol', 'g_ent')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('g_host', 'g_blk')");

const day = 86400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const post = async (user: ReturnType<typeof as>, caption: string, visibility = "public") => {
  const r = await user("POST", "/api/posts", { kind: "status", caption, visibility });
  assert.equal(r.status, 201, r.text);
  return r.json.id as number;
};
const entPost = await post(ent, "Denim jacket, finally");
const entSecond = await post(ent, "Denim tote");
const entFollowers = await post(ent, "Followers-only denim", "followers");
const othPost = await post(oth, "Patched jeans");

test("starting a challenge", async () => {
  const body = { tag: "OctoberDenim", title: "October Denim", description: "Sew anything in denim.", rules: "Denim only\nOne entry per make", startsAt: iso(-3600_000), endsAt: iso(10 * day) };
  assert.equal((await anon("POST", "/api/challenges", body)).status, 401);
  assert.equal((await nob("POST", "/api/challenges", body)).status, 409);
  assert.equal((await host("POST", "/api/challenges", { ...body, tag: "my tag" })).status, 400);
  assert.equal((await host("POST", "/api/challenges", { ...body, endsAt: iso(-day) })).status, 400, "must end in the future");
  assert.equal((await host("POST", "/api/challenges", { ...body, endsAt: iso(100 * day) })).status, 400, "at most 92 days");
  const r = await host("POST", "/api/challenges", body);
  assert.equal(r.status, 201, r.text);
  assert.deepEqual([r.json.slug, r.json.status, r.json.isHost, r.json.members], ["octoberdenim", "active", true, 1]);
  assert.equal((await oth("POST", "/api/challenges", { ...body, tag: "OCTOBERDENIM" })).status, 409, "tags are unique ignoring case");
  assert.equal((await host("POST", "/api/challenges", { ...body, tag: "NovemberWool", startsAt: iso(5 * day), endsAt: iso(20 * day) })).status, 201);
  await ownerSql(`INSERT INTO sewspace_challenges (slug, tag, title, starts_at, ends_at, created_by) VALUES ('septembersilk', 'SeptemberSilk', 'Silk', now() - interval '30 days', now() - interval '2 days', 'g_host')`);
});

test("lists and pages, hidden across a block with the host", async () => {
  const slugs = async (user: ReturnType<typeof as>, status: string) => (await user("GET", `/api/public/challenges?status=${status}`)).json.map((c: { slug: string }) => c.slug);
  assert.deepEqual(await slugs(anon, "active"), ["octoberdenim"]);
  assert.deepEqual(await slugs(anon, "upcoming"), ["novemberwool"]);
  assert.deepEqual(await slugs(anon, "ended"), ["septembersilk"]);
  assert.deepEqual(await slugs(blk, "active"), []);
  const page = await anon("GET", "/api/public/challenges/OctoberDenim");
  assert.equal(page.status, 200, page.text);
  assert.equal(page.json.challenge.host.handle, "host.chl");
  assert.equal(page.json.challenge.rules, "Denim only\nOne entry per make");
  assert.deepEqual(page.json.memberPreview.map((m: { handle: string }) => m.handle), ["host.chl"]);
  assert.ok(!/g_host/.test(page.text));
  assert.equal((await blk("GET", "/api/public/challenges/octoberdenim")).status, 404);
  assert.equal((await oth("PATCH", "/api/challenges/octoberdenim", { title: "Mine" })).status, 404);
  assert.equal((await host("PATCH", "/api/challenges/octoberdenim", { title: "October Denim 2026" })).json.title, "October Denim 2026");
});

let entEntry = 0, secondEntry = 0;
test("joining and entering", async () => {
  assert.deepEqual((await ent("PUT", "/api/challenges/octoberdenim/membership")).json, { joined: true, members: 2 });
  assert.equal((await blk("PUT", "/api/challenges/octoberdenim/membership")).status, 404);
  assert.equal((await ent("PUT", "/api/challenges/septembersilk/membership")).status, 400, "ended");
  const r = await ent("POST", "/api/challenges/octoberdenim/entries", { postId: entPost });
  assert.equal(r.status, 201, r.text);
  entEntry = r.json.entryId;
  secondEntry = (await ent("POST", "/api/challenges/octoberdenim/entries", { postId: entSecond })).json.entryId;
  assert.equal((await ent("POST", "/api/challenges/octoberdenim/entries", { postId: entPost })).status, 409);
  assert.equal((await ent("POST", "/api/challenges/octoberdenim/entries", { postId: entFollowers })).status, 400, "public posts only");
  assert.equal((await ent("POST", "/api/challenges/octoberdenim/entries", { postId: othPost })).status, 400, "own posts only");
  assert.equal((await ent("POST", "/api/challenges/novemberwool/entries", { postId: entPost })).status, 400, "not started");
  const auto = await oth("POST", "/api/challenges/octoberdenim/entries", { postId: othPost });
  assert.equal(auto.status, 201, "entering joins you");
  assert.equal((await oth("GET", "/api/public/challenges/octoberdenim")).json.challenge.joinedByMe, true);
  assert.deepEqual((await anon("GET", `/api/public/posts/${entPost}`)).json.challenges, [{ slug: "octoberdenim", tag: "OctoberDenim", entryId: entEntry }]);
  assert.deepEqual((await oth("GET", "/api/challenges/joined")).json.map((c: { slug: string }) => c.slug), ["octoberdenim"]);
});

test("entries: most liked, newest, following", async () => {
  await fol("PUT", `/api/posts/${othPost}/like`);
  await ent("PUT", `/api/posts/${othPost}/like`);
  const ids = async (user: ReturnType<typeof as>, sort: string) =>
    (await user("GET", `/api/public/challenges/octoberdenim/entries?sort=${sort}`)).json.items.map((e: { post: { id: number } }) => e.post.id);
  assert.deepEqual(await ids(anon, "liked"), [othPost, entSecond, entPost]);
  assert.deepEqual(await ids(anon, "newest"), [othPost, entSecond, entPost]);
  assert.deepEqual(await ids(fol, "following"), [entSecond, entPost]);
  assert.deepEqual(await ids(anon, "following"), []);
  const forHost = (await host("GET", "/api/public/challenges/octoberdenim/entries")).json.items;
  assert.ok(forHost.every((e: { canRemove: boolean }) => e.canRemove), "the host can remove others' entries");
  assert.ok((await anon("GET", "/api/public/challenges/octoberdenim/entries")).json.items.every((e: { canRemove: boolean }) => !e.canRemove));
  assert.equal((await anon("GET", "/api/public/challenges/octoberdenim")).json.challenge.entries, 3);
});

test("the host removes entries; entrants withdraw their own", async () => {
  assert.equal((await oth("DELETE", `/api/challenge-entries/${entEntry}`)).status, 404, "not the host");
  assert.equal((await host("DELETE", `/api/challenge-entries/${entEntry}`)).status, 204);
  const left = (await anon("GET", "/api/public/challenges/octoberdenim/entries")).json.items.map((e: { post: { id: number } }) => e.post.id);
  assert.ok(!left.includes(entPost));
  assert.deepEqual((await anon("GET", `/api/public/posts/${entPost}`)).json.challenges, [], "no tag on the post any more");
  assert.equal((await ent("POST", "/api/challenges/octoberdenim/entries", { postId: entPost })).status, 400, "can't re-enter a removed post");
  assert.equal((await ent("DELETE", `/api/challenge-entries/${entEntry}`)).status, 404, "can't withdraw (and re-enter) a removed entry");
  assert.equal((await ent("DELETE", `/api/challenge-entries/${secondEntry}`)).status, 204, "withdraw");
  assert.equal((await anon("GET", "/api/public/challenges/octoberdenim")).json.challenge.entries, 1);
  assert.equal((await anon("GET", "/api/public/profiles/oth.chl")).json.stats.challengesEntered, 1);
  assert.equal((await anon("GET", "/api/public/profiles/ent.chl")).json.stats.challengesEntered, 0);
});

test("challenges can be reported and removed by an admin", async () => {
  const r = await oth("POST", "/api/reports", { targetKind: "challenge", targetId: "novemberwool", reason: "spam" });
  assert.equal(r.status, 201, r.text);
  assert.equal((await blk("POST", "/api/reports", { targetKind: "challenge", targetId: "octoberdenim", reason: "spam" })).status, 404);
  const report = (await adm("GET", "/api/admin/reports")).json.find((x: { id: number }) => x.id === r.json.id);
  assert.equal(report.target.link, "/challenges/novemberwool");
  assert.equal((await adm("POST", `/api/admin/reports/${r.json.id}/resolve`, { action: "remove" })).json.status, "removed");
  assert.equal((await anon("GET", "/api/public/challenges/novemberwool")).status, 404);
});

test("page HTML and sitemap", async () => {
  const page = await fetch(`${origin}/challenges/octoberdenim`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>#OctoberDenim: October Denim 2026 · Seams Club challenge<\/title>/);
  assert.equal((await fetch(`${origin}/challenges`)).status, 200);
  assert.equal((await fetch(`${origin}/challenges/nope`)).status, 404);
  assert.equal((await fetch(`${origin}/challenges/octoberdenim`, { headers: { "x-test-user": "g_blk" } })).status, 404);
  assert.match(await (await fetch(`${origin}/sitemap.xml`)).text(), /\/challenges\/octoberdenim/);
});

test("module alone: blocks, removed entries and visibility hold without RLS", async () => {
  assert.equal(await withoutRls("g_blk", (tx) => getChallengePage(tx, viewerFor("g_blk"), "octoberdenim")), null);
  await ownerSql("UPDATE sewspace_posts SET visibility = 'followers' WHERE id = $1", [othPost]);
  const signedOut = await withoutRls(null, (tx) => listEntries(tx, viewerFor(null), "octoberdenim", "newest"));
  assert.deepEqual(signedOut?.items.map((e) => e.post.id), [], "followers-only and removed entries stay out");
  await ownerSql("UPDATE sewspace_posts SET visibility = 'public' WHERE id = $1", [othPost]);
  const forHost = await withoutRls("g_host", (tx) => listEntries(tx, viewerFor("g_host"), "octoberdenim", "newest"));
  assert.deepEqual(forHost?.items.map((e) => e.post.id), [othPost], "removed entries stay out of the list, even for the host");
});
