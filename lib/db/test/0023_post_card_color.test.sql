-- Status card colours: five brand colours, yellow by default, only the author sets it.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('cc_a', 'Ann', 'cc.ann'), ('cc_b', 'Ben', 'cc.ben');
SELECT t.act_as('cc_a');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES (25001, 'cc_a', 'status', 'Hello', 'public');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 25001 AND card_color = 'yellow'), 1, 'yellow unless chosen');
SELECT t.eq(t.affected($$UPDATE sewspace_posts SET card_color = 'blue' WHERE id = 25001$$), 1, 'the author picks a colour');
SELECT t.rejects($$UPDATE sewspace_posts SET card_color = 'green' WHERE id = 25001$$, 'only the five brand colours');
SELECT t.act_as('cc_b');
SELECT t.eq(t.affected($$UPDATE sewspace_posts SET card_color = 'red' WHERE id = 25001$$), 0, 'only the author sets it');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 25001 AND card_color = 'blue'), 1, 'others read it with the post, unchanged');
\echo '  status card colours: ok'
