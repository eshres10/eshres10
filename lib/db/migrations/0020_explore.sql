-- Explore (the new browse page; owner-approved plan). Additive only.
--
-- 1. Posts gain two optional labels the author picks in the post flow:
--    garment (what was made) and fabric (makes it a fabric post). Older posts
--    stay empty and only show under "For you" / "All". They follow their post
--    (same visibility, same RLS); nothing is read from stash items.
-- 2. Collections: private lists of saved things (posts, pattern pages,
--    challenges, forum threads). Owner-only; visibility is 'private' and the
--    CHECK allows nothing else until the owner decides on shared collections.
-- 3. Explore feedback ("see less" = Hide, "more like this"): owner-only.
-- Items in collections and feedback point at their target by type + id; when
-- the target is deleted, its rows go too (trigger below), so counts stay right.

ALTER TABLE sewspace_posts ADD COLUMN IF NOT EXISTS garment text
  CHECK (garment IS NULL OR garment IN ('dresses', 'tops', 'bottoms', 'outerwear', 'bags'));
ALTER TABLE sewspace_posts ADD COLUMN IF NOT EXISTS fabric text
  CHECK (fabric IS NULL OR fabric IN ('linen', 'cotton', 'satin', 'viscose', 'crepe', 'haul'));
CREATE INDEX IF NOT EXISTS sewspace_posts_garment_idx ON sewspace_posts (garment, created_at DESC) WHERE garment IS NOT NULL;
CREATE INDEX IF NOT EXISTS sewspace_posts_fabric_idx ON sewspace_posts (fabric, created_at DESC) WHERE fabric IS NOT NULL;

CREATE TABLE IF NOT EXISTS sewspace_collections (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sewspace_collections_name_idx ON sewspace_collections (user_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS sewspace_collection_items (
  collection_id integer NOT NULL REFERENCES sewspace_collections (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('post', 'pattern', 'challenge', 'thread')),
  item_id integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS sewspace_collection_items_user_idx ON sewspace_collection_items (user_id, item_type, item_id);

CREATE TABLE IF NOT EXISTS sewspace_discover_feedback (
  user_id varchar(255) NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('post', 'pattern', 'challenge', 'thread')),
  item_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('see_less', 'more_like')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id, kind)
);

ALTER TABLE sewspace_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_discover_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_all ON sewspace_collections;
CREATE POLICY owner_all ON sewspace_collections TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
-- Items only go into your own collections (collections are owner-only, so the
-- EXISTS can only see your own rows; it never reads collection_items back).
DROP POLICY IF EXISTS owner_all ON sewspace_collection_items;
CREATE POLICY owner_all ON sewspace_collection_items TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_collections c WHERE c.id = collection_id AND c.user_id = sewspace_current_user_id())
  );
DROP POLICY IF EXISTS owner_all ON sewspace_discover_feedback;
CREATE POLICY owner_all ON sewspace_discover_feedback TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());

GRANT SELECT, INSERT, UPDATE (name), DELETE ON sewspace_collections TO sewspace_app;
GRANT USAGE, SELECT ON SEQUENCE sewspace_collections_id_seq TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_collection_items, sewspace_discover_feedback TO sewspace_app;

-- When a post, pattern page, challenge or forum topic is deleted, take it out
-- of everyone's collections and feedback (SECURITY DEFINER: the rows belong
-- to other people, who can't be asked).
CREATE OR REPLACE FUNCTION sewspace_explore_forget() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM sewspace_collection_items WHERE item_type = TG_ARGV[0] AND item_id = OLD.id;
  DELETE FROM sewspace_discover_feedback WHERE item_type = TG_ARGV[0] AND item_id = OLD.id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION sewspace_explore_forget() FROM PUBLIC;
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_posts;
CREATE TRIGGER sewspace_explore_forget AFTER DELETE ON sewspace_posts FOR EACH ROW EXECUTE FUNCTION sewspace_explore_forget('post');
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_catalog;
CREATE TRIGGER sewspace_explore_forget AFTER DELETE ON sewspace_catalog FOR EACH ROW EXECUTE FUNCTION sewspace_explore_forget('pattern');
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_challenges;
CREATE TRIGGER sewspace_explore_forget AFTER DELETE ON sewspace_challenges FOR EACH ROW EXECUTE FUNCTION sewspace_explore_forget('challenge');
DROP TRIGGER IF EXISTS sewspace_explore_forget ON sewspace_forum_topics;
CREATE TRIGGER sewspace_explore_forget AFTER DELETE ON sewspace_forum_topics FOR EACH ROW EXECUTE FUNCTION sewspace_explore_forget('thread');
