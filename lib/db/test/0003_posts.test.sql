-- Phase 2: posts and their photos follow the visibility rule for every viewer.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('pa', 'Pat', 'pat'), ('pf', 'Fay', 'fay'), ('po', 'Oli', 'oli'), ('pb', 'Ben', 'ben');
INSERT INTO sewspace_follows VALUES ('pf', 'pa'), ('pb', 'pa');
INSERT INTO sewspace_blocks VALUES ('pa', 'pb');

-- As Pat (through RLS): create media and posts at each visibility.
SELECT t.act_as('pa');
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES
  ('/objects/m/full-1', 'pa', 'image/webp', 'image'), ('/objects/m/thumb-1', 'pa', 'image/webp', 'image'),
  ('/objects/m/full-2', 'pa', 'image/webp', 'image'), ('/objects/m/thumb-2', 'pa', 'image/webp', 'image'),
  ('/objects/m/full-3', 'pa', 'image/webp', 'image'), ('/objects/m/thumb-3', 'pa', 'image/webp', 'image');
INSERT INTO sewspace_media (id, user_id, full_path, thumb_path, width, height) VALUES
  (1, 'pa', '/objects/m/full-1', '/objects/m/thumb-1', 1200, 1500),
  (2, 'pa', '/objects/m/full-2', '/objects/m/thumb-2', 1200, 1500),
  (3, 'pa', '/objects/m/full-3', '/objects/m/thumb-3', 1200, 1500);
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES
  (1, 'pa', 'photo', 'public post', 'public'),
  (2, 'pa', 'photo', 'followers post', 'followers'),
  (3, 'pa', 'photo', 'private post', 'private'),
  (4, 'pa', 'status', 'just words', 'public');
INSERT INTO sewspace_post_media (post_id, media_id, user_id, position) VALUES (1, 1, 'pa', 0), (2, 2, 'pa', 0), (3, 3, 'pa', 0);

RESET ROLE;
CREATE OR REPLACE FUNCTION t.posts_seen() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' ',
    'posts=' || (SELECT count(*) FROM sewspace_posts WHERE user_id = 'pa'),
    'links=' || (SELECT count(*) FROM sewspace_post_media WHERE user_id = 'pa'),
    'media=' || (SELECT count(*) FROM sewspace_media WHERE user_id = 'pa'),
    'files=' || (SELECT count(*) FROM sewspace_uploads WHERE user_id = 'pa'))
$$;
GRANT EXECUTE ON FUNCTION t.posts_seen() TO sewspace_app;
CREATE OR REPLACE FUNCTION t.expect_posts(label text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := t.posts_seen();
BEGIN
  IF actual <> expected THEN RAISE EXCEPTION 'FAIL %: expected [%], got [%]', label, expected, actual; END IF;
END $$;
GRANT EXECUTE ON FUNCTION t.expect_posts(text, text) TO sewspace_app;
SELECT t.act_as('pa');

SELECT t.expect_posts('author', 'posts=4 links=3 media=3 files=6');
SELECT t.act_as('pf');
SELECT t.expect_posts('follower', 'posts=3 links=2 media=2 files=4');
SELECT t.act_as('po');
SELECT t.expect_posts('other user', 'posts=2 links=1 media=1 files=2');
SELECT t.act_as(NULL);
SELECT t.expect_posts('signed out', 'posts=2 links=1 media=1 files=2');
SELECT t.act_as('pb');
SELECT t.expect_posts('blocked', 'posts=0 links=0 media=0 files=0');

-- Only the author writes.
SELECT t.act_as('pf');
SELECT t.eq(t.affected($$UPDATE sewspace_posts SET caption = 'x' WHERE id = 1$$), 0, 'follower cannot edit a post');
SELECT t.eq(t.affected($$DELETE FROM sewspace_posts WHERE id = 1$$), 0, 'follower cannot delete a post');
SELECT t.rejects($$INSERT INTO sewspace_post_media (post_id, media_id, user_id) VALUES (1, 1, 'pf')$$, 'cannot attach photos to someone else''s post');
-- Fay can't put Pat's photo in her own post, or tag Pat's items.
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES (10, 'pf', 'photo', 'mine', 'public');
SELECT t.rejects($$INSERT INTO sewspace_post_media (post_id, media_id, user_id) VALUES (10, 1, 'pf')$$, 'cannot reuse someone else''s visible photo');
RESET ROLE;
INSERT INTO sewspace_projects (id, user_id, name, visibility) VALUES (900, 'pa', 'Pat public make', 'public');
SELECT t.act_as('pf');
SELECT t.rejects($$INSERT INTO sewspace_posts (user_id, kind, caption, project_id) VALUES ('pf', 'status', 'x', 900)$$, 'cannot tag someone else''s public make');
SELECT t.rejects($$INSERT INTO sewspace_posts (user_id, kind, caption) VALUES ('pa', 'status', 'impersonate')$$, 'cannot post as someone else');

-- Visibility changes apply to photos immediately.
SELECT t.act_as('pa');
UPDATE sewspace_posts SET visibility = 'private' WHERE id = 1;
SELECT t.act_as(NULL);
SELECT t.expect_posts('after making the photo post private', 'posts=1 links=0 media=0 files=0');
RESET ROLE;
\echo '  posts and photos for author, follower, other user, signed out, blocked: ok'
