-- Phase S2: My ideas (studio overview). Additive: one new table.
-- An idea pairs one of your patterns with one of your fabrics, with an
-- optional short note. Always private to its owner: no visibility setting,
-- no public API, owner_all is the only policy.
CREATE TABLE IF NOT EXISTS sewspace_ideas (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  pattern_id integer NOT NULL REFERENCES sewspace_patterns(id) ON DELETE CASCADE,
  fabric_id integer NOT NULL REFERENCES sewspace_fabrics(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 80),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sewspace_ideas_user_idx ON sewspace_ideas (user_id, created_at DESC);

ALTER TABLE sewspace_ideas ENABLE ROW LEVEL SECURITY;
-- The pattern and fabric must be the owner's own. Others' public patterns and
-- fabrics are readable, so "exists" alone isn't enough: check user_id too.
DROP POLICY IF EXISTS owner_all ON sewspace_ideas;
CREATE POLICY owner_all ON sewspace_ideas TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_patterns p WHERE p.id = pattern_id AND p.user_id = sewspace_current_user_id())
    AND EXISTS (SELECT 1 FROM sewspace_fabrics f WHERE f.id = fabric_id AND f.user_id = sewspace_current_user_id())
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON sewspace_ideas TO sewspace_app;
GRANT USAGE, SELECT ON SEQUENCE sewspace_ideas_id_seq TO sewspace_app;
