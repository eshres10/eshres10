-- Phase 3: blocked profiles disappear; follower and followers-only counts.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle, avatar_url) VALUES
  ('qa', 'Ana', 'q.ana', '/api/storage/objects/q/avatar'),
  ('qf', 'Flo', 'q.flo', NULL), ('qo', 'Ola', 'q.ola', NULL), ('qb', 'Bea', 'q.bea', NULL), ('qc', 'Cy', 'q.cy', NULL);
INSERT INTO sewspace_profiles (user_id, name) VALUES ('qn', 'No handle');
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES ('/objects/q/avatar', 'qa', 'image/webp', 'avatar');
-- Flo and No-handle follow Ana; Ana follows Ola; Ana blocked Bea; Cy blocked Ana.
INSERT INTO sewspace_follows VALUES ('qf', 'qa'), ('qn', 'qa'), ('qa', 'qo');
INSERT INTO sewspace_blocks VALUES ('qa', 'qb'), ('qc', 'qa');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES
  (401, 'qa', 'status', 'pub', 'public'), (402, 'qa', 'status', 'fol 1', 'followers'), (403, 'qa', 'status', 'fol 2', 'followers'), (404, 'qa', 'status', 'mine', 'private');
INSERT INTO sewspace_projects (id, user_id, name, visibility) VALUES
  (401, 'qa', 'Pub make', 'public'), (402, 'qa', 'Fol make', 'followers'), (403, 'qa', 'Priv make', 'private');

RESET ROLE;
CREATE OR REPLACE FUNCTION t.profile_seen() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' ',
    'profile=' || (SELECT count(*) FROM sewspace_public_profiles WHERE handle = 'q.ana'),
    'avatar=' || sewspace_is_public_avatar('/objects/q/avatar'),
    'counts=' || coalesce((SELECT followers || '/' || following FROM sewspace_follow_counts('qa')), 'none'),
    'locked=' || coalesce((SELECT posts || '/' || makes FROM sewspace_followers_only_counts('qa')), 'none'))
$$;
GRANT EXECUTE ON FUNCTION t.profile_seen() TO sewspace_app;
CREATE OR REPLACE FUNCTION t.expect_profile(label text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := t.profile_seen();
BEGIN
  IF actual <> expected THEN RAISE EXCEPTION 'FAIL %: expected [%], got [%]', label, expected, actual; END IF;
END $$;
GRANT EXECUTE ON FUNCTION t.expect_profile(text, text) TO sewspace_app;

-- Follows from people without a handle aren't counted: 1 follower, 1 following.
SELECT t.act_as('qa');
SELECT t.expect_profile('owner', 'profile=1 avatar=true counts=1/1 locked=0/0');
SELECT t.act_as('qf');
SELECT t.expect_profile('follower', 'profile=1 avatar=true counts=1/1 locked=0/0');
SELECT t.act_as('qo');
SELECT t.expect_profile('other user', 'profile=1 avatar=true counts=1/1 locked=2/1');
SELECT t.act_as(NULL);
SELECT t.expect_profile('signed out', 'profile=1 avatar=true counts=1/1 locked=2/1');
SELECT t.act_as('qb');
SELECT t.expect_profile('blocked by the owner', 'profile=0 avatar=false counts=none locked=none');
SELECT t.act_as('qc');
SELECT t.expect_profile('blocked the owner', 'profile=0 avatar=false counts=none locked=none');

-- The blocked person's own profile is hidden from the blocker too.
SELECT t.act_as('qa');
SELECT t.eq((SELECT count(*) FROM sewspace_public_profiles WHERE handle IN ('q.bea', 'q.cy')), 0, 'blocker does not see blocked profiles');
-- Profiles without a handle never have counts.
SELECT t.eq((SELECT count(*) FROM sewspace_follow_counts('qn')), 0, 'no counts without a handle');
-- The functions return numbers only; follows stay unreadable to others.
SELECT t.act_as('qo');
SELECT t.eq((SELECT count(*) FROM sewspace_follows WHERE followee_id = 'qa'), 0, 'others still cannot list follows');
-- Counting doesn't open up the rows themselves.
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE user_id = 'qa'), 1, 'other user sees only the public post');
SELECT t.eq((SELECT count(*) FROM sewspace_projects WHERE user_id = 'qa'), 1, 'other user sees only the public make');
RESET ROLE;
\echo '  profiles and counts for owner, follower, other user, signed out, blocked (both ways): ok'
