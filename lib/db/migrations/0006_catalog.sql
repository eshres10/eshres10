-- Phase 5: shared pattern and product pages ("the catalog") with reviews.
-- Additive: new tables, functions and policies, and a nullable catalog_id on
-- patterns, fabrics and threads. One CHECK constraint on reports is widened to
-- accept 'review' (no rows change).

-- Catalog entries are shared reference pages: anyone can read them, any
-- signed-in person can add one, and the person who added it (or an admin) can
-- correct it. They hold no personal data; created_by is never shown.
CREATE TABLE IF NOT EXISTS sewspace_catalog (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('pattern', 'product')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  maker text NOT NULL DEFAULT '' CHECK (length(maker) <= 120),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
  difficulty text CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  sizes text CHECK (length(sizes) <= 80),
  fabric_types text CHECK (length(fabric_types) <= 120),
  yardage text CHECK (length(yardage) <= 80),
  url text CHECK (url ~ '^https?://' AND length(url) <= 500),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  created_by varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);
CREATE INDEX IF NOT EXISTS sewspace_catalog_name_idx ON sewspace_catalog (kind, lower(name));

-- Your own pattern, fabric or thread can point at its shared page.
ALTER TABLE sewspace_patterns ADD COLUMN IF NOT EXISTS catalog_id integer REFERENCES sewspace_catalog (id) ON DELETE SET NULL;
ALTER TABLE sewspace_fabrics ADD COLUMN IF NOT EXISTS catalog_id integer REFERENCES sewspace_catalog (id) ON DELETE SET NULL;
ALTER TABLE sewspace_threads ADD COLUMN IF NOT EXISTS catalog_id integer REFERENCES sewspace_catalog (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sewspace_patterns_catalog_idx ON sewspace_patterns (catalog_id);
CREATE INDEX IF NOT EXISTS sewspace_fabrics_catalog_idx ON sewspace_fabrics (catalog_id);
CREATE INDEX IF NOT EXISTS sewspace_threads_catalog_idx ON sewspace_threads (catalog_id);

-- Reviews: one per person per entry. Pattern reviews can also score fit,
-- difficulty and instructions, and say how the sizing ran.
CREATE TABLE IF NOT EXISTS sewspace_reviews (
  id serial PRIMARY KEY,
  catalog_id integer NOT NULL REFERENCES sewspace_catalog (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  fit smallint CHECK (fit BETWEEN 1 AND 5),
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 5),
  instructions smallint CHECK (instructions BETWEEN 1 AND 5),
  sizing text CHECK (sizing IN ('small', 'true', 'large')),
  size_made text CHECK (length(size_made) <= 40),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  make_id integer REFERENCES sewspace_projects (id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, user_id)
);
CREATE INDEX IF NOT EXISTS sewspace_reviews_user_idx ON sewspace_reviews (user_id);

-- "Helpful" votes on reviews. Private to the voter; counts come from a function.
CREATE TABLE IF NOT EXISTS sewspace_review_votes (
  review_id integer NOT NULL REFERENCES sewspace_reviews (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

GRANT SELECT, INSERT ON sewspace_catalog TO sewspace_app;
-- Corrections only touch the description fields: never kind, slug (links
-- would break) or created_by.
GRANT UPDATE (name, maker, category, difficulty, sizes, fabric_types, yardage, url, description, updated_at) ON sewspace_catalog TO sewspace_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sewspace_reviews TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_review_votes TO sewspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sewspace_app;
ALTER TABLE sewspace_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_review_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read ON sewspace_catalog FOR SELECT TO sewspace_app USING (true);
CREATE POLICY own_insert ON sewspace_catalog FOR INSERT TO sewspace_app
  WITH CHECK (created_by = sewspace_current_user_id());
CREATE POLICY editor_update ON sewspace_catalog FOR UPDATE TO sewspace_app
  USING (created_by = sewspace_current_user_id() OR sewspace_is_admin())
  WITH CHECK (true);

-- Reviews are public, except between people who have blocked each other.
-- Only the author writes; a linked make must be the author's own.
CREATE POLICY visible_read ON sewspace_reviews FOR SELECT TO sewspace_app
  USING (NOT sewspace_blocked_with(user_id));
CREATE POLICY owner_all ON sewspace_reviews TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND (make_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = make_id AND p.user_id = sewspace_current_user_id()))
  );
CREATE POLICY admin_delete ON sewspace_reviews FOR DELETE TO sewspace_app
  USING (sewspace_is_admin() AND EXISTS (
    SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'review' AND r.target_id = sewspace_reviews.id::text));

-- Votes: your own only, on reviews you can see (the EXISTS reads reviews
-- under their own policy, which never reads votes).
CREATE POLICY own_votes ON sewspace_review_votes TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id() AND EXISTS (SELECT 1 FROM sewspace_reviews r WHERE r.id = review_id));

-- Reviews can be reported like posts and comments.
ALTER TABLE sewspace_reports DROP CONSTRAINT IF EXISTS sewspace_reports_target_kind_check;
ALTER TABLE sewspace_reports ADD CONSTRAINT sewspace_reports_target_kind_check
  CHECK (target_kind IN ('post', 'comment', 'profile', 'review'));

-- Numbers for catalog pages, over every review (an overall rating shouldn't
-- change with who is looking). Only numbers leave this function.
CREATE OR REPLACE FUNCTION sewspace_catalog_stats(ids integer[])
  RETURNS TABLE (catalog_id integer, reviews bigint, rating numeric, fit numeric, difficulty numeric, instructions numeric,
                 runs_small bigint, runs_true bigint, runs_large bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT c.id, count(r.id), round(avg(r.rating), 1), round(avg(r.fit), 1), round(avg(r.difficulty), 1), round(avg(r.instructions), 1),
           count(*) FILTER (WHERE r.sizing = 'small'), count(*) FILTER (WHERE r.sizing = 'true'), count(*) FILTER (WHERE r.sizing = 'large')
    FROM sewspace_catalog c LEFT JOIN sewspace_reviews r ON r.catalog_id = c.id
    WHERE c.id = ANY(ids)
    GROUP BY c.id
  $$;
REVOKE ALL ON FUNCTION sewspace_catalog_stats(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_catalog_stats(integer[]) TO sewspace_app;

CREATE OR REPLACE FUNCTION sewspace_review_helpful(ids integer[])
  RETURNS TABLE (review_id integer, helpful bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT v.review_id, count(*) FROM sewspace_review_votes v WHERE v.review_id = ANY(ids) GROUP BY v.review_id
  $$;
REVOKE ALL ON FUNCTION sewspace_review_helpful(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_review_helpful(integer[]) TO sewspace_app;
