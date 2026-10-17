-- Phase 7: forum topics, replies, votes, accepted answers, polls, moderation.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('fa', 'Asker', 'f.ask'), ('fh', 'Helper', 'f.help'), ('fo', 'Other', 'f.oth'), ('fb', 'Blocked', 'f.blk'), ('fx', 'Admin', 'f.adm');
INSERT INTO sewspace_blocks VALUES ('fa', 'fb');
INSERT INTO sewspace_projects (id, user_id, name) VALUES (1101, 'fa', 'Asker make'), (1102, 'fo', 'Other make');

RESET ROLE;
CREATE OR REPLACE FUNCTION t.admin(on_ boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.is_admin', CASE WHEN on_ THEN 'on' ELSE '' END, false)
$$;
GRANT EXECUTE ON FUNCTION t.admin(boolean) TO sewspace_app;
CREATE OR REPLACE FUNCTION t.poll_revealed(topic integer) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM sewspace_poll_results(topic) WHERE revealed
$$;
GRANT EXECUTE ON FUNCTION t.poll_revealed(integer) TO sewspace_app;

-- Topics.
SELECT t.act_as('fa');
INSERT INTO sewspace_forum_topics (id, user_id, board, kind, title, body, tags, project_id) VALUES
  (1, 'fa', 'fabric', 'question', 'How do I stop linen shifting?', 'Midweight linen', '{linen,cutting}', 1101);
INSERT INTO sewspace_forum_topics (id, user_id, board, kind, title, poll_closes_at) VALUES
  (2, 'fa', 'machines', 'poll', 'Which closure do you trust?', now() + interval '3 days'),
  (3, 'fa', 'machines', 'poll', 'Old poll', now() + interval '1 hour');
INSERT INTO sewspace_forum_poll_options (id, topic_id, position, label) VALUES (1, 2, 1, 'Zip'), (2, 2, 2, 'Buttons'), (3, 3, 1, 'Yes'), (4, 3, 2, 'No');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title) VALUES ('fh', 'fabric', 'question', 'As someone else')$$, 'cannot post as someone else');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title, pinned) VALUES ('fa', 'fabric', 'info', 'Pin myself', true)$$, 'cannot start pinned');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title, vote_count) VALUES ('fa', 'fabric', 'info', 'Free votes', 99)$$, 'cannot start with votes');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title, project_id) VALUES ('fa', 'fabric', 'info', 'Not my make', 1102)$$, 'cannot link someone else''s make');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title, tags) VALUES ('fa', 'fabric', 'info', 'Bad tags', '{"Has Space"}')$$, 'tag format');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title, tags) VALUES ('fa', 'fabric', 'info', 'Bad comma tag', ARRAY['linen,cotton'])$$, 'comma is not a tag character');
SELECT t.rejects($$INSERT INTO sewspace_forum_topics (user_id, board, kind, title, tags) VALUES ('fa', 'fabric', 'info', 'Bad tilde tag', ARRAY['linen~cotton'])$$, 'tilde is not a tag character');
SELECT t.rejects($$UPDATE sewspace_forum_topics SET pinned = true WHERE id = 1$$, 'authors cannot pin');
SELECT t.rejects($$UPDATE sewspace_forum_topics SET vote_count = 500 WHERE id = 1$$, 'authors cannot set counters');
SELECT t.eq(t.affected($$UPDATE sewspace_forum_topics SET body = 'Midweight washed linen' WHERE id = 1$$), 1, 'author edits');
SELECT t.act_as('fh');
SELECT t.rejects($$INSERT INTO sewspace_forum_poll_options (topic_id, position, label) VALUES (2, 3, 'Velcro')$$, 'only the author adds poll options');
SELECT t.eq(t.affected($$UPDATE sewspace_forum_topics SET title = 'Hijack' WHERE id = 1$$), 0, 'others cannot edit');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_forum_topics), 3, 'signed out reads the forum');
SELECT t.act_as('fb');
SELECT t.eq((SELECT count(*) FROM sewspace_forum_topics), 0, 'blocked: no topics from that person');

-- Replies, counters and accepted answers.
SELECT t.act_as('fh');
INSERT INTO sewspace_forum_replies (id, topic_id, user_id, body) VALUES (1, 1, 'fh', 'Starch it and use weights.');
INSERT INTO sewspace_forum_replies (id, topic_id, user_id, parent_id, body) VALUES (2, 1, 'fh', 1, 'And cut single layer.');
SELECT t.rejects($$INSERT INTO sewspace_forum_replies (topic_id, user_id, parent_id, body) VALUES (1, 'fh', 2, 'too deep')$$, 'one level of replies');
SELECT t.rejects($$INSERT INTO sewspace_forum_replies (topic_id, user_id, body) VALUES (1, 'fa', 'as someone else')$$, 'cannot reply as someone else');
SELECT t.act_as('fb');
SELECT t.rejects($$INSERT INTO sewspace_forum_replies (topic_id, user_id, body) VALUES (1, 'fb', 'x')$$, 'cannot reply across a block');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT reply_count FROM sewspace_forum_topics WHERE id = 1), 2, 'reply counter');
SELECT t.act_as('fh');
SELECT t.eq(t.affected($$UPDATE sewspace_forum_topics SET accepted_reply_id = 1 WHERE id = 1$$), 0, 'only the asker accepts');
SELECT t.act_as('fa');
SELECT t.eq(t.affected($$UPDATE sewspace_forum_topics SET accepted_reply_id = 1 WHERE id = 1$$), 1, 'asker accepts an answer');
INSERT INTO sewspace_forum_replies (id, topic_id, user_id, body) VALUES (3, 2, 'fa', 'poll reply');
SELECT t.rejects($$UPDATE sewspace_forum_topics SET accepted_reply_id = 3 WHERE id = 1$$, 'accepted answer must be in this topic');
SELECT t.rejects($$UPDATE sewspace_forum_topics SET accepted_reply_id = 3 WHERE id = 2$$, 'only questions have accepted answers');

-- Upvotes.
SELECT t.act_as('fo');
INSERT INTO sewspace_forum_votes (target_kind, target_id, user_id) VALUES ('topic', 1, 'fo'), ('reply', 1, 'fo');
SELECT t.rejects($$INSERT INTO sewspace_forum_votes (target_kind, target_id, user_id) VALUES ('topic', 1, 'fh')$$, 'cannot vote as someone else');
SELECT t.act_as('fh');
SELECT t.rejects($$INSERT INTO sewspace_forum_votes (target_kind, target_id, user_id) VALUES ('reply', 1, 'fh')$$, 'cannot upvote your own reply');
SELECT t.eq((SELECT count(*) FROM sewspace_forum_votes), 0, 'votes are private');
SELECT t.eq((SELECT vote_count FROM sewspace_forum_topics WHERE id = 1), 1, 'topic vote counter');
SELECT t.eq((SELECT vote_count FROM sewspace_forum_replies WHERE id = 1), 1, 'reply vote counter');
SELECT t.act_as('fo');
DELETE FROM sewspace_forum_votes WHERE target_kind = 'topic' AND target_id = 1;
SELECT t.eq((SELECT vote_count FROM sewspace_forum_topics WHERE id = 1), 0, 'unvote lowers the counter');

-- Polls: results hidden until you vote; votes change while open.
SELECT t.act_as('fo');
SELECT t.eq(t.poll_revealed(2), 0, 'results hidden before voting');
SELECT t.eq((SELECT max(total) FROM sewspace_poll_results(2)), 0, 'total is always shown');
INSERT INTO sewspace_forum_poll_votes (topic_id, user_id, option_id) VALUES (2, 'fo', 1);
SELECT t.rejects($$INSERT INTO sewspace_forum_poll_votes (topic_id, user_id, option_id) VALUES (2, 'fo', 3)$$, 'option must belong to the poll');
SELECT t.eq(t.poll_revealed(2), 2, 'results shown after voting');
SELECT t.eq(t.affected($$UPDATE sewspace_forum_poll_votes SET option_id = 2 WHERE topic_id = 2$$), 1, 'change your vote while open');
SELECT t.rejects($$UPDATE sewspace_forum_poll_votes SET option_id = 3 WHERE topic_id = 2$$, 'cannot move a vote to another poll''s option');
SELECT t.act_as('fh');
SELECT t.eq(t.poll_revealed(2), 0, 'still hidden for someone who has not voted');
SELECT t.eq((SELECT count(*) FROM sewspace_forum_poll_votes), 0, 'poll votes are private');
SELECT t.act_as('fa');
SELECT t.eq(t.poll_revealed(2), 2, 'the poll author sees results');
RESET ROLE;
UPDATE sewspace_forum_topics SET poll_closes_at = now() - interval '1 minute' WHERE id = 3;
SELECT t.act_as('fh');
SELECT t.rejects($$INSERT INTO sewspace_forum_poll_votes (topic_id, user_id, option_id) VALUES (3, 'fh', 3)$$, 'cannot vote after it closes');
SELECT t.eq(t.poll_revealed(3), 2, 'closed polls show results to everyone');
SELECT t.act_as('fb');
SELECT t.eq((SELECT count(*) FROM sewspace_poll_results(2)), 0, 'no poll across a block');

-- Admins pin and lock; locked topics take no new replies.
SELECT t.act_as('fa');
SELECT t.eq((SELECT sewspace_forum_moderate(1, true, true)::int), 0, 'non-admins cannot moderate');
SELECT t.admin(true);
SELECT t.act_as('fx');
SELECT t.eq((SELECT sewspace_forum_moderate(1, true, true)::int), 1, 'admin pins and locks');
SELECT t.admin(false);
SELECT t.act_as('fh');
SELECT t.rejects($$INSERT INTO sewspace_forum_replies (topic_id, user_id, body) VALUES (1, 'fh', 'late')$$, 'locked topics take no replies');

-- Reports: admins remove only reported topics and replies.
SELECT t.act_as('fo');
INSERT INTO sewspace_reports (reporter_id, target_kind, target_id, target_user_id, reason) VALUES ('fo', 'forum_reply', '2', 'fh', 'spam');
SELECT t.admin(true);
SELECT t.act_as('fx');
SELECT t.eq(t.affected($$DELETE FROM sewspace_forum_replies WHERE id = 1$$), 0, 'admin cannot remove an unreported reply');
SELECT t.eq(t.affected($$DELETE FROM sewspace_forum_replies WHERE id = 2$$), 1, 'admin removes a reported reply');
SELECT t.eq(t.affected($$DELETE FROM sewspace_forum_topics WHERE id = 2$$), 0, 'admin cannot remove an unreported topic');
SELECT t.admin(false);
SELECT t.act_as('fa');
SELECT t.eq(t.affected($$DELETE FROM sewspace_forum_topics WHERE id = 3$$), 1, 'author deletes own topic');
RESET ROLE;
\echo '  forum topics, replies, votes, polls, accepted answers, moderation: ok'
