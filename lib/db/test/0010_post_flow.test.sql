-- Phase F1: hashtags follow their posts; counts are public posts only and
-- respect blocks; alt text and aspect.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('h1a', 'Ann', 'h.ann'), ('h1f', 'Fen', 'h.fen'), ('h1o', 'Oak', 'h.oak'), ('h1b', 'Bo', 'h.bo');
INSERT INTO sewspace_follows VALUES ('h1f', 'h1a');
INSERT INTO sewspace_blocks VALUES ('h1a', 'h1b');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES
  (19101, 'h1a', 'status', '#linen public', 'public'),
  (19102, 'h1a', 'status', '#linen followers', 'followers'),
  (19103, 'h1a', 'status', '#linen #secretproject private', 'private'),
  (19104, 'h1o', 'status', '#linen #linenlove', 'public'),
  (19105, 'h1b', 'status', '#linen from bo', 'public');

-- The app role can't insert tags directly; the function does it.
SELECT t.act_as('h1a');
SELECT t.rejects($$INSERT INTO sewspace_hashtags (tag) VALUES ('sneaky')$$, 'no direct tag inserts');
SELECT t.rejects($$SELECT * FROM sewspace_hashtag_ids(ARRAY['Bad Tag'])$$, 'tag format checked');
SELECT t.rejects($$SELECT * FROM sewspace_hashtag_ids(array_fill('a'::text, ARRAY[31]))$$, 'at most 30 per call');
INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id)
  SELECT p, h.id, 'h1a' FROM (VALUES (19101), (19102), (19103)) v(p), sewspace_hashtag_ids(ARRAY['linen']) h;
INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id)
  SELECT 19103, h.id, 'h1a' FROM sewspace_hashtag_ids(ARRAY['secretproject']) h;
SELECT t.rejects($$INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id) SELECT 19104, id, 'h1a' FROM sewspace_hashtag_ids(ARRAY['linen'])$$, 'cannot tag someone else''s post');
SELECT t.rejects($$INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id) SELECT 19104, id, 'h1o' FROM sewspace_hashtag_ids(ARRAY['linen'])$$, 'cannot tag as someone else');
SELECT t.act_as('h1o');
INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id) SELECT 19104, id, 'h1o' FROM sewspace_hashtag_ids(ARRAY['linen', 'linenlove']);
SELECT t.act_as('h1b');
INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id) SELECT 19105, id, 'h1b' FROM sewspace_hashtag_ids(ARRAY['linen']);
SELECT t.eq(t.affected($$DELETE FROM sewspace_post_hashtags WHERE post_id = 19101$$), 0, 'cannot remove tags from someone else''s post');

-- Post tags follow their post.
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_post_hashtags WHERE user_id = 'h1a'), 1, 'signed out sees tags of public posts only');
SELECT t.eq((SELECT count(*) FROM sewspace_hashtags WHERE tag = 'secretproject'), 0, 'a tag only on private posts is hidden');
SELECT t.act_as('h1f');
SELECT t.eq((SELECT count(*) FROM sewspace_post_hashtags WHERE user_id = 'h1a'), 2, 'follower sees public and followers-only tags');
SELECT t.act_as('h1a');
SELECT t.eq((SELECT count(*) FROM sewspace_post_hashtags WHERE user_id = 'h1a'), 4, 'owner sees all their tags');
SELECT t.eq((SELECT count(*) FROM sewspace_hashtags WHERE tag = 'secretproject'), 1, 'owner sees their own tag');
SELECT t.eq((SELECT count(*) FROM sewspace_post_hashtags WHERE user_id = 'h1b'), 0, 'nothing across a block');

-- Counts: public posts only, blocks applied, never followers-only or private.
SELECT t.act_as('h1o');
SELECT t.eq((SELECT posts FROM sewspace_hashtag_counts(ARRAY['linen'])), 3, 'public posts by ann, oak and bo');
SELECT t.eq(coalesce((SELECT posts FROM sewspace_hashtag_counts(ARRAY['secretproject'])), 0), 0, 'private posts never counted');
SELECT t.act_as('h1f');
SELECT t.eq((SELECT posts FROM sewspace_hashtag_counts(ARRAY['linen'])), 3, 'a follower''s count still ignores followers-only posts');
SELECT t.act_as('h1a');
SELECT t.eq((SELECT posts FROM sewspace_hashtag_counts(ARRAY['linen'])), 2, 'owner: own private and followers-only posts not counted; blocked person not counted');
SELECT t.eq((SELECT count(*) FROM sewspace_hashtag_prefix('lin', 6)), 2, 'prefix finds linen and linenlove');
SELECT t.eq((SELECT count(*) FROM sewspace_hashtag_prefix('secret', 6)), 0, 'prefix ignores private-only tags');
SELECT t.eq((SELECT count(*) FROM sewspace_hashtag_prefix('l_n', 6)), 0, 'underscore is literal, not a wildcard');
SELECT t.act_as('h1b');
SELECT t.eq((SELECT posts FROM sewspace_hashtag_counts(ARRAY['linen'])), 2, 'blocked either way: the blocker''s posts are not counted');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT posts FROM sewspace_hashtag_counts(ARRAY['linen'])), 3, 'signed out counts public posts');
SELECT t.rejects($$SELECT * FROM sewspace_hashtag_ids(ARRAY['linen'])$$, 'signed out cannot create tags');

-- Alt text and aspect.
SELECT t.act_as('h1a');
SELECT t.rejects($$UPDATE sewspace_posts SET aspect = '16:9' WHERE id = 19101$$, 'aspect values checked');
UPDATE sewspace_posts SET aspect = '1:1' WHERE id = 19101;
INSERT INTO sewspace_media (id, user_id, full_path, thumb_path, width, height) VALUES (19101, 'h1a', '/objects/h/f', '/objects/h/t', 10, 10);
SELECT t.rejects($$UPDATE sewspace_media SET alt_text = repeat('a', 501) WHERE id = 19101$$, 'alt text at most 500');
UPDATE sewspace_media SET alt_text = 'Navy linen top' WHERE id = 19101;
SELECT t.act_as('h1o');
SELECT t.eq(t.affected($$UPDATE sewspace_media SET alt_text = 'x' WHERE id = 19101$$), 0, 'only the owner writes alt text');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 19104 AND aspect = '4:5'), 1, 'new posts default to 4:5');
\echo '  hashtags, counts, alt text and aspect for owner, follower, other user, signed out, blocked: ok'
