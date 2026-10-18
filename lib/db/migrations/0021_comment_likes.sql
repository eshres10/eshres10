-- Comment likes (owner-approved for the post view). Additive only.
--
-- One like per person per comment. A like is private to whoever made it
-- (RLS owner rows only); everyone sees only the number, from the SECURITY
-- DEFINER sewspace_comment_like_counts(), which answers only for comments the
-- caller may see (the post's visibility, and no block either way with the
-- comment's author). You can like a comment you can see, as yourself. Likes go
-- when the comment (or its post) is deleted. No notifications for these.

CREATE TABLE IF NOT EXISTS sewspace_comment_likes (
  user_id varchar(255) NOT NULL,
  comment_id integer NOT NULL REFERENCES sewspace_comments (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX IF NOT EXISTS sewspace_comment_likes_comment_idx ON sewspace_comment_likes (comment_id);

GRANT SELECT, INSERT, DELETE ON sewspace_comment_likes TO sewspace_app;
ALTER TABLE sewspace_comment_likes ENABLE ROW LEVEL SECURITY;
-- (The EXISTS reads sewspace_comments under its own policies: the post must be
-- visible and the author not blocked either way. Those policies never read
-- this table, so there is no recursion.)
DROP POLICY IF EXISTS own_read ON sewspace_comment_likes;
CREATE POLICY own_read ON sewspace_comment_likes FOR SELECT TO sewspace_app
  USING (user_id = sewspace_current_user_id());
DROP POLICY IF EXISTS own_insert ON sewspace_comment_likes;
CREATE POLICY own_insert ON sewspace_comment_likes FOR INSERT TO sewspace_app
  WITH CHECK (user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_comments c JOIN sewspace_posts p ON p.id = c.post_id
                WHERE c.id = comment_id AND NOT sewspace_blocked_with(c.user_id)));
DROP POLICY IF EXISTS own_delete ON sewspace_comment_likes;
CREATE POLICY own_delete ON sewspace_comment_likes FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id());

CREATE OR REPLACE FUNCTION sewspace_comment_like_counts(ids integer[])
  RETURNS TABLE (comment_id integer, likes bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT c.id, (SELECT count(*) FROM sewspace_comment_likes l WHERE l.comment_id = c.id)
    FROM sewspace_comments c JOIN sewspace_posts p ON p.id = c.post_id
    WHERE c.id = ANY(ids)
      AND sewspace_can_view(p.user_id, p.visibility)
      AND NOT sewspace_blocked_with(c.user_id)
  $$;
REVOKE ALL ON FUNCTION sewspace_comment_like_counts(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_comment_like_counts(integer[]) TO sewspace_app;
