-- Rollback for 0013: switch off topic photos for the previous API build.
-- The table and its rows stay (no data deletion); only the read paths for
-- media and image files go back to what 0003 allowed.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0013_forum_flow.down.sql
BEGIN;
DROP POLICY IF EXISTS topic_read ON sewspace_media;
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
        OR EXISTS (SELECT 1 FROM sewspace_media m
                   JOIN sewspace_post_media pm ON pm.media_id = m.id
                   JOIN sewspace_posts po ON po.id = pm.post_id
                   WHERE m.user_id = u.user_id AND po.user_id = u.user_id
                     AND (m.full_path = path OR m.thumb_path = path)
                     AND sewspace_can_view(po.user_id, po.visibility))
    )
  $$;
DELETE FROM sewspace_schema_migrations WHERE name = '0013_forum_flow.sql';
COMMIT;
