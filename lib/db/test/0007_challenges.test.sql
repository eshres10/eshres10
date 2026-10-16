-- Phase 6: challenges, members and entries.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('hh', 'Host', 'h.host'), ('he', 'Entrant', 'h.ent'), ('ho', 'Other', 'h.oth'), ('hb', 'Blocked', 'h.blk'), ('hx', 'Admin', 'h.adm');
INSERT INTO sewspace_blocks VALUES ('hh', 'hb');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES
  (1001, 'he', 'status', 'public entry', 'public'), (1002, 'he', 'status', 'followers post', 'followers'),
  (1003, 'ho', 'status', 'not mine', 'public'), (1004, 'he', 'status', 'second entry', 'public'), (1005, 'hb', 'status', 'blocked', 'public');

RESET ROLE;
CREATE OR REPLACE FUNCTION t.admin(on_ boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.is_admin', CASE WHEN on_ THEN 'on' ELSE '' END, false)
$$;
GRANT EXECUTE ON FUNCTION t.admin(boolean) TO sewspace_app;

-- Starting challenges.
SELECT t.act_as('hh');
INSERT INTO sewspace_challenges (id, slug, tag, title, rules, starts_at, ends_at, created_by) VALUES
  (1, 'octoberdenim', 'OctoberDenim', 'October Denim', 'Denim only', now() - interval '1 day', now() + interval '10 days', 'hh'),
  (2, 'futurefleece', 'FutureFleece', 'Not started', '', now() + interval '5 days', now() + interval '20 days', 'hh'),
  (3, 'pastpleats', 'PastPleats', 'Over', '', now() - interval '20 days', now() - interval '1 day', 'hh');
SELECT t.rejects($$INSERT INTO sewspace_challenges (slug, tag, title, starts_at, ends_at, created_by) VALUES ('xyz', 'XYZ', 'x', now(), now() + interval '1 day', 'ho')$$, 'cannot start a challenge as someone else');
SELECT t.rejects($$INSERT INTO sewspace_challenges (slug, tag, title, starts_at, ends_at, created_by) VALUES ('longone', 'LongOne', 'x', now(), now() + interval '200 days', 'hh')$$, 'at most 92 days');
SELECT t.rejects($$INSERT INTO sewspace_challenges (slug, tag, title, starts_at, ends_at, created_by) VALUES ('mismatch', 'Other', 'x', now(), now() + interval '1 day', 'hh')$$, 'slug is the lower-case tag');
SELECT t.eq(t.affected($$UPDATE sewspace_challenges SET title = 'October Denim 2026' WHERE id = 1$$), 1, 'host rewords');
SELECT t.rejects($$UPDATE sewspace_challenges SET ends_at = now() + interval '30 days' WHERE id = 1$$, 'dates stay as announced');
SELECT t.act_as('ho');
SELECT t.eq(t.affected($$UPDATE sewspace_challenges SET title = 'mine now' WHERE id = 1$$), 0, 'others cannot edit');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_challenges), 3, 'signed out sees challenges');
SELECT t.act_as('hb');
SELECT t.eq((SELECT count(*) FROM sewspace_challenges), 0, 'blocked by the host: no challenges');

-- Joining.
SELECT t.act_as('he');
INSERT INTO sewspace_challenge_members (challenge_id, user_id) VALUES (1, 'he'), (2, 'he');
SELECT t.rejects($$INSERT INTO sewspace_challenge_members (challenge_id, user_id) VALUES (3, 'he')$$, 'cannot join after it ended');
SELECT t.rejects($$INSERT INTO sewspace_challenge_members (challenge_id, user_id) VALUES (1, 'ho')$$, 'cannot join as someone else');
SELECT t.act_as('hb');
SELECT t.rejects($$INSERT INTO sewspace_challenge_members (challenge_id, user_id) VALUES (1, 'hb')$$, 'cannot join across a block');

-- Entering.
SELECT t.act_as('he');
SELECT t.rejects($$INSERT INTO sewspace_challenge_entries (challenge_id, post_id, user_id) VALUES (1, 1002, 'he')$$, 'only public posts');
SELECT t.rejects($$INSERT INTO sewspace_challenge_entries (challenge_id, post_id, user_id) VALUES (1, 1003, 'he')$$, 'only your own posts');
SELECT t.rejects($$INSERT INTO sewspace_challenge_entries (challenge_id, post_id, user_id) VALUES (2, 1001, 'he')$$, 'not before it starts');
SELECT t.rejects($$INSERT INTO sewspace_challenge_entries (challenge_id, post_id, user_id, removed_at) VALUES (1, 1001, 'he', now())$$, 'cannot enter pre-removed');
INSERT INTO sewspace_challenge_entries (id, challenge_id, post_id, user_id) VALUES (1, 1, 1001, 'he'), (2, 1, 1004, 'he');
SELECT t.act_as('ho');
SELECT t.rejects($$INSERT INTO sewspace_challenge_entries (challenge_id, post_id, user_id) VALUES (1, 1003, 'ho')$$, 'must join first');
SELECT t.eq((SELECT entries FROM sewspace_challenge_counts(ARRAY[1])), 2, 'two live entries');
SELECT t.eq((SELECT members FROM sewspace_challenge_counts(ARRAY[1])), 1, 'one member');

-- The host removes an entry; it disappears for others but not for the entrant.
SELECT t.eq(t.affected($$UPDATE sewspace_challenge_entries SET removed_at = now(), removed_by = 'ho' WHERE id = 1$$), 0, 'others cannot remove entries');
SELECT t.act_as('hh');
SELECT t.eq(t.affected($$UPDATE sewspace_challenge_entries SET removed_at = now(), removed_by = 'hh' WHERE id = 1$$), 1, 'host removes an entry');
SELECT t.rejects($$UPDATE sewspace_challenge_entries SET post_id = 1003 WHERE id = 2$$, 'host cannot change what was entered');
SELECT t.act_as('ho');
SELECT t.eq((SELECT count(*) FROM sewspace_challenge_entries), 1, 'removed entry hidden from others');
SELECT t.act_as('he');
SELECT t.eq((SELECT count(*) FROM sewspace_challenge_entries), 2, 'entrant still sees their removed entry');
SELECT t.eq(t.affected($$DELETE FROM sewspace_challenge_entries WHERE id = 1$$), 0, 'cannot withdraw a removed entry (to enter it again)');
SELECT t.eq(t.affected($$DELETE FROM sewspace_challenge_entries WHERE id = 2$$), 1, 'withdraw your own entry');
SELECT t.eq((SELECT entries FROM sewspace_challenge_counts(ARRAY[1])), 0, 'removed and withdrawn entries are not counted');

-- Making the post non-public hides the entry from others.
INSERT INTO sewspace_challenge_entries (id, challenge_id, post_id, user_id) VALUES (3, 1, 1004, 'he');
UPDATE sewspace_posts SET visibility = 'private' WHERE id = 1004;
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_challenge_entries), 0, 'entry follows its post');

-- Reports and admin removal.
SELECT t.act_as('ho');
INSERT INTO sewspace_reports (reporter_id, target_kind, target_id, target_user_id, reason) VALUES ('ho', 'challenge', 'futurefleece', 'hh', 'spam');
SELECT t.admin(true);
SELECT t.act_as('hx');
SELECT t.eq(t.affected($$DELETE FROM sewspace_challenges WHERE id = 1$$), 0, 'admin cannot remove an unreported challenge');
SELECT t.eq(t.affected($$DELETE FROM sewspace_challenges WHERE id = 2$$), 1, 'admin removes a reported challenge');
SELECT t.admin(false);
SELECT t.act_as('hh');
SELECT t.eq(t.affected($$DELETE FROM sewspace_challenges WHERE id = 3$$), 0, 'hosts cannot delete a challenge');
RESET ROLE;
\echo '  challenges, members, entries, host removal, reports: ok'
