-- Phase 0: every stash, pattern, project and upload row is visible and writable by its owner only.
\i test/helpers.psql

SELECT t.act_as('user_a');
INSERT INTO sewspace_profiles (user_id, name) VALUES ('user_a', 'Ann');
INSERT INTO sewspace_fabrics (id, user_id, name, type, color) VALUES (101, 'user_a', 'Linen', 'Linen', 'green');
INSERT INTO sewspace_threads (id, user_id, brand, color, color_name, type) VALUES (101, 'user_a', 'G', '#000', 'Black', 'Poly');
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty) VALUES (101, 'user_a', 'Wrap', 'Dress', 'beginner');
INSERT INTO sewspace_measurement_profiles (id, user_id, name, recorded_at) VALUES (101, 'user_a', 'Me', '2026-01-01');
INSERT INTO sewspace_projects (id, user_id, name, pattern_id, fabric_id, thread_id, measurement_profile_id)
  VALUES (101, 'user_a', 'Dress', 101, 101, 101, 101);
INSERT INTO sewspace_project_steps (project_id, user_id, title) VALUES (101, 'user_a', 'Cut');
INSERT INTO sewspace_project_photos (project_id, user_id, url) VALUES (101, 'user_a', '/api/storage/objects/uploads/a1');
INSERT INTO sewspace_uploads (object_path, user_id, content_type) VALUES ('/objects/uploads/a1', 'user_a', 'image/jpeg');
SELECT t.eq((SELECT count(*) FROM sewspace_projects), 1, 'owner sees own project');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 1, 'owner sees own upload');

-- Another signed-in user sees and changes nothing of user_a's.
SELECT t.act_as('user_b');
SELECT t.eq((SELECT count(*) FROM sewspace_profiles), 0, 'b cannot read a profile');
SELECT t.eq((SELECT count(*) FROM sewspace_fabrics), 0, 'b cannot read a fabric');
SELECT t.eq((SELECT count(*) FROM sewspace_threads), 0, 'b cannot read a thread');
SELECT t.eq((SELECT count(*) FROM sewspace_patterns), 0, 'b cannot read a pattern');
SELECT t.eq((SELECT count(*) FROM sewspace_measurement_profiles), 0, 'b cannot read a measurements');
SELECT t.eq((SELECT count(*) FROM sewspace_projects), 0, 'b cannot read a project');
SELECT t.eq((SELECT count(*) FROM sewspace_project_steps), 0, 'b cannot read a steps');
SELECT t.eq((SELECT count(*) FROM sewspace_project_photos), 0, 'b cannot read a photos');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 0, 'b cannot read a uploads');
SELECT t.eq(t.affected($$UPDATE sewspace_fabrics SET name = 'mine' WHERE id = 101$$), 0, 'b cannot update a fabric');
SELECT t.eq(t.affected($$DELETE FROM sewspace_projects WHERE id = 101$$), 0, 'b cannot delete a project');
SELECT t.rejects($$INSERT INTO sewspace_fabrics (user_id, name, type, color) VALUES ('user_a', 'x', 'x', 'x')$$, 'b cannot insert as a');
SELECT t.rejects($$INSERT INTO sewspace_uploads (object_path, user_id, content_type) VALUES ('/objects/uploads/b1', 'user_a', 'image/png')$$, 'b cannot register upload as a');

-- b cannot attach a's pattern or fabric to b's own project, or add steps to a's project.
INSERT INTO sewspace_projects (id, user_id, name) VALUES (201, 'user_b', 'Mine');
SELECT t.rejects($$INSERT INTO sewspace_projects (user_id, name, pattern_id) VALUES ('user_b', 'x', 101)$$, 'b cannot link a pattern');
SELECT t.rejects($$UPDATE sewspace_projects SET fabric_id = 101 WHERE id = 201$$, 'b cannot link a fabric');
SELECT t.rejects($$INSERT INTO sewspace_project_steps (project_id, user_id, title) VALUES (101, 'user_b', 'x')$$, 'b cannot add step to a project');
SELECT t.rejects($$INSERT INTO sewspace_project_photos (project_id, user_id, url) VALUES (101, 'user_b', 'x')$$, 'b cannot add photo to a project');
SELECT t.rejects($$UPDATE sewspace_projects SET user_id = 'user_a' WHERE id = 201$$, 'b cannot hand a project to a');

-- Signed-out visitors see nothing and can write nothing.
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_fabrics), 0, 'anon cannot read fabrics');
SELECT t.eq((SELECT count(*) FROM sewspace_projects), 0, 'anon cannot read projects');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 0, 'anon cannot read uploads');
SELECT t.rejects($$INSERT INTO sewspace_fabrics (user_id, name, type, color) VALUES ('', 'x', 'x', 'x')$$, 'anon cannot insert with empty id');
SELECT t.rejects($$INSERT INTO sewspace_profiles (user_id) VALUES ('user_c')$$, 'anon cannot create a profile');

-- The owner still has everything.
SELECT t.act_as('user_a');
SELECT t.eq((SELECT count(*) FROM sewspace_project_steps), 1, 'a still sees steps');
SELECT t.eq(t.affected($$UPDATE sewspace_fabrics SET name = 'Washed linen' WHERE id = 101$$), 1, 'a can update own fabric');
RESET ROLE;
\echo '  owner-only policies: ok'

-- Public profiles: only rows with a handle, only safe columns, readable signed out.
RESET ROLE;
UPDATE sewspace_profiles SET handle = 'ann.sews', bio = 'Linen forever', units = 'imperial' WHERE user_id = 'user_a';
INSERT INTO sewspace_profiles (user_id, name) VALUES ('user_b', 'Bea');  -- no handle yet
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_public_profiles), 1, 'anon sees only profiles with a handle');
SELECT t.eq((SELECT count(*) FROM sewspace_public_profiles WHERE handle = 'ann.sews' AND bio = 'Linen forever'), 1, 'anon reads public fields');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sewspace_public_profiles' AND column_name IN ('units', 'experience', 'favorite_garments')) THEN
    RAISE EXCEPTION 'FAIL public profile view exposes private columns';
  END IF;
END $$;
SELECT t.act_as('user_b');
SELECT t.eq((SELECT count(*) FROM sewspace_profiles), 1, 'b sees only own full profile row');
SELECT t.eq(t.affected($$UPDATE sewspace_profiles SET bio = 'hacked' WHERE user_id = 'user_a'$$), 0, 'b cannot edit a profile');

-- Handles are unique ignoring case and must match the format.
RESET ROLE;
SELECT t.rejects($$UPDATE sewspace_profiles SET handle = 'Ann.Sews' WHERE user_id = 'user_b'$$, 'handle format is lowercase only');
DO $$
BEGIN
  BEGIN
    INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('user_c', 'C', 'ann.sews');
    RAISE EXCEPTION 'FAIL duplicate handle accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- Avatars: an avatar upload referenced by a profile with a handle is readable by anyone;
-- every other upload purpose stays owner-only, even if a profile points at it.
SELECT t.act_as('user_a');
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES
  ('/objects/uploads/avatar-a', 'user_a', 'image/webp', 'avatar'),
  ('/objects/uploads/pdf-a', 'user_a', 'application/pdf', 'pattern_pdf'),
  ('/objects/visualizations/user_a/v1.png', 'user_a', 'image/png', 'visualization');
UPDATE sewspace_profiles SET avatar_url = '/api/storage/objects/uploads/avatar-a' WHERE user_id = 'user_a';
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_uploads WHERE object_path = '/objects/uploads/avatar-a'), 1, 'anon can read a public avatar');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 1, 'anon sees no other uploads');
SELECT t.act_as('user_a');
UPDATE sewspace_profiles SET avatar_url = '/api/storage/objects/uploads/pdf-a' WHERE user_id = 'user_a';
SELECT t.act_as('user_b');
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 0, 'a PDF set as avatar is still private');
SELECT t.act_as('user_a');
UPDATE sewspace_profiles SET avatar_url = '/api/storage/objects/visualizations/user_a/v1.png' WHERE user_id = 'user_a';
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 0, 'a visualisation set as avatar is still private');
-- A profile without a handle has no public avatar.
SELECT t.act_as('user_b');
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose) VALUES ('/objects/uploads/avatar-b', 'user_b', 'image/webp', 'avatar');
UPDATE sewspace_profiles SET avatar_url = '/api/storage/objects/uploads/avatar-b' WHERE user_id = 'user_b';
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_uploads), 0, 'no public avatar without a handle');
RESET ROLE;
\echo '  public profiles and avatars: ok'
