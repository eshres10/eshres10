-- Emergency rollback for 0006: switches catalog pages, reviews and votes off
-- for the app (RLS with no policies hides every row). Tables, links and data
-- are kept. The widened report check stays (it only allows more).
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0006_catalog.down.sql
BEGIN;
DROP POLICY IF EXISTS public_read ON sewspace_catalog;
DROP POLICY IF EXISTS own_insert ON sewspace_catalog;
DROP POLICY IF EXISTS editor_update ON sewspace_catalog;
DROP POLICY IF EXISTS visible_read ON sewspace_reviews;
DROP POLICY IF EXISTS owner_all ON sewspace_reviews;
DROP POLICY IF EXISTS admin_delete ON sewspace_reviews;
DROP POLICY IF EXISTS own_votes ON sewspace_review_votes;
DROP FUNCTION IF EXISTS sewspace_catalog_stats(integer[]);
DROP FUNCTION IF EXISTS sewspace_review_helpful(integer[]);
DELETE FROM sewspace_schema_migrations WHERE name = '0006_catalog.sql';
COMMIT;
