-- The page's creator deletes it only while nobody else uses it; nobody else ever can.
\i test/helpers.psql
INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('cd_a', 'Ann', 'cd.ann'), ('cd_b', 'Ben', 'cd.ben');
INSERT INTO sewspace_catalog (id, kind, slug, name, category, created_by) VALUES
  (21801, 'pattern', 'cd-solo', 'Solo', 'trousers', 'cd_a'),
  (21802, 'pattern', 'cd-reviewed', 'Reviewed', 'trousers', 'cd_a'),
  (21803, 'pattern', 'cd-saved', 'Saved', 'trousers', 'cd_a'),
  (21804, 'pattern', 'cd-linked', 'Linked', 'trousers', 'cd_a');
-- Ann's own private library pattern and review on the page she added: still hers to delete.
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty, catalog_id) VALUES (21801, 'cd_a', 'Ines', 'trousers', '', 21801);
INSERT INTO sewspace_reviews (catalog_id, user_id, rating) VALUES (21801, 'cd_a', 5);
-- Ben uses the other three, in three different ways (all private to Ben).
INSERT INTO sewspace_reviews (catalog_id, user_id, rating) VALUES (21802, 'cd_b', 4);
INSERT INTO sewspace_catalog_saves (user_id, catalog_id) VALUES ('cd_b', 21803);
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty, catalog_id) VALUES (21802, 'cd_b', 'Ben copy', 'trousers', '', 21804);

SELECT t.act_as('cd_b');
SELECT t.eq(t.affected('DELETE FROM sewspace_catalog WHERE id = 21801'), 0, 'someone else can''t delete a page');
SELECT t.act_as(NULL);
SELECT t.eq(t.affected('DELETE FROM sewspace_catalog WHERE id = 21801'), 0, 'signed out can''t delete');
SELECT t.act_as('cd_a');
SELECT t.eq(t.affected('DELETE FROM sewspace_catalog WHERE id IN (21802, 21803, 21804)'), 0, 'not while someone else reviews, saves or links it');
SELECT t.eq(t.affected('DELETE FROM sewspace_catalog WHERE id = 21801'), 1, 'the creator deletes an unused page');
SELECT t.eq((SELECT count(*) FROM sewspace_patterns WHERE name = 'Ines' AND catalog_id IS NULL), 1, 'her own pattern stays, unlinked');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_catalog WHERE id BETWEEN 21802 AND 21804), 3, 'the used pages are still there');
\echo '  catalog delete: ok'
