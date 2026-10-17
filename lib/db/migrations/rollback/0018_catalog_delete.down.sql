-- Rollback for 0018: takes the delete permission away again (no data changes).
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0018_catalog_delete.down.sql
BEGIN;
DROP POLICY IF EXISTS creator_delete ON sewspace_catalog;
REVOKE DELETE ON sewspace_catalog FROM sewspace_app;
DROP FUNCTION IF EXISTS sewspace_catalog_used_by_others(integer);
DELETE FROM sewspace_schema_migrations WHERE name = '0018_catalog_delete.sql';
COMMIT;
