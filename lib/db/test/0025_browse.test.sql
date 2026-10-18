-- Browse: trending hashtags and save counts are public posts only (never
-- followers-only or private), numbers only, and nothing across a block.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('br_a', 'Ann', 'br.ann'), ('br_b', 'Ben', 'br.ben'), ('br_c', 'Cy', 'br.cy');
SELECT t.act_as('br_a');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility, garment, fabric) VALUES
  (26001, 'br_a', 'status', 'Public', 'public', 'kids', 'denim'),
  (26002, 'br_a', 'status', 'Quiet', 'followers', 'formal', 'wool'),
  (26003, 'br_a', 'status', 'Secret', 'private', 'skirts', 'knit');
SELECT t.rejects($$UPDATE sewspace_posts SET garment = 'hats' WHERE id = 26001$$, 'only the listed garments');
SELECT t.rejects($$UPDATE sewspace_posts SET fabric = 'silk' WHERE id = 26001$$, 'only the listed fabrics');
INSERT INTO sewspace_post_hashtags (post_id, hashtag_id, user_id)
  SELECT p, h.id, 'br_a' FROM (VALUES (26001), (26002), (26003)) v(p), sewspace_hashtag_ids(ARRAY['brzerowaste']) h;
SELECT t.act_as('br_b');
INSERT INTO sewspace_saves (user_id, post_id) VALUES ('br_b', 26001);
SELECT t.act_as('br_c');
INSERT INTO sewspace_saves (user_id, post_id) VALUES ('br_c', 26001);
SELECT t.eq((SELECT posts FROM sewspace_trending_hashtags(7, 30) WHERE tag = 'brzerowaste'), 1, 'trending counts the public post only');
SELECT t.eq((SELECT saves FROM sewspace_save_counts(ARRAY[26001], 7)), 2, 'save counts: numbers only');
SELECT t.eq((SELECT count(*) FROM sewspace_save_counts(ARRAY[26002, 26003], 7)), 0, 'no numbers for followers-only or private posts');
SELECT t.eq((SELECT count(*) FROM sewspace_saves WHERE post_id = 26001), 1, 'who saved stays private (Cy sees only her own save)');
RESET ROLE;
INSERT INTO sewspace_blocks VALUES ('br_a', 'br_c');
SELECT t.act_as('br_c');
SELECT t.eq((SELECT count(*) FROM sewspace_trending_hashtags(7, 30) WHERE tag = 'brzerowaste'), 0, 'nothing across a block');
SELECT t.eq((SELECT count(*) FROM sewspace_save_counts(ARRAY[26001], 7)), 0, 'no numbers across a block');
\echo '  browse: trending tags and save counts are public only: ok'
