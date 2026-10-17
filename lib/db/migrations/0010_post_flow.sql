-- Phase F1: the new post flow. Additive only: alt text on photos, a display
-- shape on posts, and hashtags.

-- Alt text, read aloud by screen readers. Follows its photo (sewspace_media
-- policies are unchanged).
ALTER TABLE sewspace_media ADD COLUMN IF NOT EXISTS alt_text text NOT NULL DEFAULT ''
  CHECK (char_length(alt_text) <= 500);

-- How photos are cropped for display (object-fit: cover); the stored image is
-- never re-cropped. Existing posts keep showing as before ('original'); new
-- posts default to 4:5.
ALTER TABLE sewspace_posts ADD COLUMN IF NOT EXISTS aspect text NOT NULL DEFAULT 'original'
  CHECK (aspect IN ('4:5', '1:1', 'original'));
ALTER TABLE sewspace_posts ALTER COLUMN aspect SET DEFAULT '4:5';

-- Hashtags ---------------------------------------------------------------------
-- A tag row is only a word. Which posts use it lives in sewspace_post_hashtags,
-- which follows its post: only the author writes, readers see the rows of posts
-- they may see.
CREATE TABLE IF NOT EXISTS sewspace_hashtags (
  id serial PRIMARY KEY,
  tag text NOT NULL UNIQUE CHECK (tag ~ '^[a-z0-9_]{1,50}$'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sewspace_hashtags_prefix_idx ON sewspace_hashtags (tag text_pattern_ops);

CREATE TABLE IF NOT EXISTS sewspace_post_hashtags (
  post_id integer NOT NULL REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  hashtag_id integer NOT NULL REFERENCES sewspace_hashtags (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  PRIMARY KEY (post_id, hashtag_id)
);
CREATE INDEX IF NOT EXISTS sewspace_post_hashtags_tag_idx ON sewspace_post_hashtags (hashtag_id, post_id DESC);
CREATE INDEX IF NOT EXISTS sewspace_post_hashtags_user_idx ON sewspace_post_hashtags (user_id);

ALTER TABLE sewspace_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_post_hashtags ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sewspace_hashtags TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_post_hashtags TO sewspace_app;

DROP POLICY IF EXISTS owner_all ON sewspace_post_hashtags;
CREATE POLICY owner_all ON sewspace_post_hashtags TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_current_user_id())
  );
DROP POLICY IF EXISTS visible_read ON sewspace_post_hashtags;
CREATE POLICY visible_read ON sewspace_post_hashtags FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_post_hashtags.user_id
                 AND sewspace_can_view(p.user_id, p.visibility)));
-- A tag is readable once it's on a post you may see (so a tag used only on
-- someone's private posts can't be found).
DROP POLICY IF EXISTS visible_read ON sewspace_hashtags;
CREATE POLICY visible_read ON sewspace_hashtags FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_post_hashtags ph WHERE ph.hashtag_id = sewspace_hashtags.id));

-- Ids for tags, creating missing ones. The app role can't insert tags itself:
-- this checks the format and limits each call to 30 tags.
CREATE OR REPLACE FUNCTION sewspace_hashtag_ids(tags text[]) RETURNS TABLE (id integer, tag text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
#variable_conflict use_column
BEGIN
  IF sewspace_current_user_id() IS NULL THEN
    RAISE EXCEPTION 'sign in to use hashtags' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(array_length(tags, 1), 0) > 30 THEN
    RAISE EXCEPTION 'at most 30 hashtags' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO sewspace_hashtags (tag) SELECT DISTINCT t FROM unnest(tags) t ON CONFLICT (tag) DO NOTHING;
  RETURN QUERY SELECT h.id, h.tag FROM sewspace_hashtags h WHERE h.tag = ANY (tags);
END $$;

-- How many posts use each tag. Public posts only (followers-only and private
-- posts are never counted), by people with a handle, and not across a block
-- with the caller.
CREATE OR REPLACE FUNCTION sewspace_hashtag_counts(tags text[]) RETURNS TABLE (tag text, posts bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT h.tag, count(p.id)
    FROM sewspace_hashtags h
    JOIN sewspace_post_hashtags ph ON ph.hashtag_id = h.id
    JOIN sewspace_posts p ON p.id = ph.post_id AND p.user_id = ph.user_id
    JOIN sewspace_profiles pr ON pr.user_id = p.user_id AND pr.handle IS NOT NULL
    WHERE h.tag = ANY (tags) AND p.visibility = 'public' AND NOT sewspace_blocked_with(p.user_id)
    GROUP BY h.tag
  $$;

-- The most used tags starting with a prefix, counted as above.
CREATE OR REPLACE FUNCTION sewspace_hashtag_prefix(prefix text, lim integer) RETURNS TABLE (tag text, posts bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT h.tag, count(p.id) AS posts
    FROM sewspace_hashtags h
    JOIN sewspace_post_hashtags ph ON ph.hashtag_id = h.id
    JOIN sewspace_posts p ON p.id = ph.post_id AND p.user_id = ph.user_id
    JOIN sewspace_profiles pr ON pr.user_id = p.user_id AND pr.handle IS NOT NULL
    WHERE h.tag LIKE replace(replace(lower(prefix), '\', ''), '_', '\_') || '%'
      AND p.visibility = 'public' AND NOT sewspace_blocked_with(p.user_id)
    GROUP BY h.tag
    ORDER BY posts DESC, h.tag
    LIMIT least(greatest(lim, 1), 20)
  $$;

REVOKE ALL ON FUNCTION sewspace_hashtag_ids(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION sewspace_hashtag_counts(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION sewspace_hashtag_prefix(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_hashtag_ids(text[]) TO sewspace_app;
GRANT EXECUTE ON FUNCTION sewspace_hashtag_counts(text[]) TO sewspace_app;
GRANT EXECUTE ON FUNCTION sewspace_hashtag_prefix(text, integer) TO sewspace_app;
