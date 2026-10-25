// Applies lib/db/migrations/*.sql in name order, each in its own transaction.
// Applied migrations are recorded in sewspace_schema_migrations.
//
// Databases created before migrations existed (by `drizzle-kit push`) already
// contain the baseline tables: on those, 0000_baseline is recorded as applied
// without running it.
//
// Replit's Publish copies the development schema into production but not the
// rows of sewspace_schema_migrations, and not our role or (perhaps) its grants.
// So a production database can hold every table while recording no migration.
// Then each migration is replayed statement by statement: a statement that
// fails only because its object already exists (table, column, policy,
// trigger, constraint, index) is skipped, and everything else (the role,
// grants, functions, views, anything the copy left out) runs as usual.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// The SQL files live in lib/db/migrations. When the API is bundled by esbuild,
// import.meta.url points into artifacts/api-server/dist, so also look relative
// to the working directory (the repo root on Replit). SEWSPACE_MIGRATIONS_DIR overrides.
function migrationsDir(): string {
  const candidates = [
    process.env.SEWSPACE_MIGRATIONS_DIR,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations"),
    path.resolve(process.cwd(), "lib/db/migrations"),
    path.resolve(process.cwd(), "../../lib/db/migrations"),
  ].filter((dir): dir is string => Boolean(dir));
  const found = candidates.find((dir) => existsSync(path.join(dir, BASELINE)));
  if (!found) throw new Error(`Could not find lib/db/migrations (looked in ${candidates.join(", ")})`);
  return found;
}
const BASELINE = "0000_baseline.sql";

// "Already exists" errors that replaying a copied schema may hit: duplicate
// schema, table/index/view, column, function, and object (policy, trigger,
// constraint, role).
const ALREADY_THERE = new Set(["42P06", "42P07", "42701", "42723", "42710"]);
// An early CREATE OR REPLACE of a view or function can't turn the copied (newer)
// one back into its older shape (fewer columns, another return type); the
// migration that last defines it runs normally and sets the final version.
const NEWER_THERE = new Set(["42P16", "42P13"]);
const REPLACES = /\bCREATE\s+OR\s+REPLACE\s+(VIEW|FUNCTION)\b/i;

/** Splits a migration into statements: respects quotes, comments and $tag$ bodies. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0, i = 0;
  while (i < sql.length) {
    const c = sql[i], next = sql[i + 1];
    if (c === "-" && next === "-") { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; continue; }
    if (c === "/" && next === "*") { const end = sql.indexOf("*/", i + 2); i = end < 0 ? sql.length : end + 2; continue; }
    if (c === "'" || c === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === c && sql[i + 1] === c) { i += 2; continue; }
        if (sql[i] === c) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) { const end = sql.indexOf(tag, i + tag.length); i = end < 0 ? sql.length : end + tag.length; continue; }
    }
    if (c === ";") {
      const stmt = sql.slice(start, i).trim();
      if (stmt) out.push(stmt);
      start = i + 1;
    }
    i++;
  }
  const rest = sql.slice(start).trim();
  if (rest && splitStatements.hasCode(rest)) out.push(rest);
  return out;
}
splitStatements.hasCode = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().length > 0;

/** Runs a migration on a copied schema: objects that already exist are skipped. */
async function replay(client: pg.Client, sql: string): Promise<number> {
  let skipped = 0;
  for (const stmt of splitStatements(sql)) {
    if (!splitStatements.hasCode(stmt)) continue;
    await client.query("SAVEPOINT stmt");
    try {
      await client.query(stmt);
      await client.query("RELEASE SAVEPOINT stmt");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (!ALREADY_THERE.has(code) && !(NEWER_THERE.has(code) && REPLACES.test(stmt))) throw err;
      await client.query("ROLLBACK TO SAVEPOINT stmt");
      skipped++;
    }
  }
  return skipped;
}

export async function migrate(connectionString: string, log = console.log): Promise<string[]> {
  const dir = migrationsDir();
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    // Serialise concurrent runs (e.g. two deploys starting at once).
    await client.query("SELECT pg_advisory_lock(hashtext('sewspace_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sewspace_schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM sewspace_schema_migrations")).rows.map((r) => r.name),
    );

    // A schema copied by Replit's Publish: tables from later migrations, but nothing recorded.
    const copied = done.size === 0
      && Boolean((await client.query("SELECT to_regclass('public.sewspace_posts') AS t")).rows[0].t);
    if (copied) log("tables exist but no migration is recorded (a copied schema): replaying migrations, skipping what already exists");

    if (!done.has(BASELINE)) {
      const { rows } = await client.query("SELECT to_regclass('public.sewspace_profiles') AS t");
      if (rows[0].t) {
        await client.query("INSERT INTO sewspace_schema_migrations (name) VALUES ($1)", [BASELINE]);
        done.add(BASELINE);
        log(`marked ${BASELINE} as applied (tables already exist)`);
      }
    }

    const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      let skipped = 0;
      try {
        if (copied) skipped = await replay(client, sql);
        else await client.query(sql);
        await client.query("INSERT INTO sewspace_schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(copied ? `replayed ${file} (${skipped} already there)` : `applied ${file}`);
    }
    if (!applied.length) log("database is up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('sewspace_migrations'))").catch(() => {});
    await client.end();
  }
  return applied;
}
