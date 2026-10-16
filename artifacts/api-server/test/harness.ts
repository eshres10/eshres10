// Shared setup for API tests: a throwaway Postgres database with all
// migrations applied, the Express app with a test-only auth stub (the
// x-test-user header names the signed-in Clerk user), and a fake object store.
import { after } from "node:test";
import type { AddressInfo } from "node:net";
import pg from "pg";

const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error("Set TEST_DATABASE_URL to a Postgres server you can create databases on");

const dbName = `sewspace_api_test_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`CREATE DATABASE ${dbName}`);
const url = `${base.replace(/\/[^/]*$/, "")}/${dbName}`;

process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.ADMIN_USER_IDS = "user_admin";
// The OpenAI integration refuses to load without these; no test calls it.
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test";

const { migrate } = await import("@workspace/db/migrate");
await migrate(url, () => {});
const dbModule = await import("@workspace/db");
const { createApp } = await import("../src/app");

/** Objects "stored" by the fake storage, keyed by object path. */
export const storedObjects = new Map<string, { body: string | Buffer; contentType: string }>();
const { ObjectNotFoundError } = await import("../src/lib/objectStorage");
let uploadCounter = 0;

const fakeStorage = {
  async getObjectEntityUploadURL() {
    uploadCounter += 1;
    return `https://storage.test/bucket/private/uploads/test-${process.pid}-${uploadCounter}?signed=1`;
  },
  normalizeObjectEntityPath(raw: string) {
    const match = /\/uploads\/([^?]+)/.exec(raw);
    return `/objects/uploads/${match?.[1] ?? "unknown"}`;
  },
  async getObjectEntityFile(objectPath: string) {
    return { objectPath };
  },
  async downloadObject(file: { objectPath: string }) {
    const obj = storedObjects.get(file.objectPath) ?? { body: "file", contentType: "image/webp" };
    return new Response(typeof obj.body === "string" ? obj.body : new Uint8Array(obj.body), { headers: { "Content-Type": obj.contentType, "Cache-Control": "private, max-age=3600" } });
  },
  async searchPublicObject() {
    return null;
  },
  async readObjectEntity(objectPath: string) {
    const obj = storedObjects.get(objectPath);
    if (!obj) throw new ObjectNotFoundError();
    return Buffer.isBuffer(obj.body) ? obj.body : Buffer.from(obj.body);
  },
  async saveObjectEntity(data: Buffer, contentType: string, directory = "generated") {
    uploadCounter += 1;
    const objectPath = `/objects/${directory}/saved-${process.pid}-${uploadCounter}.webp`;
    storedObjects.set(objectPath, { body: data, contentType });
    return objectPath;
  },
};

export interface HarnessOptions {
  indexHtmlPath?: string;
}

export async function startApp(options: HarnessOptions = {}) {
  const app = createApp({
    testUserId: (req) => req.get("x-test-user") || null,
    seo: { indexHtmlPath: options.indexHtmlPath },
  });
  app.locals.objectStorage = fakeStorage;
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return origin;
}

/** Fetch as a user (null = signed out). JSON bodies are encoded for you. */
export function as(origin: string, user: string | null) {
  return async (method: string, path: string, body?: unknown) => {
    const response = await fetch(origin + path, {
      method,
      headers: {
        ...(user ? { "x-test-user": user } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text, headers: response.headers };
  };
}

/**
 * Run fn as the database owner with app.user_id set but WITHOUT switching to
 * the RLS role, so row-level security is bypassed. Lets tests prove the access
 * module enforces the rules on its own.
 */
export async function withoutRls<T>(userId: string | null, fn: (tx: any) => Promise<T>): Promise<T> {
  const { sql } = await import("drizzle-orm");
  return dbModule.ownerDb.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId ?? ""}, true)`);
    return fn(tx);
  });
}

/** Run SQL as the database owner (bypasses RLS), for test setup only. */
export async function ownerSql(text: string, params: unknown[] = []) {
  return dbModule.pool.query(text, params);
}

after(async () => {
  await dbModule.pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
