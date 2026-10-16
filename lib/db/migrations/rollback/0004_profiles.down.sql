-- Emergency rollback for 0004: profiles show to blocked people again (the
-- Phase 2 behaviour) and the count functions go away. No data is touched.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0004_profiles.down.sql
BEGIN;
CREATE OR REPLACE VIEW sewspace_public_profiles WITH (security_barrier) AS
  SELECT user_id, handle, name, bio, avatar_url, created_at
  FROM sewspace_profiles
  WHERE handle IS NOT NULL;
CREATE OR REPLACE FUNCTION sewspace_is_public_avatar(path text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM sewspace_profiles p
      JOIN sewspace_uploads u ON u.object_path = path AND u.user_id = p.user_id
      WHERE p.handle IS NOT NULL
        AND u.purpose = 'avatar'
        AND p.avatar_url = '/api/storage' || path
    )
  $$;
DROP FUNCTION IF EXISTS sewspace_follow_counts(text);
DROP FUNCTION IF EXISTS sewspace_followers_only_counts(text);
DELETE FROM sewspace_schema_migrations WHERE name = '0004_profiles.sql';
COMMIT;
