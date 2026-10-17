-- Phase F4: Show & tell photos on forum topics follow their topic.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('sf4_a', 'Ann', 'sf4.ann'), ('sf4_b', 'Ben', 'sf4.ben'), ('sf4_x', 'Blocked', 'sf4.blk');
INSERT INTO sewspace_blocks VALUES ('sf4_a', 'sf4_x');
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES
  ('/objects/f4/a', 'sf4_a', 'image/webp', 'image'), ('/objects/f4/at', 'sf4_a', 'image/webp', 'image'),
  ('/objects/f4/b', 'sf4_b', 'image/webp', 'image'), ('/objects/f4/bt', 'sf4_b', 'image/webp', 'image'),
  ('/objects/f4/c', 'sf4_a', 'image/webp', 'image'), ('/objects/f4/ct', 'sf4_a', 'image/webp', 'image');
INSERT INTO sewspace_media (id, user_id, full_path, thumb_path, width, height) VALUES
  (41301, 'sf4_a', '/objects/f4/a', '/objects/f4/at', 800, 1000),
  (41302, 'sf4_b', '/objects/f4/b', '/objects/f4/bt', 800, 1000),
  (41303, 'sf4_a', '/objects/f4/c', '/objects/f4/ct', 800, 1000);
INSERT INTO sewspace_forum_topics (id, user_id, board, kind, title) VALUES
  (41301, 'sf4_a', 'fitting', 'show_tell', 'My first Willa Dress'),
  (41302, 'sf4_b', 'fitting', 'show_tell', 'Ben''s jacket');

SELECT t.act_as('sf4_a');
INSERT INTO sewspace_forum_topic_media (topic_id, media_id, user_id, position) VALUES (41301, 41301, 'sf4_a', 0);
SELECT t.rejects($$INSERT INTO sewspace_forum_topic_media (topic_id, media_id, user_id, position) VALUES (41301, 41302, 'sf4_a', 1)$$, 'only your own media');
SELECT t.rejects($$INSERT INTO sewspace_forum_topic_media (topic_id, media_id, user_id, position) VALUES (41302, 41303, 'sf4_a', 0)$$, 'only on your own topic');
SELECT t.rejects($$INSERT INTO sewspace_forum_topic_media (topic_id, media_id, user_id, position) VALUES (41302, 41302, 'sf4_b', 0)$$, 'not as someone else');
SELECT t.rejects($$INSERT INTO sewspace_forum_topic_media (topic_id, media_id, user_id, position) VALUES (41301, 41303, 'sf4_a', 10)$$, 'at most 10 photos');

SELECT t.act_as('sf4_b');
SELECT t.eq((SELECT count(*) FROM sewspace_forum_topic_media WHERE topic_id = 41301), 1, 'others see the topic''s photos');
SELECT t.eq((SELECT count(*) FROM sewspace_media WHERE id = 41301), 1, 'and the media row');
SELECT t.eq((SELECT count(*) FROM sewspace_media WHERE id = 41303), 0, 'media not on a topic stays private');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE object_path IN ('/objects/f4/a', '/objects/f4/at')), 2, 'full image and thumbnail files are readable');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE object_path IN ('/objects/f4/c', '/objects/f4/ct')), 0, 'unattached files are not');
SELECT t.eq(t.affected($$DELETE FROM sewspace_forum_topic_media WHERE topic_id = 41301$$), 0, 'others cannot remove them');

SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_forum_topic_media WHERE topic_id = 41301), 1, 'signed out sees them too');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE object_path = '/objects/f4/a'), 1, 'and the file');

SELECT t.act_as('sf4_x');
SELECT t.eq((SELECT count(*) FROM sewspace_forum_topic_media WHERE topic_id = 41301), 0, 'blocked: no photos');
SELECT t.eq((SELECT count(*) FROM sewspace_media WHERE id = 41301), 0, 'blocked: no media row');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE object_path = '/objects/f4/a'), 0, 'blocked: no file');

SELECT t.act_as('sf4_a');
DELETE FROM sewspace_forum_topics WHERE id = 41301;
SELECT t.act_as('sf4_b');
SELECT t.eq((SELECT count(*) FROM sewspace_media WHERE id = 41301), 0, 'deleting the topic hides its photos again');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_forum_topic_media WHERE topic_id = 41301), 0, 'links go with the topic');
\echo '  topic photos follow their topic: ok'
