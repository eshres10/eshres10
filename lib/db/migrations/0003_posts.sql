-- Phase 2: posts and feeds. Additive only.
--
-- A post is a status (text) or photos with a caption, with the same
-- visibility rule as makes. Photos are processed on the server into a full
-- image and a thumbnail (sewspace_media) and attached in order
-- (sewspace_post_media). A post may tag one of the author's own makes,
-- patterns or fabrics.

CREATE TABLE IF NOT EXISTS sewspace_media (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  full_path text NOT NULL UNIQUE,
  thumb_path text NOT NULL UNIQUE,
  source_path text,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sewspace_media_user_idx ON sewspace_media (user_id);

CREATE TABLE IF NOT EXISTS sewspace_posts (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('status', 'photo')),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 2200),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'followers', 'private')),
  project_id integer REFERENCES sewspace_projects (id) ON DELETE SET NULL,
  pattern_id integer REFERENCES sewspace_patterns (id) ON DELETE SET NULL,
  fabric_id integer REFERENCES sewspace_fabrics (id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sewspace_posts_user_created_idx ON sewspace_posts (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS sewspace_posts_public_created_idx ON sewspace_posts (created_at DESC, id DESC) WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS sewspace_post_media (
  post_id integer NOT NULL REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  media_id integer NOT NULL REFERENCES sewspace_media (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);
CREATE INDEX IF NOT EXISTS sewspace_post_media_media_idx ON sewspace_post_media (media_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON sewspace_media, sewspace_posts, sewspace_post_media TO sewspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sewspace_app;
ALTER TABLE sewspace_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_post_media ENABLE ROW LEVEL SECURITY;

-- Helpers used by the policies below. They are SECURITY DEFINER so the
-- media and post_media policies don't read each other (Postgres rejects
-- policies that recurse between two tables).
CREATE OR REPLACE FUNCTION sewspace_owns_media(m_id integer) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM sewspace_media WHERE id = m_id AND user_id = sewspace_current_user_id()) $$;
CREATE OR REPLACE FUNCTION sewspace_media_on_visible_post(m_id integer, owner_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM sewspace_post_media pm JOIN sewspace_posts p ON p.id = pm.post_id
      WHERE pm.media_id = m_id AND p.user_id = owner_id AND sewspace_can_view(p.user_id, p.visibility)
    )
  $$;
REVOKE ALL ON FUNCTION sewspace_owns_media(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION sewspace_media_on_visible_post(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_owns_media(integer) TO sewspace_app;
GRANT EXECUTE ON FUNCTION sewspace_media_on_visible_post(integer, text) TO sewspace_app;

-- Owners: full access, and a post may only tag the author's own items.
CREATE POLICY owner_all ON sewspace_media TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY owner_all ON sewspace_posts TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id AND p.user_id = sewspace_current_user_id()))
    AND (pattern_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_patterns p WHERE p.id = pattern_id AND p.user_id = sewspace_current_user_id()))
    AND (fabric_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_fabrics f WHERE f.id = fabric_id AND f.user_id = sewspace_current_user_id()))
  );
CREATE POLICY owner_all ON sewspace_post_media TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_current_user_id())
    AND sewspace_owns_media(media_id)
  );

-- Everyone else: read what the visibility rule allows (SELECT only).
CREATE POLICY visible_read ON sewspace_posts FOR SELECT TO sewspace_app
  USING (sewspace_can_view(user_id, visibility));
CREATE POLICY visible_read ON sewspace_post_media FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_post_media.user_id
                 AND sewspace_can_view(p.user_id, p.visibility)));
CREATE POLICY visible_read ON sewspace_media FOR SELECT TO sewspace_app
  USING (sewspace_media_on_visible_post(id, user_id));

-- Image files: also readable when they are the full image or thumbnail of
-- media attached to a post the viewer may see.
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
