-- Phase F0: drafts are private to their owner.
\i test/helpers.psql

SELECT t.act_as('da');
INSERT INTO sewspace_drafts (user_id, kind, payload) VALUES ('da', 'post', '{"caption": "half done"}');
SELECT t.rejects($$INSERT INTO sewspace_drafts (user_id, kind, payload) VALUES ('db', 'post', '{}')$$, 'cannot write a draft as someone else');
SELECT t.rejects($$INSERT INTO sewspace_drafts (user_id, kind, payload) VALUES ('da', 'recipe', '{}')$$, 'unknown kind');
SELECT t.rejects($$INSERT INTO sewspace_drafts (user_id, kind, payload) VALUES ('da', 'stash', '[1]')$$, 'payload must be an object');
SELECT t.rejects($$INSERT INTO sewspace_drafts (user_id, kind, payload) VALUES ('da', 'stash', jsonb_build_object('x', repeat('a', 70000)))$$, 'payload over 64 KB');

-- One per person per kind.
DO $$ BEGIN
  INSERT INTO sewspace_drafts (user_id, kind) VALUES ('da', 'post');
  RAISE EXCEPTION 'FAIL second post draft was allowed';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
INSERT INTO sewspace_drafts (user_id, kind, payload) VALUES ('da', 'post', '{"caption": "newer"}')
  ON CONFLICT (user_id, kind) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now();
SELECT t.eq((SELECT count(*) FROM sewspace_drafts WHERE payload->>'caption' = 'newer'), 1, 'upsert replaces the draft');

-- Nobody else reads, changes or deletes it; signed out sees nothing.
SELECT t.act_as('db');
SELECT t.eq((SELECT count(*) FROM sewspace_drafts), 0, 'another person sees no drafts');
SELECT t.eq(t.affected($$UPDATE sewspace_drafts SET payload = '{}' WHERE user_id = 'da'$$), 0, 'another person cannot change it');
SELECT t.eq(t.affected($$DELETE FROM sewspace_drafts WHERE user_id = 'da'$$), 0, 'another person cannot delete it');
SELECT t.rejects($$INSERT INTO sewspace_drafts (user_id, kind) VALUES ('da', 'topic')$$, 'cannot plant a draft for someone else');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_drafts), 0, 'signed out sees no drafts');
SELECT t.rejects($$INSERT INTO sewspace_drafts (user_id, kind) VALUES ('', 'post')$$, 'signed out cannot save a draft');

-- The owner cannot hand it over, but can delete it.
SELECT t.act_as('da');
SELECT t.rejects($$UPDATE sewspace_drafts SET user_id = 'db'$$, 'cannot hand a draft to someone else');
SELECT t.eq(t.affected($$DELETE FROM sewspace_drafts WHERE kind = 'post'$$), 1, 'owner deletes their draft');
RESET ROLE;
\echo '  drafts for owner, other user, signed out: ok'
