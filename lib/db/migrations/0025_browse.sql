-- "Browse by" on Explore (owner's Browse brief, October 2026). Additive:
-- 1. More post labels, so every Browse tile has a real source. Old values stay
--    valid (the checks only get wider; no rows change).
-- 2. Trending hashtags: public posts from the last N days, people with a
--    handle, minus blocks either way (same rules as sewspace_hashtag_prefix).
-- 3. Save counts: numbers only, for public posts only, saves in the last N days
--    ("Popular this week" and the Browse covers). Who saved is never exposed.
ALTER TABLE sewspace_posts DROP CONSTRAINT IF EXISTS sewspace_posts_garment_check;
ALTER TABLE sewspace_posts ADD CONSTRAINT sewspace_posts_garment_check
  CHECK (garment IS NULL OR garment IN ('dresses', 'tops', 'bottoms', 'outerwear', 'bags', 'shirts', 'trousers', 'skirts', 'knitwear', 'home', 'kids', 'formal'));
ALTER TABLE sewspace_posts DROP CONSTRAINT IF EXISTS sewspace_posts_fabric_check;
ALTER TABLE sewspace_posts ADD CONSTRAINT sewspace_posts_fabric_check
  CHECK (fabric IS NULL OR fabric IN ('linen', 'cotton', 'satin', 'viscose', 'crepe', 'haul', 'denim', 'knit', 'wool'));

CREATE OR REPLACE FUNCTION sewspace_trending_hashtags(days integer, lim integer) RETURNS TABLE (tag text, posts bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT h.tag, count(p.id) AS posts
    FROM sewspace_hashtags h
    JOIN sewspace_post_hashtags ph ON ph.hashtag_id = h.id
    JOIN sewspace_posts p ON p.id = ph.post_id AND p.user_id = ph.user_id
    JOIN sewspace_profiles pr ON pr.user_id = p.user_id AND pr.handle IS NOT NULL
    WHERE p.visibility = 'public'
      AND p.created_at > now() - make_interval(days => least(greatest(days, 1), 90))
      AND NOT sewspace_blocked_with(p.user_id)
    GROUP BY h.tag
    ORDER BY posts DESC, h.tag
    LIMIT least(greatest(lim, 1), 30)
  $$;

CREATE OR REPLACE FUNCTION sewspace_save_counts(ids integer[], days integer) RETURNS TABLE (post_id integer, saves bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT p.id, count(s.user_id) AS saves
    FROM sewspace_posts p
    LEFT JOIN sewspace_saves s ON s.post_id = p.id AND s.created_at > now() - make_interval(days => least(greatest(days, 1), 90))
    WHERE p.id = ANY(ids) AND p.visibility = 'public' AND NOT sewspace_blocked_with(p.user_id)
    GROUP BY p.id
  $$;

REVOKE ALL ON FUNCTION sewspace_trending_hashtags(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION sewspace_save_counts(integer[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_trending_hashtags(integer, integer) TO sewspace_app;
GRANT EXECUTE ON FUNCTION sewspace_save_counts(integer[], integer) TO sewspace_app;
