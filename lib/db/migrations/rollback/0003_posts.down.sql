-- Emergency rollback for 0003: hides all posts from everyone but their authors
-- and restores the Phase 1 image rule. Tables and data are kept.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0003_posts.down.sql
BEGIN;
DROP POLICY IF EXISTS visible_read ON sewspace_posts;
DROP POLICY IF EXISTS visible_read ON sewspace_post_media;
DROP POLICY IF EXISTS visible_read ON sewspace_media;
DROP POLICY IF EXISTS owner_all ON sewspace_posts;
DROP POLICY IF EXISTS owner_all ON sewspace_post_media;
DROP POLICY IF EXISTS owner_all ON sewspace_media;
-- With RLS on and no policies, the app role sees no rows at all (fails closed).
CREATE OR REPLACE FUNCTION sewspace_is_visible_image(path text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    WITH u AS (
      SELECT user_id FROM sewspace_uploads WHERE object_path = path AND purpose = 'image'
    ), url AS (SELECT '/api/storage' || path AS v)
    SELECT EXISTS (
      SELECT 1 FROM u, url WHERE
           EXISTS (SELECT 1 FROM sewspace_fabrics f WHERE f.user_id = u.user_id AND f.image_url = url.v AND sewspace_can_view(f.user_id, f.visibility))
        OR EXISTS (SELECT 1 FROM sewspace_threads t WHERE t.user_id = u.user_id AND t.image_url = url.v AND sewspace_can_view(t.user_id, t.visibility))
        OR EXISTS (SELECT 1 FROM sewspace_patterns pt WHERE pt.user_id = u.user_id AND pt.cover_image_url = url.v AND sewspace_can_view(pt.user_id, pt.visibility))
        OR EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.user_id = u.user_id AND p.cover_image_url = url.v AND sewspace_can_view(p.user_id, p.visibility))
        OR EXISTS (SELECT 1 FROM sewspace_project_photos ph JOIN sewspace_projects p ON p.id = ph.project_id
                   WHERE ph.user_id = u.user_id AND p.user_id = u.user_id AND ph.url = url.v AND sewspace_can_view(p.user_id, p.visibility))
    )
  $$;
DROP FUNCTION IF EXISTS sewspace_owns_media(integer);
DROP FUNCTION IF EXISTS sewspace_media_on_visible_post(integer, text);
DELETE FROM sewspace_schema_migrations WHERE name = '0003_posts.sql';
COMMIT;
