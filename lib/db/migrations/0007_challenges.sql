-- Phase 6: challenges. A host starts a hashtag challenge with dates and rules;
-- people join and enter their own public posts while it runs; the host can
-- remove entries that break the rules. Additive: new tables, functions and
-- policies; the report kinds check is widened to accept 'challenge'.

CREATE TABLE IF NOT EXISTS sewspace_challenges (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]{3,30}$'),
  tag text NOT NULL CHECK (tag ~ '^[A-Za-z0-9]{3,30}$' AND lower(tag) = slug),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  rules text NOT NULL DEFAULT '' CHECK (length(rules) <= 2000),
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  created_by varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '92 days')
);
CREATE INDEX IF NOT EXISTS sewspace_challenges_dates_idx ON sewspace_challenges (ends_at, starts_at);

CREATE TABLE IF NOT EXISTS sewspace_challenge_members (
  challenge_id integer NOT NULL REFERENCES sewspace_challenges (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX IF NOT EXISTS sewspace_challenge_members_user_idx ON sewspace_challenge_members (user_id);

-- An entry is one of the entrant's own posts. Removed entries keep their row
-- (removed_at), so the same post can't simply be entered again.
CREATE TABLE IF NOT EXISTS sewspace_challenge_entries (
  id serial PRIMARY KEY,
  challenge_id integer NOT NULL REFERENCES sewspace_challenges (id) ON DELETE CASCADE,
  post_id integer NOT NULL REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  removed_at timestamp with time zone,
  removed_by varchar(255),
  UNIQUE (challenge_id, post_id)
);
CREATE INDEX IF NOT EXISTS sewspace_challenge_entries_post_idx ON sewspace_challenge_entries (post_id);

GRANT SELECT, INSERT ON sewspace_challenges TO sewspace_app;
-- Hosts may reword a challenge; its tag and dates stay as announced.
GRANT UPDATE (title, description, rules, updated_at) ON sewspace_challenges TO sewspace_app;
GRANT DELETE ON sewspace_challenges TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_challenge_members TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_challenge_entries TO sewspace_app;
-- Hosts only mark entries removed.
GRANT UPDATE (removed_at, removed_by) ON sewspace_challenge_entries TO sewspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sewspace_app;
ALTER TABLE sewspace_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_challenge_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_challenge_entries ENABLE ROW LEVEL SECURITY;

-- Reports may now be about a challenge.
ALTER TABLE sewspace_reports DROP CONSTRAINT IF EXISTS sewspace_reports_target_kind_check;
ALTER TABLE sewspace_reports ADD CONSTRAINT sewspace_reports_target_kind_check
  CHECK (target_kind IN ('post', 'comment', 'profile', 'review', 'challenge'));

-- Challenges are public, except across a block with the host.
CREATE POLICY visible_read ON sewspace_challenges FOR SELECT TO sewspace_app
  USING (NOT sewspace_blocked_with(created_by));
CREATE POLICY own_insert ON sewspace_challenges FOR INSERT TO sewspace_app
  WITH CHECK (created_by = sewspace_current_user_id());
CREATE POLICY host_update ON sewspace_challenges FOR UPDATE TO sewspace_app
  USING (created_by = sewspace_current_user_id())
  WITH CHECK (created_by = sewspace_current_user_id());
CREATE POLICY admin_delete ON sewspace_challenges FOR DELETE TO sewspace_app
  USING (sewspace_is_admin() AND EXISTS (
    SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'challenge' AND r.target_id = sewspace_challenges.slug));

-- Members: shown with the challenge (not across blocks); you join and leave as
-- yourself, and only until the challenge ends.
CREATE POLICY visible_read ON sewspace_challenge_members FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_challenges c WHERE c.id = challenge_id) AND NOT sewspace_blocked_with(user_id));
CREATE POLICY own_join ON sewspace_challenge_members FOR INSERT TO sewspace_app
  WITH CHECK (user_id = sewspace_current_user_id()
              AND EXISTS (SELECT 1 FROM sewspace_challenges c WHERE c.id = challenge_id AND now() < c.ends_at));
CREATE POLICY own_leave ON sewspace_challenge_members FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id());

-- Entries: everyone who can see the post and the challenge sees an entry until
-- the host removes it; the entrant and the host always see it.
CREATE POLICY visible_read ON sewspace_challenge_entries FOR SELECT TO sewspace_app
  USING (
    user_id = sewspace_current_user_id()
    OR EXISTS (SELECT 1 FROM sewspace_challenges c WHERE c.id = challenge_id AND c.created_by = sewspace_current_user_id())
    OR (removed_at IS NULL
        AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id)
        AND EXISTS (SELECT 1 FROM sewspace_challenges c WHERE c.id = challenge_id))
  );
-- Enter your own public post, while the challenge runs, once you've joined.
CREATE POLICY own_enter ON sewspace_challenge_entries FOR INSERT TO sewspace_app
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND removed_at IS NULL AND removed_by IS NULL
    AND EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_current_user_id() AND p.visibility = 'public')
    AND EXISTS (SELECT 1 FROM sewspace_challenges c WHERE c.id = challenge_id AND now() BETWEEN c.starts_at AND c.ends_at)
    AND EXISTS (SELECT 1 FROM sewspace_challenge_members m WHERE m.challenge_id = sewspace_challenge_entries.challenge_id
                AND m.user_id = sewspace_current_user_id())
  );
-- Withdraw your own entry (not one the host already removed).
CREATE POLICY own_withdraw ON sewspace_challenge_entries FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id() AND removed_at IS NULL);
-- The host removes entries (marks them; see the column grant above).
CREATE POLICY host_remove ON sewspace_challenge_entries FOR UPDATE TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_challenges c WHERE c.id = challenge_id AND c.created_by = sewspace_current_user_id()))
  WITH CHECK (removed_by = sewspace_current_user_id());

-- Members and live entries per challenge, counted over everyone (numbers only).
CREATE OR REPLACE FUNCTION sewspace_challenge_counts(ids integer[])
  RETURNS TABLE (challenge_id integer, members bigint, entries bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT c.id,
      (SELECT count(*) FROM sewspace_challenge_members m WHERE m.challenge_id = c.id),
      (SELECT count(*) FROM sewspace_challenge_entries e JOIN sewspace_posts p ON p.id = e.post_id
        WHERE e.challenge_id = c.id AND e.removed_at IS NULL AND p.visibility = 'public')
    FROM sewspace_challenges c
    WHERE c.id = ANY(ids)
  $$;
REVOKE ALL ON FUNCTION sewspace_challenge_counts(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_challenge_counts(integer[]) TO sewspace_app;
