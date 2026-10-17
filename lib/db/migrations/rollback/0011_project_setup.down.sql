-- Rollback for 0011: nothing to switch off. The new columns (projects.garment,
-- projects.setup, patterns.steps) are ignored by older API builds and keep
-- their data. This only forgets that the migration ran.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0011_project_setup.down.sql
BEGIN;
DELETE FROM sewspace_schema_migrations WHERE name = '0011_project_setup.sql';
COMMIT;
