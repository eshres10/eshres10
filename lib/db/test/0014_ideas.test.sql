-- Phase S2: ideas are private to their owner and only pair the owner's own items.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('si_a', 'Ann', 'si.ann'), ('si_b', 'Ben', 'si.ben');
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty, visibility) VALUES
  (21401, 'si_a', 'Willa Dress', 'Dress', '', 'private'), (21402, 'si_b', 'Ben public pattern', 'Top', '', 'public');
INSERT INTO sewspace_fabrics (id, user_id, name, type, color, visibility) VALUES
  (21401, 'si_a', 'Polka dot cotton', 'cotton', '', 'private'), (21402, 'si_b', 'Ben public fabric', 'linen', '', 'public');

SELECT t.act_as('si_a');
INSERT INTO sewspace_ideas (id, user_id, pattern_id, fabric_id, note) VALUES (21401, 'si_a', 21401, 21401, 'For summer');
SELECT t.rejects($$INSERT INTO sewspace_ideas (user_id, pattern_id, fabric_id) VALUES ('si_a', 21402, 21401)$$, 'not someone else''s pattern, even public');
SELECT t.rejects($$INSERT INTO sewspace_ideas (user_id, pattern_id, fabric_id) VALUES ('si_a', 21401, 21402)$$, 'not someone else''s fabric, even public');
SELECT t.rejects($$INSERT INTO sewspace_ideas (user_id, pattern_id, fabric_id) VALUES ('si_b', 21401, 21401)$$, 'not as someone else');
SELECT t.rejects($$UPDATE sewspace_ideas SET fabric_id = 21402 WHERE id = 21401$$, 'cannot repoint at someone else''s fabric');
SELECT t.rejects($$UPDATE sewspace_ideas SET note = repeat('x', 81) WHERE id = 21401$$, 'notes are at most 80 characters');
SELECT t.eq((SELECT count(*) FROM sewspace_ideas), 1, 'owner reads');

SELECT t.act_as('si_b');
SELECT t.eq((SELECT count(*) FROM sewspace_ideas), 0, 'another person reads nothing');
SELECT t.eq(t.affected($$UPDATE sewspace_ideas SET note = 'mine now' WHERE id = 21401$$), 0, 'or changes');
SELECT t.eq(t.affected($$DELETE FROM sewspace_ideas WHERE id = 21401$$), 0, 'or deletes');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_ideas), 0, 'signed out reads nothing');

SELECT t.act_as('si_a');
DELETE FROM sewspace_fabrics WHERE id = 21401;
SELECT t.eq((SELECT count(*) FROM sewspace_ideas), 0, 'deleting the fabric deletes the idea');
RESET ROLE;
\echo '  ideas are private and pair your own items: ok'
