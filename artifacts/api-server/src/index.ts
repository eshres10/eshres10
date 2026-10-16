import { migrate } from "@workspace/db/migrate";
import { createApp } from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Apply pending database migrations before taking traffic. If one fails the
// server does not start (fail closed) — see lib/db/migrations/rollback.
await migrate(process.env.DATABASE_URL!, (message) => logger.info(message));

createApp().listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
