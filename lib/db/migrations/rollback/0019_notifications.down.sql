-- Rollback for 0019: removes the notification triggers and table (notifications only;
-- likes, comments, follows and the rest are untouched).
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0019_notifications.down.sql
BEGIN;
DROP TRIGGER IF EXISTS sewspace_notify_like ON sewspace_likes;
DROP TRIGGER IF EXISTS sewspace_notify_comment ON sewspace_comments;
DROP TRIGGER IF EXISTS sewspace_notify_follow ON sewspace_follows;
DROP TRIGGER IF EXISTS sewspace_notify_forum_reply ON sewspace_forum_replies;
DROP TRIGGER IF EXISTS sewspace_notify_accepted ON sewspace_forum_topics;
DROP TRIGGER IF EXISTS sewspace_notify_entry ON sewspace_challenge_entries;
DROP FUNCTION IF EXISTS sewspace_notify_like(), sewspace_notify_comment(), sewspace_notify_follow(),
  sewspace_notify_forum_reply(), sewspace_notify_accepted(), sewspace_notify_entry();
DROP FUNCTION IF EXISTS sewspace_notify(text, text, text, integer, integer, integer, integer, integer);
DROP TABLE IF EXISTS sewspace_notifications;
DELETE FROM sewspace_schema_migrations WHERE name = '0019_notifications.sql';
COMMIT;
