-- Notifications (owner-approved plan, step N1): the bell. One row per thing to
-- tell someone. Rows are written only by the SECURITY DEFINER triggers below,
-- when the real action happens (no INSERT grant: nobody can create a
-- notification through the app), and removed again when it's undone (unlike,
-- unfollow, withdrawn entry, unaccepted answer; deleted comments, replies, posts
-- and topics cascade).
--
-- Reading (RLS): only the recipient; nothing from someone either side of a
-- block (even older rows); and only while the thing it points to is still
-- visible to the recipient, checked through those tables' own RLS. The
-- recipient may only mark rows read (column grant on read_at).
CREATE TABLE IF NOT EXISTS sewspace_notifications (
  id bigserial PRIMARY KEY,
  recipient_id varchar(255) NOT NULL,
  actor_id varchar(255) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('like', 'comment', 'comment_reply', 'follow', 'forum_reply', 'answer_accepted', 'challenge_entry')),
  post_id integer REFERENCES sewspace_posts (id) ON DELETE CASCADE,
  comment_id integer REFERENCES sewspace_comments (id) ON DELETE CASCADE,
  topic_id integer REFERENCES sewspace_forum_topics (id) ON DELETE CASCADE,
  reply_id integer REFERENCES sewspace_forum_replies (id) ON DELETE CASCADE,
  challenge_id integer REFERENCES sewspace_challenges (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CHECK (recipient_id <> actor_id)
);
CREATE INDEX IF NOT EXISTS sewspace_notifications_recipient_idx ON sewspace_notifications (recipient_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS sewspace_notifications_unread_idx ON sewspace_notifications (recipient_id) WHERE read_at IS NULL;

ALTER TABLE sewspace_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sewspace_notifications TO sewspace_app;
GRANT UPDATE (read_at) ON sewspace_notifications TO sewspace_app;

DROP POLICY IF EXISTS recipient_read ON sewspace_notifications;
CREATE POLICY recipient_read ON sewspace_notifications FOR SELECT TO sewspace_app
  USING (
    recipient_id = sewspace_current_user_id()
    AND NOT sewspace_blocked_with(actor_id)
    AND (post_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_posts p WHERE p.id = post_id))
    AND (comment_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_comments c WHERE c.id = comment_id))
    AND (topic_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_forum_topics t WHERE t.id = topic_id))
    AND (reply_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_forum_replies r WHERE r.id = reply_id))
    AND (challenge_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_challenges ch WHERE ch.id = challenge_id))
  );
DROP POLICY IF EXISTS recipient_mark_read ON sewspace_notifications;
CREATE POLICY recipient_mark_read ON sewspace_notifications FOR UPDATE TO sewspace_app
  USING (recipient_id = sewspace_current_user_id())
  WITH CHECK (recipient_id = sewspace_current_user_id());

-- One place that writes: never to yourself, never across a block.
CREATE OR REPLACE FUNCTION sewspace_notify(recipient text, actor text, what text,
  p_post integer DEFAULT NULL, p_comment integer DEFAULT NULL, p_topic integer DEFAULT NULL,
  p_reply integer DEFAULT NULL, p_challenge integer DEFAULT NULL) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF recipient IS NULL OR actor IS NULL OR recipient = actor THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM sewspace_blocks b
             WHERE (b.blocker_id = recipient AND b.blocked_id = actor) OR (b.blocker_id = actor AND b.blocked_id = recipient)) THEN
    RETURN;
  END IF;
  INSERT INTO sewspace_notifications (recipient_id, actor_id, kind, post_id, comment_id, topic_id, reply_id, challenge_id)
  VALUES (recipient, actor, what, p_post, p_comment, p_topic, p_reply, p_challenge);
END $$;
REVOKE ALL ON FUNCTION sewspace_notify(text, text, text, integer, integer, integer, integer, integer) FROM PUBLIC;

-- Likes on your post.
CREATE OR REPLACE FUNCTION sewspace_notify_like() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sewspace_notify((SELECT user_id FROM sewspace_posts WHERE id = NEW.post_id), NEW.user_id, 'like', NEW.post_id);
    RETURN NEW;
  END IF;
  DELETE FROM sewspace_notifications WHERE kind = 'like' AND actor_id = OLD.user_id AND post_id = OLD.post_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS sewspace_notify_like ON sewspace_likes;
CREATE TRIGGER sewspace_notify_like AFTER INSERT OR DELETE ON sewspace_likes
  FOR EACH ROW EXECUTE FUNCTION sewspace_notify_like();

-- Comments on your post; replies to your comment (the post's author is told too,
-- unless they wrote the comment being replied to). Deleting the comment cascades.
CREATE OR REPLACE FUNCTION sewspace_notify_comment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE post_author text; parent_author text;
BEGIN
  SELECT user_id INTO post_author FROM sewspace_posts WHERE id = NEW.post_id;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM sewspace_comments WHERE id = NEW.parent_id;
    PERFORM sewspace_notify(parent_author, NEW.user_id, 'comment_reply', NEW.post_id, NEW.id);
  END IF;
  IF post_author IS DISTINCT FROM parent_author THEN
    PERFORM sewspace_notify(post_author, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_notify_comment ON sewspace_comments;
CREATE TRIGGER sewspace_notify_comment AFTER INSERT ON sewspace_comments
  FOR EACH ROW EXECUTE FUNCTION sewspace_notify_comment();

-- New followers.
CREATE OR REPLACE FUNCTION sewspace_notify_follow() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sewspace_notify(NEW.followee_id, NEW.follower_id, 'follow');
    RETURN NEW;
  END IF;
  DELETE FROM sewspace_notifications WHERE kind = 'follow' AND actor_id = OLD.follower_id AND recipient_id = OLD.followee_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS sewspace_notify_follow ON sewspace_follows;
CREATE TRIGGER sewspace_notify_follow AFTER INSERT OR DELETE ON sewspace_follows
  FOR EACH ROW EXECUTE FUNCTION sewspace_notify_follow();

-- Replies to your forum topic (deleting the reply cascades).
CREATE OR REPLACE FUNCTION sewspace_notify_forum_reply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sewspace_notify((SELECT user_id FROM sewspace_forum_topics WHERE id = NEW.topic_id), NEW.user_id, 'forum_reply', NULL, NULL, NEW.topic_id, NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_notify_forum_reply ON sewspace_forum_replies;
CREATE TRIGGER sewspace_notify_forum_reply AFTER INSERT ON sewspace_forum_replies
  FOR EACH ROW EXECUTE FUNCTION sewspace_notify_forum_reply();

-- Your answer was accepted (and un-told if the asker changes their mind).
CREATE OR REPLACE FUNCTION sewspace_notify_accepted() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.accepted_reply_id IS NOT NULL THEN
    DELETE FROM sewspace_notifications WHERE kind = 'answer_accepted' AND reply_id = OLD.accepted_reply_id;
  END IF;
  IF NEW.accepted_reply_id IS NOT NULL THEN
    PERFORM sewspace_notify((SELECT user_id FROM sewspace_forum_replies WHERE id = NEW.accepted_reply_id), NEW.user_id,
      'answer_accepted', NULL, NULL, NEW.id, NEW.accepted_reply_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sewspace_notify_accepted ON sewspace_forum_topics;
CREATE TRIGGER sewspace_notify_accepted AFTER UPDATE OF accepted_reply_id ON sewspace_forum_topics
  FOR EACH ROW WHEN (OLD.accepted_reply_id IS DISTINCT FROM NEW.accepted_reply_id)
  EXECUTE FUNCTION sewspace_notify_accepted();

-- Someone entered your challenge (removed again if they withdraw).
CREATE OR REPLACE FUNCTION sewspace_notify_entry() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sewspace_notify((SELECT created_by FROM sewspace_challenges WHERE id = NEW.challenge_id), NEW.user_id,
      'challenge_entry', NEW.post_id, NULL, NULL, NULL, NEW.challenge_id);
    RETURN NEW;
  END IF;
  DELETE FROM sewspace_notifications WHERE kind = 'challenge_entry' AND challenge_id = OLD.challenge_id AND post_id = OLD.post_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS sewspace_notify_entry ON sewspace_challenge_entries;
CREATE TRIGGER sewspace_notify_entry AFTER INSERT OR DELETE ON sewspace_challenge_entries
  FOR EACH ROW EXECUTE FUNCTION sewspace_notify_entry();
