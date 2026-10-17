-- Rollback for 0014: nothing to switch off. sewspace_ideas is private
-- (owner_all only) and ignored by older API builds; its rows stay.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0014_ideas.down.sql
BEGIN;
DELETE FROM sewspace_schema_migrations WHERE name = '0014_ideas.sql';
COMMIT;
