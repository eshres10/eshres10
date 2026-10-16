import { readFile } from "node:fs/promises";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { withUser } from "@workspace/db";
import { getPublicProfile, HANDLE_PATH_PATTERN, listPublicHandles } from "../access";
import { logger } from "../lib/logger";

// Server-rendered <head> tags for public pages, so search engines and link
// previews see a real title, description and image. The web app is a static
// SPA; Replit's path router sends "/@" and "/sitemap.xml" to this server (see
// artifacts/api-server/.replit-artifact/artifact.toml), which returns the SPA's
// index.html with the tags injected. Assets still come from the static service.

export interface SeoOptions {
  /** Path to the built web index.html. Defaults to WEB_INDEX_HTML or the production build. */
  indexHtmlPath?: string;
  /** Vite dev server to forward other "/@..." requests to in development. */
  viteDevOrigin?: string;
}

const MAX_DESCRIPTION = 160;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function originOf(req: Request): string {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, "");
  const proto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export interface PageMeta {
  title: string;
  description: string;
  canonicalPath: string;
  imageUrl?: string | null;
  type?: "website" | "profile" | "article";
  noindex?: boolean;
}

// Replaces the template's title, description, Open Graph and Twitter tags.
export function injectMeta(html: string, meta: PageMeta, origin: string): string {
  const canonical = origin + meta.canonicalPath;
  const image = meta.imageUrl ? (meta.imageUrl.startsWith("http") ? meta.imageUrl : origin + meta.imageUrl) : null;
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${meta.type ?? "website"}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="SewSpace" />`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    ...(image
      ? [`<meta property="og:image" content="${escapeHtml(image)}" />`, `<meta name="twitter:image" content="${escapeHtml(image)}" />`]
      : []),
    `<meta name="robots" content="${meta.noindex ? "noindex, nofollow" : "index, follow"}" />`,
  ].join("\n    ");
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "");
  return stripped.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

export function createSeoRouter(options: SeoOptions = {}): IRouter {
  const router: IRouter = Router();
  const indexPath =
    options.indexHtmlPath ??
    process.env.WEB_INDEX_HTML ??
    path.resolve(process.cwd(), "artifacts/sewspace/dist/public/index.html");
  const isDev = process.env.NODE_ENV === "development";
  const viteOrigin = options.viteDevOrigin ?? process.env.VITE_DEV_ORIGIN ?? "http://localhost:23614";
  let cached: { html: string; at: number } | null = null;

  // The SPA template: the production build on disk; in development (or if the
  // build is missing) fetched from the web service that serves /index.html.
  async function template(req: Request): Promise<string> {
    if (cached && (!isDev || Date.now() - cached.at < 2000)) return cached.html;
    let html: string | null = null;
    if (!isDev) html = await readFile(indexPath, "utf8").catch(() => null);
    if (!html) {
      const source = isDev ? viteOrigin : originOf(req);
      const response = await fetch(`${source}/index.html`, { headers: { accept: "text/html" } });
      if (!response.ok) throw new Error(`Could not load index.html from ${source} (${response.status})`);
      html = await response.text();
      if (!isDev) logger.warn({ indexPath }, "Web build not found on disk; using index.html from the web service");
    }
    cached = { html, at: Date.now() };
    return html;
  }

  async function sendPage(req: Request, res: Response, meta: PageMeta, status = 200): Promise<void> {
    const html = injectMeta(await template(req), meta, originOf(req));
    res.status(status).type("html").set("Cache-Control", "public, max-age=60").send(html);
  }

  const notFound: PageMeta = {
    title: "Page not found · SewSpace",
    description: "This page doesn't exist or isn't public.",
    canonicalPath: "/",
    noindex: true,
  };

  // In development, Vite serves its own files under /@ (e.g. /@vite/client).
  const viteProxy = isDev ? createProxyMiddleware({ target: viteOrigin, changeOrigin: false, ws: true }) : null;

  router.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!req.path.startsWith("/@")) return next();
    const match = HANDLE_PATH_PATTERN.exec(req.path);
    if (!match) {
      if (viteProxy) return viteProxy(req, res, next);
      return next();
    }
    try {
      const profile = await withUser(req.viewer?.userId ?? null, (db) => getPublicProfile(db, match[1]));
      if (!profile) return sendPage(req, res, notFound, 404);
      await sendPage(req, res, {
        title: `${profile.name} (@${profile.handle}) · SewSpace`,
        description: truncate(profile.bio || `See ${profile.name}'s makes, patterns and projects on SewSpace.`, MAX_DESCRIPTION),
        canonicalPath: `/@${profile.handle}`,
        imageUrl: profile.avatarUrl,
        type: "profile",
      });
    } catch (error) {
      next(error);
    }
  });

  // Served here (not as a static file) so the Sitemap line can be absolute.
  router.get("/robots.txt", (req, res) => {
    const disallow = ["/api/", "/studio", "/settings", "/welcome", "/sign-in", "/sign-up", "/stash/", "/projects", "/measurements", "/assistant", "/ai-studio", "/marketplace"];
    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(["User-agent: *", "Allow: /", ...disallow.map((p) => `Disallow: ${p}`), "", `Sitemap: ${originOf(req)}/sitemap.xml`, ""].join("\n"));
  });

  router.get("/sitemap.xml", async (req, res, next) => {
    try {
      const origin = originOf(req);
      const handles = await withUser(null, (db) => listPublicHandles(db));
      const urls = [
        `<url><loc>${escapeHtml(origin)}/</loc></url>`,
        ...handles.map(
          (h) => `<url><loc>${escapeHtml(`${origin}/@${h.handle}`)}</loc><lastmod>${h.joinedAt.toISOString().slice(0, 10)}</lastmod></url>`,
        ),
      ];
      res
        .type("application/xml")
        .set("Cache-Control", "public, max-age=3600")
        .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
