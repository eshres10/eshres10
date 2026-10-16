-- Phase 1 visibility rules, for every kind of viewer:
-- owner, follower, another signed-in user, signed-out visitor, blocked user.
\i test/helpers.psql

-- Setup as the database owner: Ann has one row of each kind at each visibility.
INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('ann', 'Ann', 'ann'), ('fred', 'Fred', 'fred'), ('sam', 'Sam', 'sam'), ('bob', 'Bob', 'bob'), ('bea', 'Bea', 'bea');
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('fred', 'ann'), ('bob', 'ann');
-- Ann blocked Bob (Bob also follows Ann; the block must win). Bea blocked Ann.
INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES ('ann', 'bob'), ('bea', 'ann');

INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty, visibility, pdf_url, cover_image_url) VALUES
  (1, 'ann', 'Pub pattern', 'Dress', 'beginner', 'public', '/api/storage/objects/uploads/pdf-1', '/api/storage/objects/uploads/cover-1'),
  (2, 'ann', 'Fol pattern', 'Dress', 'beginner', 'followers', NULL, NULL),
  (3, 'ann', 'Prv pattern', 'Dress', 'beginner', 'private', NULL, NULL);
INSERT INTO sewspace_fabrics (id, user_id, name, type, color, visibility, image_url) VALUES
  (1, 'ann', 'Pub fabric', 'Linen', 'green', 'public', NULL),
  (2, 'ann', 'Fol fabric', 'Linen', 'green', 'followers', '/api/storage/objects/uploads/fab-2'),
  (3, 'ann', 'Prv fabric', 'Linen', 'green', 'private', '/api/storage/objects/uploads/fab-3');
INSERT INTO sewspace_threads (id, user_id, brand, color, color_name, type, visibility) VALUES
  (1, 'ann', 'G', '#000', 'Pub', 'Poly', 'public'), (2, 'ann', 'G', '#000', 'Fol', 'Poly', 'followers'), (3, 'ann', 'G', '#000', 'Prv', 'Poly', 'private');
INSERT INTO sewspace_measurement_profiles (id, user_id, name, recorded_at) VALUES (1, 'ann', 'Me', '2026-01-01');
INSERT INTO sewspace_projects (id, user_id, name, visibility, measurement_profile_id, pattern_id) VALUES
  (1, 'ann', 'Pub make', 'public', 1, 1), (2, 'ann', 'Fol make', 'followers', 1, NULL), (3, 'ann', 'Prv make', 'private', NULL, NULL);
INSERT INTO sewspace_project_steps (project_id, user_id, title) VALUES (1, 'ann', 's1'), (2, 'ann', 's2'), (3, 'ann', 's3');
INSERT INTO sewspace_project_photos (project_id, user_id, url) VALUES
  (1, 'ann', '/api/storage/objects/uploads/ph-1'), (2, 'ann', '/api/storage/objects/uploads/ph-2'), (3, 'ann', '/api/storage/objects/uploads/ph-3');
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES
  ('/objects/uploads/pdf-1', 'ann', 'application/pdf', 'pattern_pdf'),
  ('/objects/uploads/cover-1', 'ann', 'image/webp', 'image'),
  ('/objects/uploads/fab-2', 'ann', 'image/webp', 'image'),
  ('/objects/uploads/fab-3', 'ann', 'image/webp', 'image'),
  ('/objects/uploads/ph-1', 'ann', 'image/webp', 'image'),
  ('/objects/uploads/ph-2', 'ann', 'image/webp', 'image'),
  ('/objects/uploads/ph-3', 'ann', 'image/webp', 'image');

-- Counts visible to the current viewer, per table.
CREATE OR REPLACE FUNCTION t.visible() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' ',
    'projects=' || (SELECT count(*) FROM sewspace_projects WHERE user_id = 'ann'),
    'patterns=' || (SELECT count(*) FROM sewspace_patterns WHERE user_id = 'ann'),
    'fabrics=' || (SELECT count(*) FROM sewspace_fabrics WHERE user_id = 'ann'),
    'threads=' || (SELECT count(*) FROM sewspace_threads WHERE user_id = 'ann'),
    'steps=' || (SELECT count(*) FROM sewspace_project_steps WHERE user_id = 'ann'),
    'photos=' || (SELECT count(*) FROM sewspace_project_photos WHERE user_id = 'ann'),
    'files=' || (SELECT count(*) FROM sewspace_uploads WHERE user_id = 'ann'),
    'measurements=' || (SELECT count(*) FROM sewspace_measurement_profiles WHERE user_id = 'ann'))
$$;
GRANT EXECUTE ON FUNCTION t.visible() TO sewspace_app;
CREATE OR REPLACE FUNCTION t.expect(label text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := t.visible();
BEGIN
  IF actual <> expected THEN RAISE EXCEPTION 'FAIL %: expected [%], got [%]', label, expected, actual; END IF;
END $$;
GRANT EXECUTE ON FUNCTION t.expect(text, text) TO sewspace_app;

-- files: owner sees all 7; others see only images on rows they can see. Never the PDF.
SELECT t.act_as('ann');
SELECT t.expect('owner', 'projects=3 patterns=3 fabrics=3 threads=3 steps=3 photos=3 files=7 measurements=1');
SELECT t.act_as('fred');
SELECT t.expect('follower', 'projects=2 patterns=2 fabrics=2 threads=2 steps=2 photos=2 files=4 measurements=0');
SELECT t.act_as('sam');
SELECT t.expect('other signed-in user', 'projects=1 patterns=1 fabrics=1 threads=1 steps=1 photos=1 files=2 measurements=0');
SELECT t.act_as(NULL);
SELECT t.expect('signed out', 'projects=1 patterns=1 fabrics=1 threads=1 steps=1 photos=1 files=2 measurements=0');
SELECT t.act_as('bob');
SELECT t.expect('blocked by owner (even though following)', 'projects=0 patterns=0 fabrics=0 threads=0 steps=0 photos=0 files=0 measurements=0');
SELECT t.act_as('bea');
SELECT t.expect('blocked the owner', 'projects=0 patterns=0 fabrics=0 threads=0 steps=0 photos=0 files=0 measurements=0');

-- The pattern PDF never leaks, even on a public pattern.
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE purpose = 'pattern_pdf'), 0, 'public pattern PDF stays private');

-- Seeing is not editing: nobody but the owner writes, whatever the visibility.
SELECT t.act_as('fred');
SELECT t.eq(t.affected($$UPDATE sewspace_projects SET name = 'x' WHERE id = 1$$), 0, 'follower cannot edit a public make');
SELECT t.eq(t.affected($$DELETE FROM sewspace_fabrics WHERE id = 1$$), 0, 'follower cannot delete a public fabric');
SELECT t.eq(t.affected($$UPDATE sewspace_project_steps SET completed = true WHERE project_id = 1$$), 0, 'follower cannot tick steps');
SELECT t.rejects($$INSERT INTO sewspace_project_steps (project_id, user_id, title) VALUES (1, 'fred', 'x')$$, 'cannot add steps to a visible make you do not own');
SELECT t.rejects($$INSERT INTO sewspace_project_photos (project_id, user_id, url) VALUES (1, 'fred', 'x')$$, 'cannot add photos to a visible make you do not own');
SELECT t.rejects($$INSERT INTO sewspace_projects (user_id, name, pattern_id) VALUES ('fred', 'Copy', 1)$$, 'cannot link someone else''s public pattern');
SELECT t.rejects($$INSERT INTO sewspace_projects (user_id, name, fabric_id) VALUES ('fred', 'Copy', 1)$$, 'cannot link someone else''s public fabric');

-- Follows and blocks: you only follow as yourself; blocks are private.
SELECT t.rejects($$INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('sam', 'ann')$$, 'cannot follow on someone else''s behalf');
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('fred', 'sam');
SELECT t.act_as('sam');
SELECT t.eq((SELECT count(*) FROM sewspace_follows), 1, 'see follows you are part of');
SELECT t.eq((SELECT count(*) FROM sewspace_blocks), 0, 'cannot see other people''s blocks');
SELECT t.act_as('ann');
SELECT t.eq((SELECT count(*) FROM sewspace_blocks), 1, 'see your own blocks');
SELECT t.eq((SELECT count(*) FROM sewspace_blocks WHERE blocker_id = 'bea'), 0, 'cannot list blocks made against you');
SELECT t.eq(sewspace_blocked_with('bea')::int, 1, 'but the block check sees it');
SELECT t.eq(sewspace_blocked_with('bob')::int, 1, 'block check sees your own blocks');
SELECT t.eq(sewspace_blocked_with('fred')::int, 0, 'no block with fred');
SELECT t.act_as('sam');
SELECT t.eq(sewspace_blocked_with('ann')::int, 0, 'outsiders learn nothing about blocks between others');

-- Changing visibility takes effect immediately.
SELECT t.act_as('ann');
UPDATE sewspace_projects SET visibility = 'private' WHERE id = 1;
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_projects WHERE user_id = 'ann'), 0, 'make hidden after switching to private');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE object_path = '/objects/uploads/ph-1'), 0, 'its photo is hidden too');
RESET ROLE;
\echo '  visibility for owner, follower, other user, signed out, blocked: ok'
