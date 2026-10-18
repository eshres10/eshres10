-- Explore: collections, their items and feedback are private to their owner;
-- post labels only take the fixed values; deleting a target clears it out.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('ex_a', 'Ann', 'ex.ann'), ('ex_b', 'Ben', 'ex.ben');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES (22001, 'ex_b', 'status', 'Linen top', 'public');

SELECT t.act_as('ex_a');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility, garment, fabric) VALUES (22002, 'ex_a', 'status', 'Mine', 'public', 'tops', 'linen');
SELECT t.rejects($$UPDATE sewspace_posts SET garment = 'hats' WHERE id = 22002$$, 'garment is one of the fixed values');
SELECT t.rejects($$UPDATE sewspace_posts SET fabric = 'silk' WHERE id = 22002$$, 'fabric is one of the fixed values');
SELECT t.eq(t.affected($$UPDATE sewspace_posts SET garment = 'dresses' WHERE id = 22001$$), 0, 'only the author labels a post');

INSERT INTO sewspace_collections (id, user_id, name) VALUES (22001, 'ex_a', 'Quick saves');
DO $$ BEGIN
  INSERT INTO sewspace_collections (user_id, name) VALUES ('ex_a', ' quick SAVES ');
  RAISE EXCEPTION 'FAIL names are unique per person, ignoring case';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
SELECT t.rejects($$INSERT INTO sewspace_collections (user_id, name, visibility) VALUES ('ex_a', 'Shared', 'public')$$, 'collections can only be private');
SELECT t.rejects($$INSERT INTO sewspace_collections (user_id, name) VALUES ('ex_b', 'Not mine')$$, 'not as someone else');
SELECT t.rejects($$UPDATE sewspace_collections SET user_id = 'ex_b' WHERE id = 22001$$, 'cannot hand a collection over');
INSERT INTO sewspace_collection_items (collection_id, user_id, item_type, item_id) VALUES (22001, 'ex_a', 'post', 22001);
INSERT INTO sewspace_discover_feedback (user_id, item_type, item_id, kind) VALUES ('ex_a', 'post', 22001, 'see_less');
SELECT t.rejects($$INSERT INTO sewspace_discover_feedback (user_id, item_type, item_id, kind) VALUES ('ex_b', 'post', 22002, 'see_less')$$, 'feedback only as yourself');
SELECT t.eq((SELECT count(*) FROM sewspace_collection_items), 1, 'the owner reads their items');

SELECT t.act_as('ex_b');
SELECT t.eq((SELECT count(*) FROM sewspace_collections WHERE id = 22001), 0, 'nobody else sees a collection');
SELECT t.eq((SELECT count(*) FROM sewspace_collection_items WHERE collection_id = 22001), 0, 'or what is in it, even the saver''s copy of their own post');
SELECT t.eq((SELECT count(*) FROM sewspace_discover_feedback WHERE user_id = 'ex_a'), 0, 'or someone''s Hide feedback');
SELECT t.rejects($$INSERT INTO sewspace_collection_items (collection_id, user_id, item_type, item_id) VALUES (22001, 'ex_b', 'post', 22001)$$, 'cannot add to someone else''s collection');
SELECT t.eq(t.affected($$DELETE FROM sewspace_collections WHERE id = 22001$$), 0, 'or delete it');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_collections) + (SELECT count(*) FROM sewspace_collection_items) + (SELECT count(*) FROM sewspace_discover_feedback), 0, 'signed out reads nothing');

-- Ben deletes his post: it leaves Ann's collection and her feedback.
SELECT t.act_as('ex_b');
DELETE FROM sewspace_posts WHERE id = 22001;
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM sewspace_collection_items WHERE item_type = 'post' AND item_id = 22001), 0, 'deleted post leaves collections');
SELECT t.eq((SELECT count(*) FROM sewspace_discover_feedback WHERE item_type = 'post' AND item_id = 22001), 0, 'and feedback');
\echo '  explore collections and feedback are private: ok'
