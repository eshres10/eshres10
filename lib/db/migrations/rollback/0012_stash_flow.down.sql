-- Rollback for 0012: nothing to switch off. fabrics.color_hex and
-- patterns.format are ignored by older API builds and keep their data.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0012_stash_flow.down.sql
BEGIN;
DELETE FROM sewspace_schema_migrations WHERE name = '0012_stash_flow.sql';
COMMIT;
