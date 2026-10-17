-- Phase F2: project setup state and pattern steps stay with their owner.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('ps_a', 'Ann', 'ps.ann'), ('ps_b', 'Ben', 'ps.ben');
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty, visibility, steps)
  VALUES (21101, 'ps_a', 'Bayside Top', 'Top', 'beginner', 'public', '["Cut", "Sew shoulders"]');
INSERT INTO sewspace_projects (id, user_id, name, visibility, garment) VALUES (21101, 'ps_a', 'Sailor top', 'public', 'Top');

SELECT t.act_as('ps_a');
SELECT t.eq((SELECT count(*) FROM sewspace_projects WHERE id = 21101 AND setup = '{}'::jsonb), 1, 'new projects start with an empty setup');
UPDATE sewspace_projects SET setup = '{"visibilityChosen": true, "stepsChoice": "pattern"}' WHERE id = 21101;
SELECT t.rejects($$UPDATE sewspace_projects SET setup = '[1]' WHERE id = 21101$$, 'setup must be an object');
SELECT t.rejects($$UPDATE sewspace_projects SET garment = repeat('x', 41) WHERE id = 21101$$, 'garment at most 40 characters');
SELECT t.rejects($$UPDATE sewspace_patterns SET steps = '{"a": 1}' WHERE id = 21101$$, 'steps must be an array');
SELECT t.rejects($$UPDATE sewspace_patterns SET steps = (SELECT jsonb_agg(i) FROM generate_series(1, 61) i) WHERE id = 21101$$, 'at most 60 steps');

-- Someone else can read the public rows but change nothing.
SELECT t.act_as('ps_b');
SELECT t.eq(t.affected($$UPDATE sewspace_projects SET setup = '{}', garment = 'Bag' WHERE id = 21101$$), 0, 'another person cannot change setup or garment');
SELECT t.eq(t.affected($$UPDATE sewspace_patterns SET steps = '[]' WHERE id = 21101$$), 0, 'another person cannot change pattern steps');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_projects WHERE id = 21101 AND setup->>'stepsChoice' = 'pattern' AND garment = 'Top'), 1, 'owner''s values kept');
\echo '  project setup and pattern steps for owner, other user: ok'
