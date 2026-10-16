import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { as, startApp } from "./harness";

const dir = mkdtempSync(path.join(tmpdir(), "sewspace-seo-"));
const indexHtmlPath = path.join(dir, "index.html");
writeFileSync(indexHtmlPath, `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Sewspace</title>
<meta name="description" content="default" /><meta property="og:title" content="Sewspace" /></head>
<body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`);

const origin = await startApp({ indexHtmlPath });
const ann = as(origin, "user_ann");
const anon = as(origin, null);

test("/@handle returns the SPA with profile meta tags, escaped", async () => {
  await ann("PATCH", "/api/profile", { handle: "ann.sews", name: "Ann <script>", bio: 'Sews "linen" & wool' });
  const res = await anon("GET", "/@ann.sews");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(res.text, /<title>Ann &lt;script&gt; \(@ann\.sews\) · SewSpace<\/title>/);
  assert.match(res.text, /<meta name="description" content="Sews &quot;linen&quot; &amp; wool" \/>/);
  assert.match(res.text, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/@ann\.sews" \/>/);
  assert.doesNotMatch(res.text, /<script>/);
  assert.equal((res.text.match(/<title>/g) ?? []).length, 1, "old title removed");
  assert.match(res.text, /src="\/assets\/index\.js"/, "app scripts kept");
});

test("unknown or invalid handles get a noindex 404 page", async () => {
  const res = await anon("GET", "/@nobody.here");
  assert.equal(res.status, 404);
  assert.match(res.text, /noindex/);
  assert.equal((await anon("GET", "/@vite/client")).status, 404, "non-handle /@ paths are not profile pages");
});

test("sitemap lists profiles with a handle", async () => {
  const res = await anon("GET", "/sitemap.xml");
  assert.equal(res.status, 200);
  assert.match(res.text, /<loc>http:\/\/127\.0\.0\.1:\d+\/@ann\.sews<\/loc>/);
});

test("robots.txt keeps private areas out and points at the sitemap", async () => {
  const res = await anon("GET", "/robots.txt");
  assert.equal(res.status, 200);
  assert.match(res.text, /Disallow: \/studio/);
  assert.match(res.text, /Disallow: \/api\//);
  assert.match(res.text, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
});
