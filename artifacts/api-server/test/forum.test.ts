import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { as, ownerSql, startApp, storedObjects, withoutRls } from "./harness";

process.env.ADMIN_USER_IDS = "q_adm";
const { getTopic, listReplies, viewerFor } = await import("../src/access");

// Phase 7: the forum. Topics of every kind, replies, upvotes, accepted
// answers, polls (hidden results), moderation, discussions on pages and makes,
// reports and blocks.
const dir = mkdtempSync(path.join(tmpdir(), "sewspace-forum-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><title>Seams Club</title></head><body></body></html>`);
const origin = await startApp({ indexHtmlPath });

const ask = as(origin, "q_ask");
const help = as(origin, "q_help");
const oth = as(origin, "q_oth");
const blk = as(origin, "q_blk"); // Ask blocked them
const adm = as(origin, "q_adm");
const nob = as(origin, "q_nob");
const anon = as(origin, null);
for (const [user, handle] of [[ask, "ask"], [help, "help"], [oth, "oth"], [blk, "blk"], [adm, "adm"]] as const) {
  await user("PATCH", "/api/profile", { handle: `${handle}.frm`, name: handle });
}
await nob("GET", "/api/profile");
await ownerSql("INSERT INTO sewspace_blocks VALUES ('q_ask', 'q_blk')");
const ownMake = (await ask("POST", "/api/projects", { name: "Linen slip dress", visibility: "private" })).json;
const othMake = (await oth("POST", "/api/projects", { name: "Oth make" })).json;
const page = (await ask("POST", "/api/catalog", { kind: "pattern", name: "Harbour Slip Dress", maker: "Tidewater", category: "dresses" })).json;
const product = (await help("POST", "/api/catalog", { kind: "product", name: "Weights", maker: "Clover", category: "tools" })).json;

const ids: Record<string, number> = {};
test("starting topics", async () => {
  const base = { board: "fabric", kind: "question", title: "How do I stop linen shifting while I cut?", body: "Midweight washed linen, size 18." };
  assert.equal((await anon("POST", "/api/forum/topics", base)).status, 401);
  assert.equal((await nob("POST", "/api/forum/topics", base)).status, 409);
  assert.equal((await ask("POST", "/api/forum/topics", { ...base, tags: ["has space!"] })).status, 400);
  assert.equal((await ask("POST", "/api/forum/topics", { ...base, makeId: othMake.id })).status, 400, "not your make");
  const q = await ask("POST", "/api/forum/topics", { ...base, tags: ["#Linen", "Cutting tips"], catalogId: page.id, makeId: ownMake.id });
  assert.equal(q.status, 201, q.text);
  assert.deepEqual(q.json.tags, ["linen", "cutting-tips"]);
  assert.equal(q.json.catalog.slug, "tidewater-harbour-slip-dress");
  ids.question = q.json.id;
  assert.equal((await ask("POST", "/api/forum/topics", { board: "machines", kind: "poll", title: "Which closure?", pollOptions: ["Zip"] })).status, 400, "two options at least");
  const poll = await ask("POST", "/api/forum/topics", { board: "machines", kind: "poll", title: "Which trouser closure do you trust?", pollOptions: ["Fly zip", "Buttons", "Side zip"], pollDays: 3 });
  assert.equal(poll.status, 201, poll.text);
  ids.poll = poll.json.id;
  const up = await help("POST", "/api/storage/uploads/request-url", { name: "p.jpg", size: 1000, contentType: "image/jpeg" });
  storedObjects.set(up.json.objectPath, { body: await sharp({ create: { width: 400, height: 500, channels: 3, background: "#335577" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
  const media = await help("POST", "/api/media", { objectPath: up.json.objectPath });
  const show = await help("POST", "/api/forum/topics", { board: "mending", kind: "show_tell", title: "Visible mending on my oldest jeans", body: "Sashiko patches.", shareToFeed: true, mediaIds: [media.json.id] });
  assert.equal(show.status, 201, show.text);
  assert.equal(show.json.post.caption, "Visible mending on my oldest jeans\n\nSashiko patches.");
  assert.equal((await anon("GET", `/api/public/posts/${show.json.post.id}`)).json.visibility, "public", "shared to the feed");
  ids.show = show.json.id;
  ids.rec = (await oth("POST", "/api/forum/topics", { board: "machines", kind: "recommendation", title: "Best pattern weights?" })).json.id;
  ids.info = (await help("POST", "/api/forum/topics", { board: "beginners", kind: "info", title: "Guide: how to pre-wash every fibre", body: "Wool: cold, gentle." })).json.id;
  ids.blocked = (await blk("POST", "/api/forum/topics", { board: "fabric", kind: "question", title: "Topic from someone Ask blocked" })).json.id;
});

test("lists, filters, search and counts", async () => {
  const list = async (user: ReturnType<typeof as>, qs = "") => (await user("GET", `/api/public/forum/topics${qs}`)).json.items.map((t: { id: number }) => t.id);
  assert.equal((await list(anon)).length, 6);
  assert.deepEqual(await list(anon, "?filter=question"), [ids.blocked, ids.question]);
  assert.deepEqual(await list(anon, "?board=beginners"), [ids.info]);
  assert.deepEqual(await list(anon, "?q=pre-wash"), [ids.info]);
  assert.deepEqual(await list(anon, "?q=100%25_"), [], "wildcards are literal");
  assert.ok(!(await list(ask)).includes(ids.blocked), "blocked people's topics are hidden");
  assert.ok(!(await list(blk)).some((id: number) => [ids.question, ids.poll].includes(id)), "both ways");
  const overview = (await anon("GET", "/api/public/forum/overview")).json;
  assert.equal(overview.total, 6);
  assert.equal(overview.kinds.find((k: { kind: string }) => k.kind === "question").count, 2);
  assert.equal(overview.boards.find((b: { board: string }) => b.board === "machines").count, 2);
  assert.equal((await ask("GET", "/api/public/forum/overview")).json.total, 5);
  assert.equal((await blk("GET", `/api/public/forum/topics/${ids.question}`)).status, 404);
});

let answer = 0;
test("replies, upvotes and the accepted answer", async () => {
  const r = await help("POST", `/api/forum/topics/${ids.question}/replies`, { body: "Spray-starch and press it first, then pattern weights." });
  assert.equal(r.status, 201, r.text);
  answer = r.json.id;
  const nested = await ask("POST", `/api/forum/topics/${ids.question}/replies`, { body: "Thank you!", parentId: answer });
  assert.equal(nested.status, 201);
  assert.equal((await oth("POST", `/api/forum/topics/${ids.question}/replies`, { body: "deeper", parentId: nested.json.id })).status, 400);
  await oth("POST", `/api/forum/topics/${ids.question}/replies`, { body: "Cut single layer." });
  assert.equal((await blk("POST", `/api/forum/topics/${ids.question}/replies`, { body: "x" })).status, 404, "across a block");
  assert.equal((await anon("POST", `/api/forum/topics/${ids.question}/replies`, { body: "x" })).status, 401);

  assert.deepEqual((await oth("PUT", `/api/forum/votes/topic/${ids.question}`)).json, { voted: true, votes: 1 });
  assert.equal((await ask("PUT", `/api/forum/votes/topic/${ids.question}`)).status, 400, "not your own");
  assert.deepEqual((await oth("PUT", `/api/forum/votes/reply/${answer}`)).json, { voted: true, votes: 1 });

  assert.equal((await help("PUT", `/api/forum/topics/${ids.question}/accepted`, { replyId: answer })).status, 404, "only the asker");
  const accepted = await ask("PUT", `/api/forum/topics/${ids.question}/accepted`, { replyId: answer });
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.json.solved, true);
  assert.equal(accepted.json.acceptedAnswer.author, "help.frm");
  assert.equal((await ask("PUT", `/api/forum/topics/${ids.poll}/accepted`, { replyId: answer })).status, 400, "not a reply in that topic");

  const replies = (await anon("GET", `/api/public/forum/topics/${ids.question}/replies`)).json;
  assert.equal(replies[0].id, answer, "accepted answer first");
  assert.equal(replies[0].accepted, true);
  assert.equal(replies[0].replies.length, 1);
  assert.deepEqual((await anon("GET", "/api/public/forum/topics?filter=solved")).json.items.map((t: { id: number }) => t.id), [ids.question]);
  assert.ok(!(await anon("GET", "/api/public/forum/topics?sort=unanswered")).json.items.some((t: { id: number }) => t.id === ids.question));
  const topic = (await anon("GET", `/api/public/forum/topics/${ids.question}`)).json;
  assert.deepEqual([topic.replies, topic.votes, topic.make], [3, 1, null], "the private make stays hidden");
  assert.equal((await ask("GET", `/api/public/forum/topics/${ids.question}`)).json.make.id, ownMake.id);
  assert.deepEqual((await anon("GET", "/api/public/forum/helpers")).json.map((h: { person: { handle: string }; accepted: number }) => [h.person.handle, h.accepted]), [["help.frm", 1]]);
});

test("polls hide results until you vote", async () => {
  const before = (await oth("GET", `/api/public/forum/topics/${ids.poll}`)).json.poll;
  assert.deepEqual([before.revealed, before.total, before.options.map((o: { votes: unknown }) => o.votes)], [false, 0, [null, null, null]]);
  const voted = await oth("PUT", `/api/forum/topics/${ids.poll}/poll`, { optionId: before.options[1].id });
  assert.equal(voted.status, 200, voted.text);
  assert.deepEqual([voted.json.revealed, voted.json.myOptionId, voted.json.options.map((o: { votes: number }) => o.votes)], [true, before.options[1].id, [0, 1, 0]]);
  const changed = (await oth("PUT", `/api/forum/topics/${ids.poll}/poll`, { optionId: before.options[0].id })).json;
  assert.deepEqual(changed.options.map((o: { votes: number }) => o.votes), [1, 0, 0], "votes change while open");
  const notYet = (await help("GET", `/api/public/forum/topics/${ids.poll}`)).json.poll;
  assert.deepEqual([notYet.revealed, notYet.total, notYet.options[0].votes], [false, 1, null]);
  assert.equal((await ask("GET", `/api/public/forum/topics/${ids.poll}`)).json.poll.revealed, true, "the author sees results");
  assert.equal((await help("PUT", `/api/forum/topics/${ids.poll}/poll`, { optionId: 999999 })).status, 400);
  await ownerSql("UPDATE sewspace_forum_topics SET poll_closes_at = now() - interval '1 minute' WHERE id = $1", [ids.poll]);
  assert.equal((await help("PUT", `/api/forum/topics/${ids.poll}/poll`, { optionId: before.options[0].id })).status, 400, "closed");
  const closed = (await anon("GET", `/api/public/forum/topics/${ids.poll}`)).json.poll;
  assert.deepEqual([closed.open, closed.revealed, closed.options[0].votes], [false, true, 1]);
});

test("recommendations count pages named in replies", async () => {
  await help("POST", `/api/forum/topics/${ids.rec}/replies`, { body: "Clover weights", catalogId: product.id });
  await ask("POST", `/api/forum/topics/${ids.rec}/replies`, { body: "Same, Clover", catalogId: product.id });
  const rec = (await anon("GET", `/api/public/forum/topics/${ids.rec}`)).json;
  assert.deepEqual(rec.topRecommendations.map((r: { catalog: { slug: string }; count: number }) => [r.catalog.slug, r.count]), [["clover-weights", 2]]);
});

test("admins pin and lock", async () => {
  assert.equal((await ask("POST", `/api/forum/topics/${ids.info}/moderate`, { pinned: true })).status, 403);
  const pinned = await adm("POST", `/api/forum/topics/${ids.info}/moderate`, { pinned: true, locked: true });
  assert.equal(pinned.status, 200, pinned.text);
  assert.deepEqual([pinned.json.pinned, pinned.json.locked], [true, true]);
  assert.equal((await anon("GET", "/api/public/forum/topics")).json.items[0].id, ids.info, "pinned first in Hot");
  assert.equal((await oth("POST", `/api/forum/topics/${ids.info}/replies`, { body: "late" })).status, 403);
  assert.equal((await adm("GET", `/api/public/forum/topics/${ids.info}`)).json.canModerate, true);
  assert.equal((await anon("GET", `/api/public/forum/topics/${ids.info}`)).json.canModerate, false);
});

test("discussions on a pattern page and on a make", async () => {
  assert.deepEqual((await anon("GET", `/api/public/forum/discussions?catalogId=${page.id}`)).json.map((t: { id: number }) => t.id), [ids.question]);
  assert.deepEqual((await anon("GET", `/api/public/forum/discussions?makeId=${ownMake.id}`)).json, [], "private make: nothing");
  assert.deepEqual((await ask("GET", `/api/public/forum/discussions?makeId=${ownMake.id}`)).json.map((t: { id: number }) => t.id), [ids.question]);
});

test("reports, deletes and blocks", async () => {
  const blkReply = await blk("POST", `/api/forum/topics/${ids.info}/replies`, { body: "nope" });
  assert.equal(blkReply.status, 403, "locked");
  const r = await oth("POST", "/api/reports", { targetKind: "forum_reply", targetId: String(answer), reason: "spam" });
  assert.equal(r.status, 201, r.text);
  const report = (await adm("GET", "/api/admin/reports")).json.find((x: { id: number }) => x.id === r.json.id);
  assert.equal(report.target.link, `/forum/topics/${ids.question}#reply-${answer}`);
  await adm("POST", `/api/admin/reports/${r.json.id}/resolve`, { action: "remove" });
  const after = (await anon("GET", `/api/public/forum/topics/${ids.question}`)).json;
  assert.deepEqual([after.solved, after.replies], [false, 1], "removing the accepted answer unsolves (its reply went too)");
  assert.equal((await oth("DELETE", `/api/forum/topics/${ids.show}`)).status, 404, "not yours");
  assert.equal((await help("DELETE", `/api/forum/topics/${ids.show}`)).status, 204);
  assert.equal((await ask("POST", "/api/reports", { targetKind: "topic", targetId: String(ids.blocked), reason: "spam" })).status, 404, "hidden across a block");
});

test("page HTML and sitemap", async () => {
  const html = await fetch(`${origin}/forum/topics/${ids.question}`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<title>How do I stop linen shifting while I cut\? · Question · Seams Club forum<\/title>/);
  assert.equal((await fetch(`${origin}/forum`)).status, 200);
  assert.equal((await fetch(`${origin}/forum/topics/999999`)).status, 404);
  assert.match(await (await fetch(`${origin}/sitemap.xml`)).text(), new RegExp(`/forum/topics/${ids.question}<`));
});

test("module alone: blocks and private makes hold without RLS", async () => {
  await ownerSql("INSERT INTO sewspace_forum_replies (topic_id, user_id, body) VALUES ($1, 'q_blk', 'hidden from Ask')", [ids.rec]);
  const forAsk = await withoutRls("q_ask", (tx) => listReplies(tx, viewerFor("q_ask"), ids.rec));
  assert.ok(forAsk?.every((r) => r.author.handle !== "blk.frm"));
  assert.equal(await withoutRls("q_ask", (tx) => getTopic(tx, viewerFor("q_ask"), ids.blocked)), null);
  const signedOut = await withoutRls(null, (tx) => getTopic(tx, viewerFor(null), ids.question));
  assert.equal(signedOut?.make, null);
});
