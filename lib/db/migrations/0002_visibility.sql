-- Phase 1: privacy controls and public read access. Additive only.
--
-- Projects (makes), fabrics, threads and patterns get a visibility setting:
-- 'public' (anyone, signed out included), 'followers' (the owner's followers)
-- or 'private' (owner only). Existing rows default to private.
-- Measurements have no visibility setting: they are never shown to anyone else.
-- Follows and blocks are created now so the rules can use them; the follow and
-- block actions arrive in Phase 4.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sewspace_projects', 'sewspace_fabrics', 'sewspace_threads', 'sewspace_patterns']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT ''private''', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_visibility_check') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (visibility IN (''public'', ''followers'', ''private''))', t, t || '_visibility_check');
    END IF;
  END LOOP;
END
$$;

-- Make details shown on public make pages.
ALTER TABLE sewspace_projects ADD COLUMN IF NOT EXISTS "size" text;
-- First time the owner shared the project beyond private (orders profile grids).
ALTER TABLE sewspace_projects ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS sewspace_projects_user_visibility_idx ON sewspace_projects (user_id, visibility);

CREATE TABLE IF NOT EXISTS sewspace_follows (
  follower_id varchar(255) NOT NULL,
  followee_id varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS sewspace_follows_followee_idx ON sewspace_follows (followee_id);

CREATE TABLE IF NOT EXISTS sewspace_blocks (
  blocker_id varchar(255) NOT NULL,
  blocked_id varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS sewspace_blocks_blocked_idx ON sewspace_blocks (blocked_id);

GRANT SELECT, INSERT, DELETE ON sewspace_follows, sewspace_blocks TO sewspace_app;
ALTER TABLE sewspace_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_blocks ENABLE ROW LEVEL SECURITY;

-- Follows: you can see follows you are part of, and only follow as yourself.
-- (Public follower counts come through a function in Phase 4.)
CREATE POLICY own_follows ON sewspace_follows TO sewspace_app
  USING (follower_id = sewspace_current_user_id() OR followee_id = sewspace_current_user_id())
  WITH CHECK (follower_id = sewspace_current_user_id());
-- Blocks are private to the person who made them.
CREATE POLICY own_blocks ON sewspace_blocks TO sewspace_app
  USING (blocker_id = sewspace_current_user_id())
  WITH CHECK (blocker_id = sewspace_current_user_id());

-- The visibility rule, in one place for every table:
--   the owner always sees their own rows; private rows are owner-only;
--   anyone who blocked, or was blocked by, the owner sees nothing;
--   public rows are visible to everyone else (signed out included);
--   followers-only rows are visible to signed-in followers.
-- SECURITY DEFINER so it can read follows and blocks the caller can't see.
CREATE OR REPLACE FUNCTION sewspace_can_view(owner_id text, vis text) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  me text := sewspace_current_user_id();
BEGIN
  IF me IS NOT NULL AND owner_id = me THEN RETURN true; END IF;
  IF vis IS DISTINCT FROM 'public' AND vis IS DISTINCT FROM 'followers' THEN RETURN false; END IF;
  IF me IS NOT NULL AND EXISTS (
    SELECT 1 FROM sewspace_blocks b
    WHERE (b.blocker_id = owner_id AND b.blocked_id = me) OR (b.blocker_id = me AND b.blocked_id = owner_id)
  ) THEN RETURN false; END IF;
  IF vis = 'public' THEN RETURN true; END IF;
  RETURN me IS NOT NULL AND EXISTS (
    SELECT 1 FROM sewspace_follows f WHERE f.follower_id = me AND f.followee_id = owner_id
  );
END
$$;
REVOKE ALL ON FUNCTION sewspace_can_view(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_can_view(text, text) TO sewspace_app;

-- Whether the caller and another person have blocked each other (either way).
-- Lets the API's access module apply the block rule without being able to
-- list anyone's blocks: it only answers for pairs that include the caller.
CREATE OR REPLACE FUNCTION sewspace_blocked_with(other_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT sewspace_current_user_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM sewspace_blocks b
      WHERE (b.blocker_id = other_id AND b.blocked_id = sewspace_current_user_id())
         OR (b.blocker_id = sewspace_current_user_id() AND b.blocked_id = other_id)
    )
  $$;
REVOKE ALL ON FUNCTION sewspace_blocked_with(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_blocked_with(text) TO sewspace_app;

-- Read access for others. These sit beside the owner_all policies (policies
-- are OR-ed), and only grant SELECT: nobody but the owner can write.
CREATE POLICY visible_read ON sewspace_projects FOR SELECT TO sewspace_app
  USING (sewspace_can_view(user_id, visibility));
CREATE POLICY visible_read ON sewspace_fabrics FOR SELECT TO sewspace_app
  USING (sewspace_can_view(user_id, visibility));
CREATE POLICY visible_read ON sewspace_threads FOR SELECT TO sewspace_app
  USING (sewspace_can_view(user_id, visibility));
CREATE POLICY visible_read ON sewspace_patterns FOR SELECT TO sewspace_app
  USING (sewspace_can_view(user_id, visibility));
-- Steps and photos follow their project.
CREATE POLICY visible_read ON sewspace_project_steps FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id AND p.user_id = sewspace_project_steps.user_id
                 AND sewspace_can_view(p.user_id, p.visibility)));
CREATE POLICY visible_read ON sewspace_project_photos FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id AND p.user_id = sewspace_project_photos.user_id
                 AND sewspace_can_view(p.user_id, p.visibility)));

-- An uploaded image may be read by anyone who can see a row of its owner that
-- shows it. Only 'image' uploads qualify, so pattern PDFs and AI
-- visualisations stay owner-only whatever a row's visibility is.
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
REVOKE ALL ON FUNCTION sewspace_is_visible_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_is_visible_image(text) TO sewspace_app;

CREATE POLICY visible_image_read ON sewspace_uploads FOR SELECT TO sewspace_app
  USING (sewspace_is_visible_image(object_path));

-- Phase 0's write checks said "only link rows you can see". Now that others'
-- public rows are visible, tighten them to "rows you own".
ALTER POLICY owner_all ON sewspace_projects
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND (pattern_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_patterns p WHERE p.id = pattern_id AND p.user_id = sewspace_current_user_id()))
    AND (fabric_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_fabrics f WHERE f.id = fabric_id AND f.user_id = sewspace_current_user_id()))
    AND (thread_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_threads t WHERE t.id = thread_id AND t.user_id = sewspace_current_user_id()))
    AND (measurement_profile_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_measurement_profiles m WHERE m.id = measurement_profile_id AND m.user_id = sewspace_current_user_id()))
  );
ALTER POLICY owner_all ON sewspace_project_steps
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id AND p.user_id = sewspace_current_user_id())
  );
ALTER POLICY owner_all ON sewspace_project_photos
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id AND p.user_id = sewspace_current_user_id())
  );
