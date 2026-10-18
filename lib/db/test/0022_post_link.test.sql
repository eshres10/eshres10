-- Post links: only http(s), only the author sets them, they follow the post.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES ('pl_a', 'Ann', 'pl.ann'), ('pl_b', 'Ben', 'pl.ben');
SELECT t.act_as('pl_a');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility, link_url) VALUES
  (24001, 'pl_a', 'status', 'Public', 'public', 'https://example.com/pattern'),
  (24002, 'pl_a', 'status', 'Private', 'private', 'https://example.com/secret');
SELECT t.rejects($$UPDATE sewspace_posts SET link_url = 'javascript:alert(1)' WHERE id = 24001$$, 'only http(s) links');
SELECT t.rejects($$UPDATE sewspace_posts SET link_url = 'https://exa mple.com' WHERE id = 24001$$, 'no spaces');
SELECT t.act_as('pl_b');
SELECT t.eq(t.affected($$UPDATE sewspace_posts SET link_url = 'https://spam.example' WHERE id = 24001$$), 0, 'only the author sets the link');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 24001 AND link_url = 'https://example.com/pattern'), 1, 'a public post''s link is readable and unchanged');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 24002), 0, 'a private post''s link is not');
\echo '  post links follow their post: ok'
