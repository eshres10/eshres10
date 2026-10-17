import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

const { menuSummary, viewerFor, MENU_SUMMARY_PER_HOUR } = { ...(await import("../src/access")), ...(await import("../src/routes/menu")) };

// Phase M: the account menu's numbers are only ever the caller's own.
const origin = await startApp();
const ann = as(origin, "mn_ann");
const ben = as(origin, "mn_ben"); // saves and joins a lot
const cal = as(origin, "mn_cal"); // posts things Ben saves; blocked by the host of one challenge
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [ben, "ben"], [cal, "cal"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.menu`, name: handle });
}
const post = async (user: ReturnType<typeof as>, caption: string, visibility = "public") => (await user("POST", "/api/posts", { kind: "status", caption, visibility })).json.id as number;
const p1 = await post(cal, "Linen shirt");
const p2 = await post(cal, "Wool coat");
const p3 = await post(ann, "Ann's own post");
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const day = 86400_000;
const challenge = async (user: ReturnType<typeof as>, tag: string, startsIn: number) => {
  const r = await user("POST", "/api/challenges", { tag, title: tag, description: "", rules: "", startsAt: iso(startsIn), endsAt: iso(startsIn + 10 * day) });
  assert.equal(r.status, 201, r.text);
};
await challenge(ann, "MenuDenim", -3600_000);
await challenge(ann, "MenuWool", 5 * day); // upcoming
await challenge(cal, "MenuLinen", -3600_000);

test("signed out: 401", async () => {
  assert.equal((await anon("GET", "/api/me/menu-summary")).status, 401);
});

test("your saves and running challenges, nobody else's", async () => {
  for (const id of [p1, p2, p3]) assert.equal((await ben("PUT", `/api/posts/${id}/save`)).status, 200);
  for (const slug of ["menudenim", "menuwool", "menulinen"]) await ben("PUT", `/api/challenges/${slug}/membership`);
  const b = await ben("GET", "/api/me/menu-summary");
  assert.equal(b.status, 200, b.text);
  assert.equal(b.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(b.json, { savedCount: 3, activeChallengeCount: 2, salesLast24h: null, isSupporter: false, membershipAvailable: false });
  // Ann hosts two challenges (a host is a member) and saved nothing: Ben's numbers never show up for her.
  assert.deepEqual((await ann("GET", "/api/me/menu-summary")).json, { savedCount: 0, activeChallengeCount: 1, salesLast24h: null, isSupporter: false, membershipAvailable: false });
  assert.deepEqual((await cal("GET", "/api/me/menu-summary")).json.savedCount, 0);
});

test("saves of posts you can no longer see, and challenges across a block, aren't counted", async () => {
  await cal("PATCH", `/api/posts/${p2}`, { visibility: "private" });
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('mn_cal', 'mn_ben')"); // Cal blocks Ben: Cal's post and Cal's challenge drop out
  assert.deepEqual((await ben("GET", "/api/me/menu-summary")).json, { savedCount: 1, activeChallengeCount: 1, salesLast24h: null, isSupporter: false, membershipAvailable: false });
  // The access module with RLS bypassed gives the same (each layer on its own).
  const raw = await withoutRls("mn_ben", (tx) => menuSummary(tx, viewerFor("mn_ben")));
  assert.equal(raw.savedCount, 1);
  assert.equal(raw.activeChallengeCount, 1);
});

test("Pattern sales and Support stay off while selling and membership don't exist", async () => {
  const s = (await ann("GET", "/api/me/menu-summary")).json;
  assert.equal(s.salesLast24h, null, "no seller, no sales row");
  assert.equal(s.membershipAvailable, false, "no membership, no Support row");
  assert.equal(s.isSupporter, false);
});

test("rate limited per person", async () => {
  // Cal asked once above; the rest of the hour's allowance, then 429.
  let ok = 1;
  while ((await cal("GET", "/api/me/menu-summary")).status === 200 && ok <= MENU_SUMMARY_PER_HOUR) ok++;
  assert.equal(ok, MENU_SUMMARY_PER_HOUR, `${MENU_SUMMARY_PER_HOUR} an hour`);
  assert.equal((await ann("GET", "/api/me/menu-summary")).status, 200, "someone else isn't affected");
});
