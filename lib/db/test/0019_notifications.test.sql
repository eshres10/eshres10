-- Notifications: written only by triggers, read only by the recipient, gone when
-- undone, hidden across a block and when the thing they point to isn't visible.
\i test/helpers.psql
INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('nt_a', 'Ann', 'nt.ann'), ('nt_b', 'Ben', 'nt.ben'), ('nt_c', 'Cy', 'nt.cy');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES (21901, 'nt_a', 'status', 'hello', 'public');

-- Likes: Ben likes Ann's post; Ann liking her own post tells nobody.
INSERT INTO sewspace_likes (user_id, post_id) VALUES ('nt_b', 21901), ('nt_a', 21901);
SELECT t.act_as('nt_a');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'like'), 1, 'a like tells the author, not for liking your own');
SELECT t.act_as('nt_b');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications), 0, 'nobody else reads them');
SELECT t.rejects($$INSERT INTO sewspace_notifications (recipient_id, actor_id, kind) VALUES ('nt_a', 'nt_b', 'follow')$$, 'nobody can create one');
SELECT t.eq(t.affected($$UPDATE sewspace_notifications SET read_at = now()$$), 0, 'nor mark someone else''s read');
SELECT t.act_as('nt_a');
SELECT t.eq(t.affected($$UPDATE sewspace_notifications SET read_at = now() WHERE kind = 'like'$$), 1, 'the recipient marks it read');
SELECT t.rejects($$UPDATE sewspace_notifications SET recipient_id = 'nt_c'$$, 'and can change nothing else');
SELECT t.rejects($$DELETE FROM sewspace_notifications$$, 'or delete them');
RESET ROLE;
DELETE FROM sewspace_likes WHERE user_id = 'nt_b';
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE recipient_id LIKE 'nt\_%' AND kind = 'like'), 0, 'unliking takes it away');

-- Comments and replies.
INSERT INTO sewspace_comments (id, post_id, user_id, body) VALUES (21901, 21901, 'nt_b', 'nice');
INSERT INTO sewspace_comments (id, post_id, user_id, parent_id, body) VALUES (21902, 21901, 'nt_c', 21901, 'agree');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE recipient_id = 'nt_a' AND kind = 'comment'), 2, 'the post author hears of the comment and the reply');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE recipient_id = 'nt_b' AND kind = 'comment_reply'), 1, 'the comment author hears of the reply');
INSERT INTO sewspace_comments (id, post_id, user_id, parent_id, body) VALUES (21903, 21901, 'nt_a', 21901, 'thanks');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE comment_id = 21903), 1, 'the author replying tells the commenter only');
DELETE FROM sewspace_comments WHERE id = 21903;
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE comment_id = 21903), 0, 'a deleted comment takes its notification with it');

-- Not visible any more: Ann makes the post private, so Ben no longer sees the reply notification.
UPDATE sewspace_posts SET visibility = 'private' WHERE id = 21901;
SELECT t.act_as('nt_b');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications), 0, 'nothing about a post you can no longer see');
SELECT t.act_as('nt_a');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'comment'), 2, 'the author still sees her own post''s');
RESET ROLE;
UPDATE sewspace_posts SET visibility = 'public' WHERE id = 21901;

-- Follows.
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('nt_c', 'nt_a');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'follow' AND recipient_id = 'nt_a'), 1, 'a new follower');
DELETE FROM sewspace_follows WHERE follower_id = 'nt_c';
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE recipient_id LIKE 'nt\_%' AND kind = 'follow'), 0, 'unfollowing takes it away');

-- Forum: a reply, an accepted answer, a changed mind.
INSERT INTO sewspace_forum_topics (id, user_id, board, kind, title) VALUES (21901, 'nt_a', 'fitting', 'question', 'Gaping neckline?');
INSERT INTO sewspace_forum_replies (id, topic_id, user_id, body) VALUES (21901, 21901, 'nt_b', 'Take a dart'), (21902, 21901, 'nt_c', 'Stay tape');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'forum_reply' AND recipient_id = 'nt_a'), 2, 'replies to your topic');
UPDATE sewspace_forum_topics SET accepted_reply_id = 21901 WHERE id = 21901;
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'answer_accepted' AND recipient_id = 'nt_b'), 1, 'your answer was accepted');
UPDATE sewspace_forum_topics SET accepted_reply_id = 21902 WHERE id = 21901;
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'answer_accepted' AND recipient_id = 'nt_b'), 0, 'un-told when the asker changes their mind');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'answer_accepted' AND recipient_id = 'nt_c'), 1, 'and the new answer''s author is told');

-- Challenge entries.
INSERT INTO sewspace_challenges (id, slug, tag, title, starts_at, ends_at, created_by) VALUES (21901, 'ntdenim', 'NTDenim', 'Denim', now() - interval '1 day', now() + interval '9 days', 'nt_a');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES (21902, 'nt_b', 'status', 'my entry', 'public');
INSERT INTO sewspace_challenge_entries (challenge_id, post_id, user_id) VALUES (21901, 21902, 'nt_b');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE kind = 'challenge_entry' AND recipient_id = 'nt_a'), 1, 'the host hears of an entry');
DELETE FROM sewspace_challenge_entries WHERE post_id = 21902;
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE recipient_id LIKE 'nt\_%' AND kind = 'challenge_entry'), 0, 'withdrawing takes it away');

-- Blocks: Ann blocks Ben. His earlier notifications disappear for her and new ones aren't written.
-- A like on Ann's own post: only the block rule can hide this one (the post stays visible to her).
INSERT INTO sewspace_likes (user_id, post_id) VALUES ('nt_b', 21901);
INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES ('nt_a', 'nt_b');
SELECT t.act_as('nt_a');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE actor_id = 'nt_b'), 0, 'nothing from someone you blocked, even older ones');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE actor_id = 'nt_c'), 2, 'others still show (his reply on her post and his forum reply)');
RESET ROLE;
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('nt_b', 'nt_a');
SELECT t.eq((SELECT count(*) FROM sewspace_notifications WHERE recipient_id LIKE 'nt\_%' AND kind = 'follow'), 0, 'and nothing new is written across a block');
\echo '  notifications: ok'
