-- Emergency rollback for 0009: switches drafts off for the app (RLS with no
-- policies hides every row). The table and its data are kept.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0009_drafts.down.sql
BEGIN;
DROP POLICY IF EXISTS owner_all ON sewspace_drafts;
DELETE FROM sewspace_schema_migrations WHERE name = '0009_drafts.sql';
COMMIT;
