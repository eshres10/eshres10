import { test } from "node:test";
import assert from "node:assert/strict";
import { as, ownerSql, startApp, withoutRls } from "./harness";

// Notifications (the bell): written by database triggers, read only by the
// recipient, never across a block or about something they can no longer see.
const origin = await startApp();
const { endingSoon, listNotifications, unreadNotificationCount, viewerFor } = await import("../src/access");
const ann = as(origin, "nf_ann"); // posts, asks, hosts
const ben = as(origin, "nf_ben"); // likes, comments, follows, answers, enters
const cal = as(origin, "nf_cal"); // replies to Ben's comment; later blocked by Ann
const anon = as(origin, null);
for (const [user, handle] of [[ann, "ann"], [ben, "ben"], [cal, "cal"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.nf`, name: handle });
}
const ok = (r: { status: number; json: any; text: string }) => {
  assert.ok(r.status === 200 || r.status === 201, r.text);
  return r.json;
};
const list = async (user: ReturnType<typeof as>, cursor?: string) => ok(await user("GET", `/api/notifications${cursor ? `?cursor=${cursor}` : ""}`));
const unread = async (user: ReturnType<typeof as>) => ok(await user("GET", "/api/notifications/unread-count")).unreadCount as number;
const kinds = (page: { items: Array<{ kind: string }> }) => page.items.map((i) => i.kind);

const post = ok(await ann("POST", "/api/posts", { kind: "status", caption: "First linen shirt", visibility: "public" }));

test("signed out: 401 everywhere", async () => {
  assert.equal((await anon("GET", "/api/notifications")).status, 401);
  assert.equal((await anon("GET", "/api/notifications/unread-count")).status, 401);
  assert.equal((await anon("POST", "/api/notifications/read")).status, 401);
});

test("a like reaches the author only, with who, what and where; never cached", async () => {
  ok(await ben("PUT", `/api/posts/${post.id}/like`));
  const r = await ann("GET", "/api/notifications");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const [like] = ok(r).items;
  assert.equal(like.kind, "like");
  assert.deepEqual(like.actor, { handle: "ben.nf", name: "ben", avatarUrl: null });
  assert.deepEqual(like.post, { id: post.id, caption: "First linen shirt", thumbUrl: null });
  assert.equal(like.href, `/posts/${post.id}`);
  assert.equal(like.read, false);
  assert.equal(await unread(ann), 1);
  assert.deepEqual(kinds(await list(ben)), [], "nothing for the liker");
  assert.equal(await unread(cal), 0);
});

test("comments, replies and follows", async () => {
  const top = ok(await ben("POST", `/api/posts/${post.id}/comments`, { body: "Lovely collar" }));
  const reply = ok(await cal("POST", `/api/posts/${post.id}/comments`, { body: "Agreed!", parentId: top.id }));
  ok(await ben("PUT", "/api/follows/ann.nf"));
  const anns = await list(ann);
  assert.deepEqual(kinds(anns), ["follow", "comment", "comment", "like"]);
  assert.equal(anns.items[0].href, "/@ben.nf");
  assert.equal(anns.items[1].href, `/posts/${post.id}#comment-${reply.id}`);
  assert.equal(anns.items[1].comment.body, "Agreed!");
  const bens = await list(ben);
  assert.deepEqual(kinds(bens), ["comment_reply"], "Ben hears about the reply to his comment");
  assert.equal(bens.items[0].actor.handle, "cal.nf");
});

test("forum replies, accepted answers and challenge entries", async () => {
  const topic = ok(await ann("POST", "/api/forum/topics", { board: "fabric", kind: "question", title: "How do I stop linen shifting?", body: "Washed linen." }));
  const answer = ok(await ben("POST", `/api/forum/topics/${topic.id}/replies`, { body: "Pattern weights and spray starch." }));
  ok(await ann("PUT", `/api/forum/topics/${topic.id}/accepted`, { replyId: answer.id }));
  const [forum] = (await list(ann)).items;
  assert.deepEqual([forum.kind, forum.topic.title, forum.href], ["forum_reply", "How do I stop linen shifting?", `/forum/topics/${topic.id}#reply-${answer.id}`]);
  const [accepted] = (await list(ben)).items;
  assert.deepEqual([accepted.kind, accepted.actor.handle, accepted.reply.body], ["answer_accepted", "ann.nf", "Pattern weights and spray starch."]);

  const now = Date.now();
  ok(await ann("POST", "/api/challenges", { tag: "NfLinen", title: "Linen month", description: "", rules: "", startsAt: new Date(now - 3600_000).toISOString(), endsAt: new Date(now + 10 * 86400_000).toISOString() }));
  const entry = ok(await ben("POST", "/api/posts", { kind: "status", caption: "My linen entry", visibility: "public" }));
  ok(await ben("POST", "/api/challenges/nflinen/entries", { postId: entry.id }));
  const [entered] = (await list(ann)).items;
  assert.deepEqual([entered.kind, entered.challenge, entered.href], ["challenge_entry", { slug: "nflinen", title: "Linen month" }, "/challenges/nflinen"]);
});

test("mark read: some, then all; only your own", async () => {
  const before = await list(ann);
  const total = before.unreadCount;
  assert.ok(total >= 5);
  const first = before.items[0].id;
  // Ben can't mark Ann's notification read.
  assert.equal(ok(await ben("POST", "/api/notifications/read", { ids: [first] })).unreadCount, await unread(ben));
  assert.equal((await list(ann)).items[0].read, false);
  assert.equal(ok(await ann("POST", "/api/notifications/read", { ids: [first] })).unreadCount, total - 1);
  assert.equal((await list(ann)).items[0].read, true);
  assert.equal((await ann("POST", "/api/notifications/read", { ids: ["x"] })).status, 400);
  assert.equal((await ann("POST", "/api/notifications/read", { ids: Array.from({ length: 101 }, (_, i) => i + 1) })).status, 400, "100 at most");
  assert.equal(ok(await ann("POST", "/api/notifications/read")).unreadCount, 0, "no ids: all");
  assert.ok((await list(ann)).items.every((i: { read: boolean }) => i.read));
  assert.ok((await unread(ben)) > 0, "Ben's are untouched");
});

test("a post made private hides the notification about it", async () => {
  const before = (await list(ben)).items.length;
  ok(await ann("PATCH", `/api/posts/${post.id}`, { visibility: "private" }));
  const after = await list(ben);
  assert.ok(!after.items.some((i: { kind: string }) => i.kind === "comment_reply"), "the reply on Ann's now-private post is gone for Ben");
  assert.equal(after.items.length, before - 1);
  ok(await ann("PATCH", `/api/posts/${post.id}`, { visibility: "public" }));
  assert.equal((await list(ben)).items.length, before, "and back when it's public again");
});

test("a block hides everything from that person, older ones too", async () => {
  assert.ok((await list(ann)).items.some((i: { actor: { handle: string } }) => i.actor.handle === "cal.nf"));
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('nf_ann', 'nf_cal')");
  assert.ok(!(await list(ann)).items.some((i: { actor: { handle: string } }) => i.actor.handle === "cal.nf"), "Cal's reply is hidden from Ann");
  assert.ok((await list(ben)).items.some((i: { actor: { handle: string } }) => i.actor.handle === "cal.nf"), "Ben isn't part of that block: he still sees Cal's reply");
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'nf_ann' AND blocked_id = 'nf_cal'");
});

test("module alone (RLS bypassed) keeps to the same rules", async () => {
  const bens = await withoutRls("nf_ben", (tx) => listNotifications(tx, viewerFor("nf_ben")));
  assert.ok(bens.items.every((i) => i.kind === "answer_accepted" || i.kind === "comment_reply"), "only Ben's own");
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('nf_ben', 'nf_ann')");
  const blocked = await withoutRls("nf_ben", (tx) => listNotifications(tx, viewerFor("nf_ben")));
  assert.ok(!blocked.items.some((i) => i.actor?.handle === "ann.nf"), "nothing from Ann across the block");
  assert.ok(!blocked.items.some((i) => i.post?.id === post.id), "nor about her post");
  assert.equal(await withoutRls("nf_ben", (tx) => unreadNotificationCount(tx, viewerFor("nf_ben"))), blocked.items.filter((i) => !i.read).length, "the count agrees");
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'nf_ben' AND blocked_id = 'nf_ann'");
  // Only the actor rule covers this one: a like on Ben's own post, from someone he then blocks.
  const own = ok(await ben("POST", "/api/posts", { kind: "status", caption: "Ben's own", visibility: "public" }));
  ok(await cal("PUT", `/api/posts/${own.id}/like`));
  await ownerSql("INSERT INTO sewspace_blocks VALUES ('nf_ben', 'nf_cal')");
  const hidden = await withoutRls("nf_ben", (tx) => listNotifications(tx, viewerFor("nf_ben")));
  assert.ok(!hidden.items.some((i) => i.post?.id === own.id), "Cal's like is gone after Ben blocks him (not just shown as \"Someone\")");
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'nf_ben' AND blocked_id = 'nf_cal'");
});

test("20 a page with a cursor", async () => {
  for (let i = 0; i < 22; i++) {
    const p = ok(await cal("POST", "/api/posts", { kind: "status", caption: `Page test ${i}`, visibility: "public" }));
    ok(await ben("PUT", `/api/posts/${p.id}/like`));
  }
  const first = await list(cal);
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = await list(cal, first.nextCursor);
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((i: { id: number }) => i.id)).size, 22, "no repeats");
});

test("ends tomorrow: running challenges you joined that end within 24 hours, first page only, not counted", async () => {
  const dee = as(origin, "nf_dee"); // hosts
  const eve = as(origin, "nf_eve"); // joins
  const fay = as(origin, "nf_fay"); // never joins
  for (const [user, handle] of [[dee, "dee"], [eve, "eve"], [fay, "fay"]] as const) await user("PATCH", "/api/profile", { handle: `${handle}.nf`, name: handle });
  const now = Date.now(), hour = 3_600_000;
  const start = async (tag: string, endsIn: number) => ok(await dee("POST", "/api/challenges", { tag, title: tag, description: "", rules: "", startsAt: new Date(now - hour).toISOString(), endsAt: new Date(now + endsIn).toISOString() }));
  await start("NfSoon", 10 * hour);
  await start("NfLater", 72 * hour);
  for (const slug of ["nfsoon", "nflater"]) ok(await eve("PUT", `/api/challenges/${slug}/membership`));

  const first = await list(eve);
  assert.deepEqual(first.reminders.map((r: { slug: string; entered: boolean }) => [r.slug, r.entered]), [["nfsoon", false]], "only the one ending within a day");
  assert.equal(first.unreadCount, await unread(eve), "reminders aren't in the bell number");
  assert.deepEqual((await list(dee)).reminders.map((r: { slug: string }) => r.slug), ["nfsoon"], "the host is a member too");
  assert.deepEqual((await list(fay)).reminders, [], "not for people who didn't join");

  const p = ok(await eve("POST", "/api/posts", { kind: "status", caption: "Made it in time", visibility: "public" }));
  ok(await eve("POST", "/api/challenges/nfsoon/entries", { postId: p.id }));
  assert.equal((await list(eve)).reminders[0].entered, true, "entered now");

  await ownerSql("INSERT INTO sewspace_blocks VALUES ('nf_eve', 'nf_dee')");
  assert.deepEqual((await list(eve)).reminders, [], "nothing across a block with the host");
  assert.deepEqual(await withoutRls("nf_eve", (tx) => endingSoon(tx, viewerFor("nf_eve"))), [], "the module alone agrees");
  await ownerSql("DELETE FROM sewspace_blocks WHERE blocker_id = 'nf_eve' AND blocked_id = 'nf_dee'");
  assert.deepEqual((await withoutRls("nf_fay", (tx) => endingSoon(tx, viewerFor("nf_fay")))), [], "module: only your own memberships");
  const page1 = await list(cal);
  if (page1.nextCursor) assert.deepEqual((await list(cal, page1.nextCursor)).reminders, [], "later pages carry none");
});
