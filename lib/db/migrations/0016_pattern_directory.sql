-- Pattern directory (/catalog) and pattern pages, owner decisions in
-- docs/design/patterns: where to get a pattern and its price, a designer who
-- is a Seams Club account (people follow them), a size chart, common
-- alterations from reviews, private saves, and shop / Instagram links on
-- profiles. Additive only.

-- Where to get it. 'seams_club' waits for pattern sales; until then pages are
-- 'designer' (their site, with an optional price) or 'free'. The price is in
-- the page's own currency (ISO 4217); nothing is converted.
ALTER TABLE sewspace_catalog ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'designer'
  CHECK (source IN ('designer', 'free', 'seams_club'));
ALTER TABLE sewspace_catalog ADD COLUMN IF NOT EXISTS price_cents integer CHECK (price_cents BETWEEN 0 AND 100000);
ALTER TABLE sewspace_catalog ADD COLUMN IF NOT EXISTS currency text CHECK (currency ~ '^[A-Z]{3}$');
-- The designer's own account, when they are on Seams Club.
ALTER TABLE sewspace_catalog ADD COLUMN IF NOT EXISTS designer_id varchar(255)
  REFERENCES sewspace_profiles(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sewspace_catalog_designer ON sewspace_catalog (designer_id) WHERE designer_id IS NOT NULL;
GRANT UPDATE (source, price_cents, currency, designer_id) ON sewspace_catalog TO sewspace_app;

-- Nobody can name someone else as a page's designer: through the app you may
-- only set yourself (as the page's creator, which the update policy already
-- requires) or, as an admin, anyone. Migrations and the owner role skip this.
CREATE OR REPLACE FUNCTION sewspace_catalog_designer_check() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'sewspace_app' OR NEW.designer_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.designer_id IS NOT DISTINCT FROM OLD.designer_id THEN RETURN NEW; END IF;
  IF NEW.designer_id = sewspace_current_user_id() OR sewspace_is_admin() THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'You can only name yourself as the designer' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS sewspace_catalog_designer_check ON sewspace_catalog;
CREATE TRIGGER sewspace_catalog_designer_check BEFORE INSERT OR UPDATE OF designer_id ON sewspace_catalog
  FOR EACH ROW EXECUTE FUNCTION sewspace_catalog_designer_check();

-- Size chart: body measurements per size, in cm. Public like the page; the
-- page's creator (or an admin) writes it. Reads the catalog under its own
-- policy, which never reads this table.
CREATE TABLE IF NOT EXISTS sewspace_catalog_sizes (
  catalog_id integer NOT NULL REFERENCES sewspace_catalog(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 59),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  bust_cm numeric(5, 1) CHECK (bust_cm BETWEEN 20 AND 300),
  waist_cm numeric(5, 1) CHECK (waist_cm BETWEEN 20 AND 300),
  hip_cm numeric(5, 1) CHECK (hip_cm BETWEEN 20 AND 300),
  PRIMARY KEY (catalog_id, label)
);
ALTER TABLE sewspace_catalog_sizes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON sewspace_catalog_sizes TO sewspace_app;
DROP POLICY IF EXISTS public_read ON sewspace_catalog_sizes;
CREATE POLICY public_read ON sewspace_catalog_sizes FOR SELECT TO sewspace_app USING (true);
DROP POLICY IF EXISTS editor_all ON sewspace_catalog_sizes;
CREATE POLICY editor_all ON sewspace_catalog_sizes TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_catalog c WHERE c.id = catalog_id AND (c.created_by = sewspace_current_user_id() OR sewspace_is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM sewspace_catalog c WHERE c.id = catalog_id AND (c.created_by = sewspace_current_user_id() OR sewspace_is_admin())));

-- Common alterations, chosen from a fixed list when reviewing. Reviews are
-- public, so the percentages are too.
ALTER TABLE sewspace_reviews ADD COLUMN IF NOT EXISTS alterations text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(alterations) <= 8 AND alterations <@ ARRAY[
    'lengthen_bodice', 'shorten_bodice', 'fba', 'sba', 'swayback', 'lengthen_skirt', 'shorten_skirt',
    'grade_sizes', 'take_in_waist', 'let_out_hips', 'narrow_shoulder', 'lengthen_sleeves', 'shorten_sleeves', 'raise_neckline'
  ]::text[]);

-- Saved patterns (the heart): private to the saver, like post saves. Separate
-- from "Save to my library", which copies the pattern into the studio.
CREATE TABLE IF NOT EXISTS sewspace_catalog_saves (
  user_id varchar(255) NOT NULL,
  catalog_id integer NOT NULL REFERENCES sewspace_catalog(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS sewspace_catalog_saves_recent ON sewspace_catalog_saves (user_id, created_at);
ALTER TABLE sewspace_catalog_saves ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON sewspace_catalog_saves TO sewspace_app;
DROP POLICY IF EXISTS owner_all ON sewspace_catalog_saves;
CREATE POLICY owner_all ON sewspace_catalog_saves TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());

-- Shop and Instagram links on profiles, public like the bio.
ALTER TABLE sewspace_profiles ADD COLUMN IF NOT EXISTS shop_url text
  CHECK (shop_url ~ '^https://[^\s]+$' AND char_length(shop_url) <= 300);
ALTER TABLE sewspace_profiles ADD COLUMN IF NOT EXISTS instagram text
  CHECK (instagram ~ '^[A-Za-z0-9._]{1,30}$');
CREATE OR REPLACE VIEW sewspace_public_profiles WITH (security_barrier) AS
  SELECT user_id, handle, name, bio, avatar_url, created_at, shop_url, instagram
  FROM sewspace_profiles
  WHERE handle IS NOT NULL
    AND NOT sewspace_blocked_with(user_id);
GRANT SELECT ON sewspace_public_profiles TO sewspace_app;
