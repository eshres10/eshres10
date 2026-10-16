-- Phase 5: catalog pages, links, reviews, helpful votes, review reports.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('ca', 'Cat', 'c.cat'), ('cb', 'Bea', 'c.bea'), ('cz', 'Zed', 'c.zed'), ('cx', 'Admin', 'c.admin');
INSERT INTO sewspace_blocks VALUES ('cb', 'cz');
INSERT INTO sewspace_projects (id, user_id, name, visibility) VALUES (801, 'ca', 'Cat make', 'public'), (802, 'cb', 'Bea make', 'public');
INSERT INTO sewspace_patterns (id, user_id, name, garment_type, difficulty) VALUES (801, 'ca', 'My Willa', 'dress', 'intermediate');

RESET ROLE;
CREATE OR REPLACE FUNCTION t.admin(on_ boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.is_admin', CASE WHEN on_ THEN 'on' ELSE '' END, false)
$$;
GRANT EXECUTE ON FUNCTION t.admin(boolean) TO sewspace_app;

-- Catalog entries: anyone reads, signed-in people add as themselves.
SELECT t.act_as('ca');
INSERT INTO sewspace_catalog (id, kind, slug, name, maker, category, created_by) VALUES (901, 'pattern', 'fernhill-willa-dress', 'Willa Dress', 'Fernhill', 'dresses', 'ca');
SELECT t.rejects($$INSERT INTO sewspace_catalog (kind, slug, name, category, created_by) VALUES ('product', 'x', 'X', 'fabric', 'cb')$$, 'cannot add an entry as someone else');
SELECT t.rejects($$INSERT INTO sewspace_catalog (kind, slug, name, category, created_by) VALUES ('product', 'Bad Slug', 'X', 'fabric', 'ca')$$, 'slug format');
SELECT t.rejects($$INSERT INTO sewspace_catalog (kind, slug, name, category, created_by, url) VALUES ('product', 'js', 'X', 'fabric', 'ca', 'javascript:alert(1)')$$, 'only http(s) links');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_catalog), 1, 'signed out reads the catalog');
SELECT t.rejects($$INSERT INTO sewspace_catalog (kind, slug, name, category, created_by) VALUES ('product', 'y', 'Y', 'fabric', '')$$, 'signed out cannot add');

-- Corrections: the person who added it, or an admin; never kind, slug or creator.
SELECT t.act_as('cb');
SELECT t.eq(t.affected($$UPDATE sewspace_catalog SET name = 'Hijacked' WHERE id = 901$$), 0, 'others cannot edit an entry');
SELECT t.act_as('ca');
SELECT t.eq(t.affected($$UPDATE sewspace_catalog SET description = 'A wrap dress' WHERE id = 901$$), 1, 'creator corrects an entry');
SELECT t.rejects($$UPDATE sewspace_catalog SET created_by = 'cb' WHERE id = 901$$, 'creator cannot hand the entry to someone else');
SELECT t.rejects($$UPDATE sewspace_catalog SET slug = 'other' WHERE id = 901$$, 'slug cannot change');
SELECT t.admin(true);
SELECT t.act_as('cx');
SELECT t.eq(t.affected($$UPDATE sewspace_catalog SET maker = 'Fernhill Patterns' WHERE id = 901$$), 1, 'admin corrects an entry');
SELECT t.admin(false);

-- Linking your own pattern to an entry is an ordinary owner write.
SELECT t.act_as('ca');
SELECT t.eq(t.affected($$UPDATE sewspace_patterns SET catalog_id = 901 WHERE id = 801$$), 1, 'link own pattern');
SELECT t.act_as('cb');
SELECT t.eq(t.affected($$UPDATE sewspace_patterns SET catalog_id = NULL WHERE id = 801$$), 0, 'cannot unlink someone else''s pattern');

-- Reviews.
SELECT t.act_as('ca');
INSERT INTO sewspace_reviews (id, catalog_id, user_id, rating, fit, sizing, body, make_id) VALUES (901, 901, 'ca', 5, 4, 'true', 'Lovely', 801);
SELECT t.rejects($$INSERT INTO sewspace_reviews (catalog_id, user_id, rating) VALUES (901, 'cb', 4)$$, 'cannot review as someone else');
SELECT t.rejects($$UPDATE sewspace_reviews SET make_id = 802 WHERE id = 901$$, 'cannot attach someone else''s make');
SELECT t.rejects($$INSERT INTO sewspace_reviews (catalog_id, user_id, rating) VALUES (901, 'ca', 6)$$, 'rating is 1 to 5');
SELECT t.act_as('cb');
INSERT INTO sewspace_reviews (id, catalog_id, user_id, rating, sizing, body) VALUES (902, 901, 'cb', 3, 'small', 'Runs small');
SELECT t.eq(t.affected($$UPDATE sewspace_reviews SET body = 'x' WHERE id = 901$$), 0, 'cannot edit someone else''s review');
SELECT t.eq(t.affected($$DELETE FROM sewspace_reviews WHERE id = 901$$), 0, 'cannot delete someone else''s review');
SELECT t.act_as('cz');
INSERT INTO sewspace_reviews (id, catalog_id, user_id, rating, body) VALUES (903, 901, 'cz', 1, 'Zed says no');

-- Blocks hide reviews both ways; everyone else sees all three.
SELECT t.act_as('cb');
SELECT t.eq((SELECT count(*) FROM sewspace_reviews WHERE catalog_id = 901), 2, 'blocker does not see the blocked person''s review');
SELECT t.act_as('cz');
SELECT t.eq((SELECT count(*) FROM sewspace_reviews WHERE catalog_id = 901), 2, 'blocked person does not see the blocker''s review');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_reviews WHERE catalog_id = 901), 3, 'signed out sees every review');
SELECT t.eq((SELECT reviews FROM sewspace_catalog_stats(ARRAY[901])), 3, 'stats count every review');
SELECT t.eq((SELECT (rating * 10)::bigint FROM sewspace_catalog_stats(ARRAY[901])), 30, 'average rating 3.0');
SELECT t.eq((SELECT runs_small + runs_true * 10 FROM sewspace_catalog_stats(ARRAY[901])), 11, 'sizing split');

-- Helpful votes: your own, on reviews you can see; private.
SELECT t.act_as('cb');
INSERT INTO sewspace_review_votes (review_id, user_id) VALUES (901, 'cb');
SELECT t.rejects($$INSERT INTO sewspace_review_votes (review_id, user_id) VALUES (901, 'ca')$$, 'cannot vote as someone else');
SELECT t.rejects($$INSERT INTO sewspace_review_votes (review_id, user_id) VALUES (903, 'cb')$$, 'cannot vote on a hidden review');
SELECT t.act_as('ca');
SELECT t.eq((SELECT count(*) FROM sewspace_review_votes), 0, 'votes are private');
SELECT t.eq((SELECT helpful FROM sewspace_review_helpful(ARRAY[901])), 1, 'helpful count');

-- Reviews can be reported; admins remove only reported reviews.
SELECT t.act_as('ca');
INSERT INTO sewspace_reports (reporter_id, target_kind, target_id, target_user_id, reason) VALUES ('ca', 'review', '903', 'cz', 'harassment');
SELECT t.admin(true);
SELECT t.act_as('cx');
SELECT t.eq(t.affected($$DELETE FROM sewspace_reviews WHERE id = 902$$), 0, 'admin cannot remove an unreported review');
SELECT t.eq(t.affected($$DELETE FROM sewspace_reviews WHERE id = 903$$), 1, 'admin removes a reported review');
SELECT t.admin(false);
RESET ROLE;
\echo '  catalog, links, reviews, votes, review reports: ok'
