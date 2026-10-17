-- Phase O: onboarding answers are private to their owner and only take the allowed values.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('so_a', 'Ann', 'so.ann'), ('so_b', 'Ben', 'so.ben');

SELECT t.act_as('so_a');
INSERT INTO sewspace_onboarding (user_id, current_step, goals, experience, tools, stash_size)
  VALUES ('so_a', 3, '{stash,learn}', 'start', '{machine}', 'secret');
SELECT t.rejects($$INSERT INTO sewspace_onboarding (user_id) VALUES ('so_b')$$, 'not as someone else');
SELECT t.rejects($$UPDATE sewspace_onboarding SET goals = '{stash,knitting}' WHERE user_id = 'so_a'$$, 'goals from the list only');
SELECT t.rejects($$UPDATE sewspace_onboarding SET goals = ARRAY['stash', NULL] WHERE user_id = 'so_a'$$, 'no empty goals');
SELECT t.rejects($$UPDATE sewspace_onboarding SET tools = '{loom}' WHERE user_id = 'so_a'$$, 'tools from the list only');
SELECT t.rejects($$UPDATE sewspace_onboarding SET experience = 'expert' WHERE user_id = 'so_a'$$, 'experience from the list only');
SELECT t.rejects($$UPDATE sewspace_onboarding SET stash_size = 'huge' WHERE user_id = 'so_a'$$, 'stash size from the list only');
SELECT t.rejects($$UPDATE sewspace_onboarding SET current_step = 9 WHERE user_id = 'so_a'$$, 'steps 0 to 8');
SELECT t.rejects($$UPDATE sewspace_onboarding SET user_id = 'so_b' WHERE user_id = 'so_a'$$, 'cannot hand the row to someone else');
SELECT t.eq(t.affected($$UPDATE sewspace_onboarding SET experience = NULL, current_step = 4 WHERE user_id = 'so_a'$$), 1, 'owner changes and clears answers');
SELECT t.eq((SELECT count(*) FROM sewspace_onboarding), 1, 'owner reads');
SELECT t.rejects($$UPDATE sewspace_profiles SET default_post_visibility = 'friends' WHERE user_id = 'so_a'$$, 'default post visibility from the list only');
SELECT t.eq(t.affected($$UPDATE sewspace_profiles SET default_post_visibility = 'followers' WHERE user_id = 'so_a'$$), 1, 'owner sets the default post visibility');

SELECT t.act_as('so_b');
SELECT t.eq((SELECT count(*) FROM sewspace_onboarding), 0, 'another person reads nothing');
SELECT t.eq(t.affected($$UPDATE sewspace_onboarding SET goals = '{sell}' WHERE user_id = 'so_a'$$), 0, 'or changes');
SELECT t.eq(t.affected($$DELETE FROM sewspace_onboarding WHERE user_id = 'so_a'$$), 0, 'or deletes');
SELECT t.eq(t.affected($$UPDATE sewspace_profiles SET default_post_visibility = 'private' WHERE user_id = 'so_a'$$), 0, 'or changes the default post visibility');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_onboarding), 0, 'signed out reads nothing');
SELECT t.rejects($$INSERT INTO sewspace_onboarding (user_id) VALUES ('so_a')$$, 'signed out writes nothing');

RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_profiles WHERE user_id = 'so_b' AND default_post_visibility = 'public'), 1, 'existing profiles default to public');
SELECT t.eq((SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'sewspace_public_profiles' AND column_name = 'default_post_visibility'), 0, 'not in the public profile view');
DELETE FROM sewspace_profiles WHERE user_id = 'so_a';
SELECT t.eq((SELECT count(*) FROM sewspace_onboarding WHERE user_id = 'so_a'), 0, 'deleting the profile deletes the answers');
\echo '  onboarding answers are private and checked: ok'
