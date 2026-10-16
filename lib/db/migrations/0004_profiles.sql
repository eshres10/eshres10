-- Phase 3: profiles with tabs.
-- * Profiles disappear for people who have blocked each other (either way),
--   for the profile page, the avatar file and post bylines alike.
-- * Follower counts and the "N posts for followers only" notice need numbers
--   the caller can't read through RLS (you only see follows you're part of,
--   and never others' followers-only rows). Two SECURITY DEFINER functions
--   return those numbers, and only the numbers.

CREATE OR REPLACE VIEW sewspace_public_profiles WITH (security_barrier) AS
  SELECT user_id, handle, name, bio, avatar_url, created_at
  FROM sewspace_profiles
  WHERE handle IS NOT NULL
    AND NOT sewspace_blocked_with(user_id);
GRANT SELECT ON sewspace_public_profiles TO sewspace_app;

CREATE OR REPLACE FUNCTION sewspace_is_public_avatar(path text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM sewspace_profiles p
      JOIN sewspace_uploads u ON u.object_path = path AND u.user_id = p.user_id
      WHERE p.handle IS NOT NULL
        AND u.purpose = 'avatar'
        AND p.avatar_url = '/api/storage' || path
        AND NOT sewspace_blocked_with(p.user_id)
    )
  $$;

-- Followers and following of a profile with a handle. Nothing for profiles
-- the caller can't see (no handle, or blocked either way). Follows involving
-- people without a handle aren't counted: they can't be shown in a list.
CREATE OR REPLACE FUNCTION sewspace_follow_counts(uid text)
  RETURNS TABLE (followers bigint, following bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT
      (SELECT count(*) FROM sewspace_follows f JOIN sewspace_profiles o ON o.user_id = f.follower_id AND o.handle IS NOT NULL
        WHERE f.followee_id = uid),
      (SELECT count(*) FROM sewspace_follows f JOIN sewspace_profiles o ON o.user_id = f.followee_id AND o.handle IS NOT NULL
        WHERE f.follower_id = uid)
    WHERE EXISTS (SELECT 1 FROM sewspace_profiles p WHERE p.user_id = uid AND p.handle IS NOT NULL)
      AND NOT sewspace_blocked_with(uid)
  $$;
REVOKE ALL ON FUNCTION sewspace_follow_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_follow_counts(text) TO sewspace_app;

-- How many followers-only posts and makes of a profile the caller can't see
-- (so the page can say "3 posts are for followers"). Zero for the owner and
-- for followers; nothing when blocked. Private rows are never counted.
CREATE OR REPLACE FUNCTION sewspace_followers_only_counts(uid text)
  RETURNS TABLE (posts bigint, makes bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT
      (SELECT count(*) FROM sewspace_posts WHERE user_id = uid AND visibility = 'followers' AND NOT sewspace_can_view(user_id, visibility)),
      (SELECT count(*) FROM sewspace_projects WHERE user_id = uid AND visibility = 'followers' AND NOT sewspace_can_view(user_id, visibility))
    WHERE EXISTS (SELECT 1 FROM sewspace_profiles p WHERE p.user_id = uid AND p.handle IS NOT NULL)
      AND NOT sewspace_blocked_with(uid)
  $$;
REVOKE ALL ON FUNCTION sewspace_followers_only_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_followers_only_counts(text) TO sewspace_app;
