import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { as, ownerSql, startApp, withoutRls } from "./harness";

const { getProfileMakes, getProfilePage, getProfileUsed, viewerFor } = await import("../src/access");

// Phase 3: profile header numbers and the Posts, Makes and Used products tabs,
// for the owner, a follower, another user, signed out, and blocked both ways.
const dir = mkdtempSync(path.join(tmpdir(), "sewspace-tabs-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Sewspace</title></head><body></body></html>`);
const origin = await startApp({ indexHtmlPath });
const rae = as(origin, "t_rae"); // owner
const flo = as(origin, "t_flo"); // follows Rae
const oli = as(origin, "t_oli"); // signed in, doesn't follow
const ben = as(origin, "t_ben"); // follows Rae, but Rae blocked him
const cal = as(origin, "t_cal"); // blocked Rae
const anon = as(origin, null);

for (const [user, handle] of [[rae, "rae"], [flo, "flo"], [oli, "oli"], [ben, "ben"], [cal, "cal"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.tabs`, name: handle, units: "metric" });
}
await ownerSql("INSERT INTO sewspace_follows VALUES ('t_flo', 't_rae'), ('t_ben', 't_rae'), ('t_rae', 't_oli')");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('t_rae', 't_ben'), ('t_cal', 't_rae')");

const pattern = (await rae("POST", "/api/patterns", { name: "Tank", garmentType: "top", difficulty: "beginner", visibility: "public" })).json;
const fabric = (await rae("POST", "/api/fabrics", { name: "Blue linen", type: "linen", color: "#3355aa", visibility: "followers" })).json;
const thread = (await rae("POST", "/api/threads", { brand: "Gutermann", color: "#000000", colorName: "Black", type: "all-purpose" })).json;
const measurements = (await rae("POST", "/api/measurements", { name: "Me", recordedAt: "2026-01-01", values: [] })).json;
const project = (name: string, status: string, visibility: string, links: Record<string, number | null>) =>
  rae("POST", "/api/projects", { name, status, visibility, alterations: "FBA 1 cm", ...links }).then((r) => {
    assert.equal(r.status, 201, r.text);
    return r.json;
  });
const a = await project("A public finished", "finished", "public", { patternId: pattern.id, fabricId: fabric.id, threadId: thread.id, measurementProfileId: measurements?.id ?? null });
const b = await project("B followers finished", "finished", "followers", { patternId: pattern.id });
const c = await project("C public in progress", "sewing", "public", { fabricId: fabric.id });
const d = await project("D private finished", "finished", "private", { patternId: pattern.id });
for (const [caption, visibility] of [["pub", "public"], ["fol 1", "followers"], ["fol 2", "followers"], ["mine", "private"]]) {
  const r = await rae("POST", "/api/posts", { kind: "status", caption, visibility });
  assert.equal(r.status, 201, r.text);
}

type Expected = {
  posts: number; makes: number; lockedPosts: number; lockedMakes: number; isMe: boolean;
  finished: number[]; inProgress: number[]; aMaterials: string[];
  used: Array<[string, number[]]>;
};
const viewers: Array<[string, ReturnType<typeof as>, Expected]> = [
  ["owner", rae, { posts: 4, makes: 4, lockedPosts: 0, lockedMakes: 0, isMe: true, finished: [a.id, b.id, d.id], inProgress: [c.id], aMaterials: ["pattern", "fabric", "thread"],
    used: [["pattern", [a.id, b.id, d.id]], ["fabric", [a.id, c.id]], ["thread", [a.id]]] }],
  ["follower", flo, { posts: 3, makes: 3, lockedPosts: 0, lockedMakes: 0, isMe: false, finished: [a.id, b.id], inProgress: [c.id], aMaterials: ["pattern", "fabric"],
    used: [["pattern", [a.id, b.id]], ["fabric", [a.id, c.id]]] }],
  ["other user", oli, { posts: 1, makes: 2, lockedPosts: 2, lockedMakes: 1, isMe: false, finished: [a.id], inProgress: [c.id], aMaterials: ["pattern"],
    used: [["pattern", [a.id]]] }],
  ["signed out", anon, { posts: 1, makes: 2, lockedPosts: 2, lockedMakes: 1, isMe: false, finished: [a.id], inProgress: [c.id], aMaterials: ["pattern"],
    used: [["pattern", [a.id]]] }],
];

test("profile header: counts what each viewer may see, never private fields", async () => {
  for (const [label, user, e] of viewers) {
    const r = await user("GET", "/api/public/profiles/rae.tabs");
    assert.equal(r.status, 200, `${label}: ${r.text}`);
    // Ben's follow ended when Rae blocked him (migration 0005), so 1 follower.
    assert.deepEqual(r.json.stats, { posts: e.posts, makes: e.makes, followers: 1, following: 1, followersOnlyPosts: e.lockedPosts, followersOnlyMakes: e.lockedMakes, challengesEntered: 0 }, label);
    assert.equal(r.json.isMe, e.isMe, label);
    assert.ok(!/units|metric|experience|t_rae/.test(r.text), `${label}: private fields leaked`);
  }
});

test("posts tab: only posts the viewer may see", async () => {
  for (const [label, user, e] of viewers) {
    const r = await user("GET", "/api/public/profiles/rae.tabs/posts");
    assert.equal(r.status, 200, label);
    assert.equal(r.json.items.length, e.posts, label);
    assert.ok(r.json.items.every((p: { author: { handle: string } }) => p.author.handle === "rae.tabs"), label);
  }
});

test("makes tab: finished first, shared in-progress below, materials filtered", async () => {
  for (const [label, user, e] of viewers) {
    const r = await user("GET", "/api/public/profiles/rae.tabs/makes");
    assert.equal(r.status, 200, label);
    assert.deepEqual(r.json.finished.map((m: { id: number }) => m.id).sort(), [...e.finished].sort(), label);
    assert.deepEqual(r.json.inProgress.map((m: { id: number }) => m.id), e.inProgress, label);
    const madeA = r.json.finished.find((m: { id: number }) => m.id === a.id);
    assert.deepEqual(madeA.materials.map((m: { kind: string }) => m.kind), e.aMaterials, label);
    assert.equal(madeA.size, null);
    assert.equal(madeA.alterations, "FBA 1 cm");
    assert.ok(!/measurementProfileId|pdfUrl|pdf_url/.test(r.text), `${label}: never measurements or PDFs`);
  }
});

test("used products tab: visible items, each with the visible makes it went into", async () => {
  for (const [label, user, e] of viewers) {
    const r = await user("GET", "/api/public/profiles/rae.tabs/used");
    assert.equal(r.status, 200, label);
    const got = r.json.items.map((i: { kind: string; makes: Array<{ id: number }> }) => [i.kind, i.makes.map((m) => m.id).sort()]);
    assert.deepEqual(got, e.used.map(([k, ids]) => [k, [...ids].sort()]), label);
  }
});

test("blocked either way: the profile and every tab are 404", async () => {
  for (const [label, user] of [["blocked by Rae", ben], ["blocked Rae", cal]] as const) {
    for (const path of ["", "/posts", "/makes", "/used"]) {
      const r = await user("GET", `/api/public/profiles/rae.tabs${path}`);
      assert.equal(r.status, 404, `${label} ${path}`);
    }
    // And Rae doesn't see them either.
    const back = await rae("GET", `/api/public/profiles/${label === "blocked by Rae" ? "ben" : "cal"}.tabs`);
    assert.equal(back.status, 404, `Rae viewing ${label}`);
  }
  // The profile page HTML is a 404 too.
  const html = await fetch(`${origin}/@rae.tabs`, { headers: { "x-test-user": "t_ben" } });
  assert.equal(html.status, 404);
});

test("unknown and handle-less profiles are 404", async () => {
  assert.equal((await anon("GET", "/api/public/profiles/nobody.here/makes")).status, 404);
  assert.equal((await anon("GET", "/api/public/profiles/x/used")).status, 404);
});

test("module alone: blocks, locked counts and materials hold without RLS", async () => {
  const page = (user: string | null) => withoutRls(user, (tx) => getProfilePage(tx, viewerFor(user), "rae.tabs"));
  assert.equal(await page("t_ben"), null);
  assert.equal(await page("t_cal"), null);
  const other = await page("t_oli");
  assert.deepEqual([other?.stats.posts, other?.stats.makes, other?.stats.followersOnlyPosts], [1, 2, 2]);
  const makes = await withoutRls(null, (tx) => getProfileMakes(tx, viewerFor(null), "rae.tabs"));
  assert.deepEqual(makes?.finished.map((m) => m.id), [a.id]);
  assert.deepEqual(makes?.finished[0].materials.map((m) => m.kind), ["pattern"]);
  const used = await withoutRls("t_flo", (tx) => getProfileUsed(tx, viewerFor("t_flo"), "rae.tabs"));
  assert.deepEqual(used?.items.map((i) => i.kind), ["pattern", "fabric"]);
  assert.equal(await withoutRls("t_ben", (tx) => getProfileUsed(tx, viewerFor("t_ben"), "rae.tabs")), null);
});
