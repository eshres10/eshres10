-- Rollback for 0017: one read-only function that older API builds never call.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0017_pattern_page.down.sql
BEGIN;
DROP FUNCTION IF EXISTS sewspace_catalog_review_numbers(integer);
DELETE FROM sewspace_schema_migrations WHERE name = '0017_pattern_page.sql';
COMMIT;
