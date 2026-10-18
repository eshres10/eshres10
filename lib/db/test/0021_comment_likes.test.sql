-- Comment likes: private to the liker; only on comments you can see; counts
-- only for comments you can see; nothing across a block either way.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('cl_a', 'Ann', 'cl.ann'), ('cl_b', 'Ben', 'cl.ben'), ('cl_c', 'Cy', 'cl.cy');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES
  (23001, 'cl_a', 'status', 'Public', 'public'),
  (23002, 'cl_a', 'status', 'Private', 'private');
INSERT INTO sewspace_comments (id, post_id, user_id, body) VALUES
  (23001, 23001, 'cl_a', 'On the public post'),
  (23002, 23002, 'cl_a', 'On the private post');

SELECT t.act_as('cl_b');
INSERT INTO sewspace_comment_likes (user_id, comment_id) VALUES ('cl_b', 23001);
SELECT t.rejects($$INSERT INTO sewspace_comment_likes (user_id, comment_id) VALUES ('cl_b', 23002)$$, 'not on a comment you cannot see');
SELECT t.rejects($$INSERT INTO sewspace_comment_likes (user_id, comment_id) VALUES ('cl_c', 23001)$$, 'only as yourself');
SELECT t.eq((SELECT likes FROM sewspace_comment_like_counts(ARRAY[23001])), 1::bigint, 'the count is public');
SELECT t.eq((SELECT count(*) FROM sewspace_comment_like_counts(ARRAY[23002])), 0, 'no number for a comment you cannot see');

SELECT t.act_as('cl_c');
SELECT t.eq((SELECT count(*) FROM sewspace_comment_likes), 0, 'who liked is private');
SELECT t.eq(t.affected($$DELETE FROM sewspace_comment_likes WHERE user_id = 'cl_b'$$), 0, 'and nobody else can remove it');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT likes FROM sewspace_comment_like_counts(ARRAY[23001])), 1::bigint, 'signed out reads the count');
SELECT t.rejects($$INSERT INTO sewspace_comment_likes (user_id, comment_id) VALUES ('cl_b', 23001)$$, 'signed out likes nothing');

-- Ann blocks Cy: no likes and no numbers either way.
SELECT t.act_as('cl_a');
INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES ('cl_a', 'cl_c');
SELECT t.act_as('cl_c');
SELECT t.rejects($$INSERT INTO sewspace_comment_likes (user_id, comment_id) VALUES ('cl_c', 23001)$$, 'not across a block');
SELECT t.eq((SELECT count(*) FROM sewspace_comment_like_counts(ARRAY[23001])), 0, 'no number across a block');

SELECT t.act_as('cl_b');
DELETE FROM sewspace_comment_likes WHERE comment_id = 23001;
SELECT t.eq((SELECT likes FROM sewspace_comment_like_counts(ARRAY[23001])), 0::bigint, 'unlike removes it');
INSERT INTO sewspace_comment_likes (user_id, comment_id) VALUES ('cl_b', 23001);
SELECT t.act_as('cl_a');
DELETE FROM sewspace_comments WHERE id = 23001;
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_comment_likes WHERE comment_id = 23001), 0, 'deleting the comment removes its likes');
\echo '  comment likes are private and follow their comment: ok'
