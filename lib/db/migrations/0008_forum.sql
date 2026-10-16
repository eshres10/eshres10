-- Phase 7: the Forum. Topics on boards (show & tell, questions,
-- recommendations, info & guides, polls), one level of replies, upvotes,
-- accepted answers, polls, admin pin/lock. Topics are public, like the rest
-- of the community, except across a block. Additive: new tables, functions,
-- triggers and policies; report kinds widened to 'topic' and 'forum_reply'.

CREATE OR REPLACE FUNCTION sewspace_valid_tags(tags text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT coalesce(array_length(tags, 1), 0) <= 5 AND coalesce((SELECT bool_and(t ~ '^[a-z0-9-]{1,30}$') FROM unnest(tags) t), true) $$;

CREATE TABLE IF NOT EXISTS sewspace_forum_topics (
  id serial PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  board text NOT NULL CHECK (board IN ('fitting', 'fabric', 'machines', 'patterns', 'beginners', 'mending', 'meetups')),
  kind text NOT NULL CHECK (kind IN ('show_tell', 'question', 'recommendation', 'info', 'poll')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 140),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 10000),
  tags text[] NOT NULL DEFAULT '{}' CHECK (sewspace_valid_tags(tags)),
  catalog_id integer REFERENCES sewspace_catalog (id) ON DELETE SET NULL,
  project_id integer REFERENCES sewspace_projects (id) ON DELETE SET NULL,
  post_id integer REFERENCES sewspace_posts (id) ON DELETE SET NULL,
  accepted_reply_id integer,
  pinned boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  poll_closes_at timestamp with time zone,
  vote_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_activity_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK ((kind = 'poll') = (poll_closes_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sewspace_forum_topics_activity_idx ON sewspace_forum_topics (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS sewspace_forum_topics_board_idx ON sewspace_forum_topics (board, kind);
CREATE INDEX IF NOT EXISTS sewspace_forum_topics_catalog_idx ON sewspace_forum_topics (catalog_id);
CREATE INDEX IF NOT EXISTS sewspace_forum_topics_project_idx ON sewspace_forum_topics (project_id);

CREATE TABLE IF NOT EXISTS sewspace_forum_replies (
  id serial PRIMARY KEY,
  topic_id integer NOT NULL REFERENCES sewspace_forum_topics (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  parent_id integer REFERENCES sewspace_forum_replies (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  catalog_id integer REFERENCES sewspace_catalog (id) ON DELETE SET NULL,
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sewspace_forum_replies_topic_idx ON sewspace_forum_replies (topic_id, created_at);
DO $$ BEGIN
  ALTER TABLE sewspace_forum_topics ADD CONSTRAINT sewspace_forum_topics_accepted_fk
    FOREIGN KEY (accepted_reply_id) REFERENCES sewspace_forum_replies (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Upvotes on topics and replies (no downvotes).
CREATE TABLE IF NOT EXISTS sewspace_forum_votes (
  target_kind text NOT NULL CHECK (target_kind IN ('topic', 'reply')),
  target_id integer NOT NULL,
  user_id varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, user_id)
);

CREATE TABLE IF NOT EXISTS sewspace_forum_poll_options (
  id serial PRIMARY KEY,
  topic_id integer NOT NULL REFERENCES sewspace_forum_topics (id) ON DELETE CASCADE,
  position smallint NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  UNIQUE (topic_id, position)
);

-- One choice per person per poll; changing it is an update while it's open.
CREATE TABLE IF NOT EXISTS sewspace_forum_poll_votes (
  topic_id integer NOT NULL REFERENCES sewspace_forum_topics (id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  option_id integer NOT NULL REFERENCES sewspace_forum_poll_options (id) ON DELETE CASCADE,
  voted_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)
);

-- What the app may change. Counters, pin and lock are never granted: triggers
-- keep the counters, and sewspace_forum_moderate() (admins) sets pin/lock.
GRANT SELECT, INSERT, DELETE ON sewspace_forum_topics TO sewspace_app;
GRANT UPDATE (title, body, tags, accepted_reply_id, updated_at) ON sewspace_forum_topics TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_forum_replies TO sewspace_app;
GRANT UPDATE (body, updated_at) ON sewspace_forum_replies TO sewspace_app;
GRANT SELECT, INSERT, DELETE ON sewspace_forum_votes TO sewspace_app;
GRANT SELECT, INSERT ON sewspace_forum_poll_options TO sewspace_app;
GRANT SELECT, INSERT ON sewspace_forum_poll_votes TO sewspace_app;
GRANT UPDATE (option_id, voted_at) ON sewspace_forum_poll_votes TO sewspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sewspace_app;
ALTER TABLE sewspace_forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_forum_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_forum_poll_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE sewspace_reports DROP CONSTRAINT IF EXISTS sewspace_reports_target_kind_check;
ALTER TABLE sewspace_reports ADD CONSTRAINT sewspace_reports_target_kind_check
  CHECK (target_kind IN ('post', 'comment', 'profile', 'review', 'challenge', 'topic', 'forum_reply'));

-- Topics: public, except across a block. Written as yourself, starting
-- unpinned, unlocked, unanswered and uncounted; a linked make or feed post
-- must be your own.
CREATE POLICY visible_read ON sewspace_forum_topics FOR SELECT TO sewspace_app
  USING (NOT sewspace_blocked_with(user_id));
CREATE POLICY own_insert ON sewspace_forum_topics FOR INSERT TO sewspace_app
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND NOT pinned AND NOT locked AND accepted_reply_id IS NULL AND vote_count = 0 AND reply_count = 0
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id AND p.user_id = sewspace_current_user_id()))
    AND (post_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id AND p.user_id = sewspace_current_user_id()))
  );
CREATE POLICY author_update ON sewspace_forum_topics FOR UPDATE TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY author_delete ON sewspace_forum_topics FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id()
         OR (sewspace_is_admin() AND EXISTS (SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'topic' AND r.target_id = sewspace_forum_topics.id::text)));

-- Replies: shown with their topic, except across a block; written as
-- yourself on topics you can see that aren't locked.
CREATE POLICY visible_read ON sewspace_forum_replies FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id) AND NOT sewspace_blocked_with(user_id));
CREATE POLICY own_insert ON sewspace_forum_replies FOR INSERT TO sewspace_app
  WITH CHECK (user_id = sewspace_current_user_id() AND vote_count = 0
              AND EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id AND NOT t.locked));
CREATE POLICY own_update ON sewspace_forum_replies FOR UPDATE TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY own_delete ON sewspace_forum_replies FOR DELETE TO sewspace_app
  USING (user_id = sewspace_current_user_id()
         OR (sewspace_is_admin() AND EXISTS (SELECT 1 FROM sewspace_reports r WHERE r.target_kind = 'forum_reply' AND r.target_id = sewspace_forum_replies.id::text)));

-- Votes: private rows; you upvote things you can see that aren't your own.
CREATE POLICY own_votes ON sewspace_forum_votes TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND ((target_kind = 'topic' AND EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = target_id AND t.user_id <> sewspace_current_user_id()))
      OR (target_kind = 'reply' AND EXISTS (SELECT 1 FROM sewspace_forum_replies r WHERE r.id = target_id AND r.user_id <> sewspace_current_user_id())))
  );

-- Poll options: shown with the topic; added by the poll's author.
CREATE POLICY visible_read ON sewspace_forum_poll_options FOR SELECT TO sewspace_app
  USING (EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id));
CREATE POLICY author_insert ON sewspace_forum_poll_options FOR INSERT TO sewspace_app
  WITH CHECK (EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id AND t.kind = 'poll' AND t.user_id = sewspace_current_user_id()));

-- Poll votes: private rows; cast or changed while the poll is open, for an
-- option of that poll.
CREATE POLICY own_poll_vote ON sewspace_forum_poll_votes TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_forum_poll_options o WHERE o.id = option_id AND o.topic_id = sewspace_forum_poll_votes.topic_id)
    AND EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id AND t.poll_closes_at > now())
  );

-- Triggers (run as the owner): reply depth and topic, accepted answers,
-- counters and last activity.
CREATE OR REPLACE FUNCTION sewspace_forum_reply_check() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sewspace_forum_replies r WHERE r.id = NEW.parent_id AND r.topic_id = NEW.topic_id AND r.parent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'a reply must answer a top-level reply in the same topic' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_forum_reply_check ON sewspace_forum_replies;
CREATE TRIGGER sewspace_forum_reply_check BEFORE INSERT ON sewspace_forum_replies
  FOR EACH ROW EXECUTE FUNCTION sewspace_forum_reply_check();

CREATE OR REPLACE FUNCTION sewspace_forum_accept_check() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NEW.accepted_reply_id IS NOT NULL AND NEW.accepted_reply_id IS DISTINCT FROM OLD.accepted_reply_id AND (
    NEW.kind <> 'question'
    OR NOT EXISTS (SELECT 1 FROM sewspace_forum_replies r WHERE r.id = NEW.accepted_reply_id AND r.topic_id = NEW.id)
  ) THEN
    RAISE EXCEPTION 'only a reply in this question can be accepted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_forum_accept_check ON sewspace_forum_topics;
CREATE TRIGGER sewspace_forum_accept_check BEFORE UPDATE ON sewspace_forum_topics
  FOR EACH ROW EXECUTE FUNCTION sewspace_forum_accept_check();

CREATE OR REPLACE FUNCTION sewspace_forum_reply_counter() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sewspace_forum_topics SET reply_count = reply_count + 1, last_activity_at = now() WHERE id = NEW.topic_id;
    RETURN NEW;
  END IF;
  UPDATE sewspace_forum_topics SET reply_count = greatest(reply_count - 1, 0) WHERE id = OLD.topic_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS sewspace_forum_reply_counter ON sewspace_forum_replies;
CREATE TRIGGER sewspace_forum_reply_counter AFTER INSERT OR DELETE ON sewspace_forum_replies
  FOR EACH ROW EXECUTE FUNCTION sewspace_forum_reply_counter();

CREATE OR REPLACE FUNCTION sewspace_forum_vote_counter() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  kind text;
  target integer;
  delta integer;
BEGIN
  IF TG_OP = 'INSERT' THEN kind := NEW.target_kind; target := NEW.target_id; delta := 1;
  ELSE kind := OLD.target_kind; target := OLD.target_id; delta := -1;
  END IF;
  IF kind = 'topic' THEN
    UPDATE sewspace_forum_topics SET vote_count = greatest(vote_count + delta, 0) WHERE id = target;
  ELSE
    UPDATE sewspace_forum_replies SET vote_count = greatest(vote_count + delta, 0) WHERE id = target;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS sewspace_forum_vote_counter ON sewspace_forum_votes;
CREATE TRIGGER sewspace_forum_vote_counter AFTER INSERT OR DELETE ON sewspace_forum_votes
  FOR EACH ROW EXECUTE FUNCTION sewspace_forum_vote_counter();

-- Admins pin and lock topics (the only way to change those columns).
CREATE OR REPLACE FUNCTION sewspace_forum_moderate(topic integer, pin boolean, lock boolean) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NOT sewspace_is_admin() THEN RETURN false; END IF;
  UPDATE sewspace_forum_topics SET pinned = coalesce(pin, pinned), locked = coalesce(lock, locked) WHERE id = topic;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION sewspace_forum_moderate(integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_forum_moderate(integer, boolean, boolean) TO sewspace_app;

-- Poll results, only for people who voted, the poll's author, or once it has
-- closed (and never for a poll the caller can't see). Everyone gets the total.
CREATE OR REPLACE FUNCTION sewspace_poll_results(topic integer)
  RETURNS TABLE (option_id integer, votes bigint, total bigint, revealed boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    WITH t AS (
      SELECT id, user_id, poll_closes_at FROM sewspace_forum_topics
      WHERE id = topic AND kind = 'poll' AND NOT sewspace_blocked_with(user_id)
    ), shown AS (
      SELECT (t.poll_closes_at <= now()
              OR t.user_id = sewspace_current_user_id()
              OR EXISTS (SELECT 1 FROM sewspace_forum_poll_votes v WHERE v.topic_id = t.id AND v.user_id = sewspace_current_user_id())) AS ok
      FROM t
    )
    SELECT o.id,
           CASE WHEN shown.ok THEN (SELECT count(*) FROM sewspace_forum_poll_votes v WHERE v.option_id = o.id) END,
           (SELECT count(*) FROM sewspace_forum_poll_votes v WHERE v.topic_id = topic),
           shown.ok
    FROM t, shown JOIN sewspace_forum_poll_options o ON o.topic_id = topic
    ORDER BY o.position
  $$;
REVOKE ALL ON FUNCTION sewspace_poll_results(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_poll_results(integer) TO sewspace_app;
