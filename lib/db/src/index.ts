import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Owner connection: bypasses row-level security. Only for migrations and
// maintenance scripts; request handlers must use withUser().
export const ownerDb = drizzle(pool, { schema });

export type Tx = Parameters<Parameters<typeof ownerDb.transaction>[0]>[0];

// Runs fn in a transaction as the sewspace_app role with app.user_id set to the
// caller (null when signed out), so every query is filtered by RLS policies.
export function withUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>, options: { isAdmin?: boolean } = {}): Promise<T> {
  return ownerDb.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE sewspace_app`);
    // app.is_admin: admins (ADMIN_USER_IDS, decided by the API) may review reports (migration 0005).
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId ?? ""}, true), set_config('app.is_admin', ${userId && options.isAdmin ? "on" : ""}, true)`);
    return fn(tx);
  });
}

export * from "./schema";
