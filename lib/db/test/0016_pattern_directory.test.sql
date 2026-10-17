-- Pattern directory: designer can only be yourself (admins anyone), size chart
-- written by the page's creator, saves private, new profile links public.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle, shop_url, instagram) VALUES
  ('pd_a', 'Ann', 'pd.ann', 'https://ann.example', 'ann.sews'), ('pd_b', 'Ben', 'pd.ben', NULL, NULL), ('pd_adm', 'Admin', 'pd.adm', NULL, NULL);
INSERT INTO sewspace_catalog (id, kind, slug, name, maker, category, created_by) VALUES
  (21601, 'pattern', 'pd-willa', 'Willa', 'Ann', 'dresses', 'pd_a');

SELECT t.act_as('pd_a');
UPDATE sewspace_catalog SET designer_id = 'pd_a', source = 'designer', price_cents = 1600, currency = 'AUD' WHERE id = 21601;
SELECT t.eq((SELECT count(*) FROM sewspace_catalog WHERE id = 21601 AND designer_id = 'pd_a'), 1, 'the creator names themselves the designer');
SELECT t.rejects($$UPDATE sewspace_catalog SET designer_id = 'pd_b' WHERE id = 21601$$, 'but not someone else');
SELECT t.rejects($$INSERT INTO sewspace_catalog (kind, slug, name, category, created_by, designer_id) VALUES ('pattern', 'pd-x', 'X', 'tops', 'pd_a', 'pd_b')$$, 'not on a new page either');
SELECT t.rejects($$UPDATE sewspace_catalog SET currency = 'aud' WHERE id = 21601$$, 'currency is a three-letter code');
SELECT t.rejects($$UPDATE sewspace_catalog SET source = 'shop' WHERE id = 21601$$, 'source is designer, free or seams_club');
INSERT INTO sewspace_catalog_sizes (catalog_id, position, label, bust_cm, waist_cm, hip_cm) VALUES (21601, 0, '14', 100, 82, 106);
SELECT t.rejects($$INSERT INTO sewspace_catalog_sizes (catalog_id, position, label, bust_cm) VALUES (21601, 1, '16', 5)$$, 'measurements are sensible');

SELECT t.act_as('pd_b');
SELECT t.eq(t.affected($$UPDATE sewspace_catalog SET designer_id = 'pd_b' WHERE id = 21601$$), 0, 'others cannot claim the page');
SELECT t.rejects($$INSERT INTO sewspace_catalog_sizes (catalog_id, position, label) VALUES (21601, 2, '18')$$, 'or add sizes');
SELECT t.eq(t.affected($$DELETE FROM sewspace_catalog_sizes WHERE catalog_id = 21601$$), 0, 'or delete them');
SELECT t.eq((SELECT count(*) FROM sewspace_catalog_sizes WHERE catalog_id = 21601), 1, 'everyone reads the size chart');
INSERT INTO sewspace_catalog_saves (user_id, catalog_id) VALUES ('pd_b', 21601);
SELECT t.rejects($$INSERT INTO sewspace_catalog_saves (user_id, catalog_id) VALUES ('pd_a', 21601)$$, 'saves only as yourself');
SELECT t.eq((SELECT count(*) FROM sewspace_public_profiles WHERE user_id = 'pd_a' AND shop_url = 'https://ann.example' AND instagram = 'ann.sews'), 1, 'shop and Instagram links are public');
SELECT t.rejects($$UPDATE sewspace_profiles SET shop_url = 'javascript:alert(1)' WHERE user_id = 'pd_b'$$, 'shop links are https');

SELECT t.act_as('pd_a');
SELECT t.eq((SELECT count(*) FROM sewspace_catalog_saves), 0, 'saves are private to the saver');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_catalog_saves), 0, 'signed out reads no saves');
SELECT t.eq((SELECT count(*) FROM sewspace_catalog_sizes WHERE catalog_id = 21601), 1, 'signed out reads the size chart');
RESET ROLE;

SET app.user_id = 'pd_adm';
SET app.is_admin = 'on';
SET ROLE sewspace_app;
UPDATE sewspace_catalog SET designer_id = 'pd_b' WHERE id = 21601;
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_catalog WHERE id = 21601 AND designer_id = 'pd_b'), 1, 'an admin can set the designer');
RESET app.user_id;
RESET app.is_admin;

INSERT INTO sewspace_reviews (catalog_id, user_id, rating, alterations) VALUES (21601, 'pd_b', 5, '{fba,swayback}');
SELECT t.rejects($$INSERT INTO sewspace_reviews (catalog_id, user_id, rating, alterations) VALUES (21601, 'pd_a', 5, '{made_up}')$$, 'alterations come from the list');
\echo '  pattern directory data: ok'
