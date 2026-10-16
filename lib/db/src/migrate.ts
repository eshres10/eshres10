// Applies lib/db/migrations/*.sql in name order, each in its own transaction.
// Applied migrations are recorded in sewspace_schema_migrations.
//
// Databases created before migrations existed (by `drizzle-kit push`) already
// contain the baseline tables: on those, 0000_baseline is recorded as applied
// without running it.
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
      try {
        await client.query(sql);
        await client.query("INSERT INTO sewspace_schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    if (!applied.length) log("database is up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('sewspace_migrations'))").catch(() => {});
    await client.end();
  }
  return applied;
}
