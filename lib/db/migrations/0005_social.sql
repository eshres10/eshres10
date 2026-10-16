-- Phase 4: likes, comments, saves, follows and blocks as actions, reports and
-- admin review. Additive: new tables, functions and policies, and tighter
-- WITH CHECK on follows. No data is changed.

-- Admins are named by the API (ADMIN_USER_IDS) and passed per request in
-- app.is_admin, next to app.user_id. Only the server sets either.
CREATE OR REPLACE FUNCTION sewspace_is_admin() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT sewspace_current_user_id() IS NOT NULL AND coalesce(current_setting('app.is_admin', true), '') = 'on' $$;
GRANT EXECUTE ON FUNCTION sewspace_is_admin() TO sewspace_app;

-- Likes -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sewspace_likes (
  user_id varchar(255) NOT NULL,
  post_id integer NOT NULL REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS sewspace_likes_post_idx ON sewspace_likes (post_id);

-- Comments: one level of replies (a reply's parent is a top-level comment on
-- the same post; checked by a trigger so the policy needn't read this table).
CREATE TABLE IF NOT EXISTS sewspace_comments (
  id serial PRIMARY KEY,
  post_id integer NOT NULL REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  parent_id integer REFERENCES sewspace_comments (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sewspace_comments_post_idx ON sewspace_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS sewspace_comments_parent_idx ON sewspace_comments (parent_id);

CREATE OR REPLACE FUNCTION sewspace_comment_check() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sewspace_comments c WHERE c.id = NEW.parent_id AND c.post_id = NEW.post_id AND c.parent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'a reply must answer a top-level comment on the same post' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_comment_check ON sewspace_comments;
CREATE TRIGGER sewspace_comment_check BEFORE INSERT OR UPDATE ON sewspace_comments
  FOR EACH ROW EXECUTE FUNCTION sewspace_comment_check();

-- Saves: private bookmarks.
CREATE TABLE IF NOT EXISTS sewspace_saves (
  user_id varchar(255) NOT NULL,
  post_id integer NOT NULL REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- Reports. The snapshot keeps what was reported (text, author handle) so an
-- admin can still judge it after the content is removed or edited.
CREATE TABLE IF NOT EXISTS sewspace_reports (
  id serial PRIMARY KEY,
  reporter_id varchar(255) NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('post', 'comment', 'profile')),
  target_id text NOT NULL,
  target_user_id varchar(255) NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'nudity', 'violence', 'intellectual_property', 'other')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 1000),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'dismissed')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by varchar(255)
);
CREATE INDEX IF NOT EXISTS sewspace_reports_status_idx ON sewspace_reports (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS sewspace_reports_once_idx ON sewspace_reports (reporter_id, target_kind, target_id) WHERE status = 'open';

GRANT SELECT, INSERT, DELETE ON sewspace_likes, sewspace_saves TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_comments TO sewspace_app;
GRANT SELECT, INSERT, UPDATE ON sewspace_reports TO sewspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sewspace_app;
ALTER TABLE sewspace_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_reports ENABLE ROW LEVEL SECURITY;

-- Likes: anyone who may see the post sees its likes; you like and unlike as
-- yourself, and only posts you may see. (The EXISTS reads sewspace_posts under
-- its own policies, which never read likes or comments.)
CREATE POLICY visible_read ON sewspace_likes FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id));
CREATE POLICY own_insert ON sewspace_likes FOR INSERT TO sewspace_app
  WITH CHECK (user_id = sewspace_current_user_id() AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id));
CREATE POLICY own_delete ON sewspace_likes FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id());

-- Comments: readable with their post, except from people on the other side of
-- a block. Written as yourself on posts you may see; deleted by their author,
-- by the post's author, or by an admin.
CREATE POLICY visible_read ON sewspace_comments FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id) AND NOT sewspace_blocked_with(user_id));
CREATE POLICY own_insert ON sewspace_comments FOR INSERT TO sewspace_app
  WITH CHECK (user_id = sewspace_current_user_id() AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id));
CREATE POLICY author_delete ON sewspace_comments FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id()
         OR EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_current_user_id())
         OR sewspace_is_admin());
-- Admins see reported comments (and only those) so they can act on a report.
CREATE POLICY admin_read ON sewspace_comments FOR SELECT TO sewspace_app
  USING (sewspace_is_admin() AND EXISTS (
    SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'comment' AND r.target_id = sewspace_comments.id::text));

-- Saves are private to the person who saved, and only for posts they may see.
CREATE POLICY own_saves ON sewspace_saves TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id() AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id));

-- Reports: you file them as yourself and see your own; admins see and resolve all.
CREATE POLICY own_reports ON sewspace_reports FOR SELECT TO sewspace_app
  USING (reporter_id = sewspace_current_user_id());
CREATE POLICY own_insert ON sewspace_reports FOR INSERT TO sewspace_app
  WITH CHECK (reporter_id = sewspace_current_user_id() AND status = 'open' AND resolved_at IS NULL AND resolved_by IS NULL);
CREATE POLICY admin_all ON sewspace_reports TO sewspace_app
  USING (sewspace_is_admin())
  WITH CHECK (sewspace_is_admin());

-- Admins may read and remove reported posts (and only those).
CREATE POLICY admin_read ON sewspace_posts FOR SELECT TO sewspace_app
  USING (sewspace_is_admin() AND EXISTS (
    SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'post' AND r.target_id = sewspace_posts.id::text));
CREATE POLICY admin_delete ON sewspace_posts FOR DELETE TO sewspace_app
  USING (sewspace_is_admin() AND EXISTS (
    SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'post' AND r.target_id = sewspace_posts.id::text));

-- Follows: only people with a handle, never yourself, never across a block.
ALTER POLICY own_follows ON sewspace_follows
  WITH CHECK (
    follower_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_public_profiles p WHERE p.user_id = followee_id)
  );

-- Blocking someone ends follows both ways, whatever the API does.
CREATE OR REPLACE FUNCTION sewspace_block_unfollow() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  DELETE FROM sewspace_follows
   WHERE (follower_id = NEW.blocker_id AND followee_id = NEW.blocked_id)
      OR (follower_id = NEW.blocked_id AND followee_id = NEW.blocker_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_block_unfollow ON sewspace_blocks;
CREATE TRIGGER sewspace_block_unfollow AFTER INSERT ON sewspace_blocks
  FOR EACH ROW EXECUTE FUNCTION sewspace_block_unfollow();

-- Like and comment counts for posts the caller may see (comments from people
-- on the other side of a block aren't counted, as they aren't shown).
CREATE OR REPLACE FUNCTION sewspace_post_counts(ids integer[])
  RETURNS TABLE (post_id integer, likes bigint, comments bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT p.id,
      (SELECT count(*) FROM sewspace_likes l WHERE l.post_id = p.id),
      (SELECT count(*) FROM sewspace_comments c WHERE c.post_id = p.id AND NOT sewspace_blocked_with(c.user_id))
    FROM sewspace_posts p
    WHERE p.id = ANY(ids) AND sewspace_can_view(p.user_id, p.visibility)
  $$;
REVOKE ALL ON FUNCTION sewspace_post_counts(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_post_counts(integer[]) TO sewspace_app;

-- The people the caller has blocked, for the "Blocked accounts" list (the
-- public profile view hides them, by design).
CREATE OR REPLACE FUNCTION sewspace_my_blocks()
  RETURNS TABLE (user_id varchar, handle text, name text, avatar_url text, blocked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT b.blocked_id, p.handle, p.name, p.avatar_url, b.created_at
    FROM sewspace_blocks b JOIN sewspace_profiles p ON p.user_id = b.blocked_id
    WHERE b.blocker_id = sewspace_current_user_id() AND p.handle IS NOT NULL
    ORDER BY b.created_at DESC
  $$;
REVOKE ALL ON FUNCTION sewspace_my_blocks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_my_blocks() TO sewspace_app;
