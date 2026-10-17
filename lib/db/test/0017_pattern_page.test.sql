-- Review numbers count every review (even from people the viewer has blocked) and return only numbers.
\i test/helpers.psql
INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('pp_a', 'Ann', 'pp.ann'), ('pp_b', 'Ben', 'pp.ben');
INSERT INTO sewspace_catalog (id, kind, slug, name, category, created_by) VALUES (21701, 'pattern', 'pp-willa', 'Willa', 'dresses', 'pp_a');
INSERT INTO sewspace_reviews (catalog_id, user_id, rating, alterations) VALUES (21701, 'pp_a', 5, '{fba,swayback}'), (21701, 'pp_b', 4, '{fba}');
INSERT INTO sewspace_blocks VALUES ('pp_a', 'pp_b');
SELECT t.act_as('pp_a');
SELECT t.eq((SELECT count(*) FROM sewspace_reviews WHERE catalog_id = 21701), 1, 'the blocked person''s review is hidden');
SELECT t.eq((SELECT sum(n) FROM sewspace_catalog_review_numbers(21701) WHERE what = 'stars')::bigint, 2, 'but counted in the numbers');
SELECT t.eq((SELECT n FROM sewspace_catalog_review_numbers(21701) WHERE what = 'alteration' AND key = 'fba'), 2, 'alterations counted across reviews');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_catalog_review_numbers(21701)), 4, 'signed out gets the same numbers');
RESET ROLE;
\echo '  review numbers: ok'
