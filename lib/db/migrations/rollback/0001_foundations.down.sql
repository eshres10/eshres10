-- Emergency rollback for 0001: turns row-level security off again.
-- The new profile columns and uploads table are kept (additive, harmless).
-- Only use this together with redeploying the previous API build, which filtered
-- by user_id in code.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0001_foundations.down.sql
BEGIN;
DROP POLICY IF EXISTS public_avatar_read ON sewspace_uploads;
DROP VIEW IF EXISTS sewspace_public_profiles;
DROP FUNCTION IF EXISTS sewspace_is_public_avatar(text);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sewspace_profiles','sewspace_fabrics','sewspace_threads','sewspace_patterns',
    'sewspace_measurement_profiles','sewspace_projects','sewspace_project_steps','sewspace_project_photos','sewspace_uploads']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DELETE FROM sewspace_schema_migrations WHERE name = '0001_foundations.sql';
COMMIT;
