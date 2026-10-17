-- Phase F0: drafts for the step-by-step form flows. Additive: one new table.
-- One draft per person per flow. Private to its owner: nobody else can read,
-- count or change it (owner_all is the only policy).
CREATE TABLE IF NOT EXISTS sewspace_drafts (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('post', 'project', 'stash', 'topic')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sewspace_drafts_user_kind_idx ON sewspace_drafts (user_id, kind);

ALTER TABLE sewspace_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_all ON sewspace_drafts;
CREATE POLICY owner_all ON sewspace_drafts TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON sewspace_drafts TO sewspace_app;
GRANT USAGE, SELECT ON SEQUENCE sewspace_drafts_id_seq TO sewspace_app;
