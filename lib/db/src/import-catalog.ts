// One-off import of free pattern pages into the shared directory (owner decision:
// list free indie patterns by name, designer and link; no photos, files or copied
// descriptions). Runs as an admin under RLS, exactly like adding pages by hand,
// so pages belong to that person and can be corrected or deleted by them.
//
//   pnpm --filter @workspace/db run import-catalog seed/free-patterns.json            dry run
//   pnpm --filter @workspace/db run import-catalog seed/free-patterns.json --apply    add the pages
//   pnpm --filter @workspace/db run import-catalog seed/free-patterns.json --undo     remove them again
//
// The admin is --handle <your @handle>, --as <clerk user id>, or the first id in ADMIN_USER_IDS.
// Existing pages (same designer + name) are left alone. --undo only removes pages
// this admin created that nobody else uses yet (the same rule as deleting by hand).
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

interface Row { name: string; maker: string; category: string; sizes: string | null; fabricTypes: string | null; url: string; description: string; slug: string }

const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = args.find((a, i) => !a.startsWith("--") && !["--as", "--handle"].includes(args[i - 1]));
const apply = args.includes("--apply");
const undo = args.includes("--undo");
const handle = option("--handle")?.replace(/^@/, "").toLowerCase();

// Plain messages instead of a stack trace: this is run by hand in the Shell.
function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}
if (!file) fail("Usage: import-catalog <file.json> [--apply | --undo] [--handle <your @handle> | --as <user id>]");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set: run this in the Replit Shell, where the database is connected.");

const rows: Row[] = JSON.parse(readFileSync(path.resolve(process.cwd(), file), "utf8"));
const CATEGORIES = new Set(["dresses", "tops", "trousers", "skirts", "jumpsuits", "outerwear", "knitwear", "lingerie", "activewear", "menswear", "kids", "bags", "accessories", "home", "other"]);
for (const r of rows) {
  if (!r.name || !r.slug || !/^https:\/\//.test(r.url) || !CATEGORIES.has(r.category)) throw new Error(`Bad row: ${JSON.stringify(r)}`);
  if (/\.pdf(\?|$)/i.test(r.url)) throw new Error(`Links must go to the designer's page, not a file: ${r.url}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect().catch((e) => fail(`Can't reach the database: ${e.message}`));
let asUser = option("--as") ?? (handle ? undefined : (process.env.ADMIN_USER_IDS ?? "").split(",")[0]?.trim());
if (handle) {
  const found = await client.query<{ user_id: string }>("SELECT user_id FROM sewspace_profiles WHERE lower(handle) = $1", [handle]);
  if (!found.rows[0]) { await client.end(); fail(`No profile with the handle @${handle} in this database. Sign in to this copy of the site once and pick that handle, or check the spelling.`); }
  asUser = found.rows[0].user_id;
}
if (!asUser) { await client.end(); fail("Who should own the pages? Add --handle <your @handle> (for example --handle ena.shrestha)."); }
try {
  await client.query("BEGIN");
  // The same role and user setting as every app request, so RLS applies.
  await client.query("SET LOCAL ROLE sewspace_app");
  await client.query("SELECT set_config('app.user_id', $1, true)", [asUser]);
  const slugs = rows.map((r) => r.slug);
  const existing = new Set((await client.query<{ slug: string }>("SELECT slug FROM sewspace_catalog WHERE kind = 'pattern' AND slug = ANY($1)", [slugs])).rows.map((r) => r.slug));

  if (undo) {
    const mine = await client.query<{ slug: string }>("SELECT slug FROM sewspace_catalog WHERE kind = 'pattern' AND slug = ANY($1) AND created_by = $2", [slugs, asUser]);
    const gone = await client.query("DELETE FROM sewspace_catalog WHERE kind = 'pattern' AND slug = ANY($1) AND created_by = $2", [slugs, asUser]);
    console.log(`${gone.rowCount} pages removed; ${mine.rowCount! - gone.rowCount!} kept because someone else already uses them.`);
  } else {
    let added = 0;
    for (const r of rows) {
      if (existing.has(r.slug)) continue;
      const res = await client.query(
        `INSERT INTO sewspace_catalog (kind, slug, name, maker, category, sizes, fabric_types, url, description, source, created_by)
         VALUES ('pattern', $1, $2, $3, $4, $5, $6, $7, $8, 'free', $9) ON CONFLICT (kind, slug) DO NOTHING`,
        [r.slug, r.name, r.maker, r.category, r.sizes, r.fabricTypes, r.url, r.description, asUser],
      );
      added += res.rowCount ?? 0;
    }
    console.log(`${added} pages ${apply ? "added" : "would be added"}; ${existing.size} already there (left as they are).`);
  }
  await client.query(apply || undo ? "COMMIT" : "ROLLBACK");
  if (!apply && !undo) console.log("Dry run: nothing was saved. Add --apply to save.");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  const err = e as { message?: string; code?: string };
  fail(err.code === "42704" ? "The database role sewspace_app is missing: run the app once (it runs the migrations) or `pnpm --filter @workspace/db run migrate`, then try again."
    : err.code === "42P01" ? "The catalog table isn't there yet: run `pnpm --filter @workspace/db run migrate` first."
    : `Import failed, nothing was saved: ${err.message}`);
} finally {
  await client.end();
}
