-- Phase F3: swatch colours and pattern formats stay with their owner.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('sf3_a', 'Ann', 'sf3.ann'), ('sf3_b', 'Ben', 'sf3.ben');
INSERT INTO sewspace_fabrics (id, user_id, name, type, color, color_hex, visibility) VALUES (21201, 'sf3_a', 'Chambray', 'linen', 'Chambray blue', '#7f9cc4', 'public');
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty, format) VALUES (21201, 'sf3_a', 'Bayside', 'Top', '', 'pdf');

SELECT t.act_as('sf3_a');
SELECT t.rejects($$UPDATE sewspace_fabrics SET color_hex = 'blue' WHERE id = 21201$$, 'only #rrggbb');
SELECT t.rejects($$UPDATE sewspace_fabrics SET color_hex = '#ABCDEF' WHERE id = 21201$$, 'lower case only');
SELECT t.rejects($$UPDATE sewspace_patterns SET format = 'scroll' WHERE id = 21201$$, 'known formats only');
UPDATE sewspace_patterns SET format = 'paper' WHERE id = 21201;
SELECT t.act_as('sf3_b');
SELECT t.eq((SELECT count(*) FROM sewspace_fabrics WHERE id = 21201 AND color_hex = '#7f9cc4'), 1, 'a public fabric''s swatch is readable');
SELECT t.eq(t.affected($$UPDATE sewspace_fabrics SET color_hex = '#000000' WHERE id = 21201$$), 0, 'another person cannot change it');
SELECT t.eq((SELECT count(*) FROM sewspace_patterns WHERE id = 21201), 0, 'a private pattern stays hidden');
RESET ROLE;
\echo '  fabric swatches and pattern formats: ok'
