-- Emergency rollback for 0002: removes the read-by-others policies and functions,
-- restoring Phase 0 behaviour (everything owner-only). Columns and the follows
-- and blocks tables are kept. Use together with the previous API build.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0002_visibility.down.sql
BEGIN;
DROP POLICY IF EXISTS visible_image_read ON sewspace_uploads;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sewspace_projects','sewspace_fabrics','sewspace_threads','sewspace_patterns','sewspace_project_steps','sewspace_project_photos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS visible_read ON %I', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS own_follows ON sewspace_follows;
DROP POLICY IF EXISTS own_blocks ON sewspace_blocks;
DROP FUNCTION IF EXISTS sewspace_is_visible_image(text);
DROP FUNCTION IF EXISTS sewspace_can_view(text, text);
DROP FUNCTION IF EXISTS sewspace_blocked_with(text);
DELETE FROM sewspace_schema_migrations WHERE name = '0002_visibility.sql';
COMMIT;
