-- Phase F4: Start a forum discussion. Additive only.

-- Show & tell photos belong to the topic itself, so they show on the thread
-- whether or not it was also shared to the feed. The same processed media
-- (sewspace_media) can also be on the feed post.
CREATE TABLE IF NOT EXISTS sewspace_forum_topic_media (
  topic_id integer NOT NULL REFERENCES sewspace_forum_topics(id) ON DELETE CASCADE,
  media_id integer NOT NULL REFERENCES sewspace_media(id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 9),
  PRIMARY KEY (topic_id, media_id)
);
CREATE INDEX IF NOT EXISTS sewspace_forum_topic_media_media ON sewspace_forum_topic_media (media_id);
GRANT SELECT, INSERT, DELETE ON sewspace_forum_topic_media TO sewspace_app;
ALTER TABLE sewspace_forum_topic_media ENABLE ROW LEVEL SECURITY;

-- Topic photos follow their topic: public, except across a block. Only the
-- topic's author attaches photos, and only their own processed media.
DROP POLICY IF EXISTS owner_all ON sewspace_forum_topic_media;
CREATE POLICY owner_all ON sewspace_forum_topic_media TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id AND t.user_id = sewspace_current_user_id())
    AND sewspace_owns_media(media_id)
  );
DROP POLICY IF EXISTS visible_read ON sewspace_forum_topic_media;
CREATE POLICY visible_read ON sewspace_forum_topic_media FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id AND t.user_id = sewspace_forum_topic_media.user_id
                 AND NOT sewspace_blocked_with(t.user_id)));

-- The media rows themselves: readable when on a topic the viewer may see.
-- SECURITY DEFINER so the media policy doesn't read the topic tables under
-- their own RLS (same pattern as sewspace_media_on_visible_post).
CREATE OR REPLACE FUNCTION sewspace_media_on_visible_topic(m_id integer, owner_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM sewspace_forum_topic_media tm JOIN sewspace_forum_topics t ON t.id = tm.topic_id
      WHERE tm.media_id = m_id AND tm.user_id = owner_id AND t.user_id = owner_id AND NOT sewspace_blocked_with(owner_id)
    )
  $$;
REVOKE ALL ON FUNCTION sewspace_media_on_visible_topic(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_media_on_visible_topic(integer, text) TO sewspace_app;
DROP POLICY IF EXISTS topic_read ON sewspace_media;
CREATE POLICY topic_read ON sewspace_media FOR SELECT TO sewspace_app
  USING (sewspace_media_on_visible_topic(id, user_id));

-- Image files: as in 0003, plus the full image or thumbnail of a photo on a
-- forum topic the viewer may see.
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
        OR EXISTS (SELECT 1 FROM sewspace_media m
                   JOIN sewspace_forum_topic_media tm ON tm.media_id = m.id
                   JOIN sewspace_forum_topics ft ON ft.id = tm.topic_id
                   WHERE m.user_id = u.user_id AND tm.user_id = u.user_id AND ft.user_id = u.user_id
                     AND (m.full_path = path OR m.thumb_path = path)
                     AND NOT sewspace_blocked_with(ft.user_id))
    )
  $$;
