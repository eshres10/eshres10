// `pnpm --filter @workspace/db run migrate`: applies pending migrations to DATABASE_URL.
import { migrate } from "./migrate";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}
migrate(process.env.DATABASE_URL).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
