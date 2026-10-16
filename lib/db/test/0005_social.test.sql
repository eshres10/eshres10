-- Phase 4: likes, comments, saves, follows, blocks, reports and admin review.
\i test/helpers.psql

INSERT INTO sewspace_profiles (user_id, name, handle) VALUES
  ('sa', 'Sam', 's.sam'), ('sf', 'Fen', 's.fen'), ('so', 'Oak', 's.oak'), ('sb', 'Bo', 's.bo'), ('sx', 'Admin', 's.admin');
INSERT INTO sewspace_profiles (user_id, name) VALUES ('sn', 'No handle');
INSERT INTO sewspace_follows VALUES ('sf', 'sa');
INSERT INTO sewspace_posts (id, user_id, kind, caption, visibility) VALUES
  (501, 'sa', 'status', 'public', 'public'), (502, 'sa', 'status', 'followers', 'followers'), (503, 'sa', 'status', 'private', 'private');

RESET ROLE;
CREATE OR REPLACE FUNCTION t.admin(on_ boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.is_admin', CASE WHEN on_ THEN 'on' ELSE '' END, false)
$$;
GRANT EXECUTE ON FUNCTION t.admin(boolean) TO sewspace_app;

-- Likes: only posts you may see, only as yourself.
SELECT t.act_as('so');
INSERT INTO sewspace_likes (user_id, post_id) VALUES ('so', 501);
SELECT t.rejects($$INSERT INTO sewspace_likes (user_id, post_id) VALUES ('so', 502)$$, 'cannot like a followers-only post without following');
SELECT t.rejects($$INSERT INTO sewspace_likes (user_id, post_id) VALUES ('sf', 501)$$, 'cannot like as someone else');
SELECT t.act_as('sf');
INSERT INTO sewspace_likes (user_id, post_id) VALUES ('sf', 501), ('sf', 502);
SELECT t.rejects($$INSERT INTO sewspace_likes (user_id, post_id) VALUES ('sf', 503)$$, 'cannot like a private post');
SELECT t.eq(t.affected($$DELETE FROM sewspace_likes WHERE user_id = 'so'$$), 0, 'cannot remove someone else''s like');
SELECT t.act_as(NULL);
SELECT t.rejects($$INSERT INTO sewspace_likes (user_id, post_id) VALUES ('', 501)$$, 'signed out cannot like');
SELECT t.eq((SELECT count(*) FROM sewspace_likes WHERE post_id = 501), 2, 'signed out sees likes on a public post');
SELECT t.eq((SELECT count(*) FROM sewspace_likes WHERE post_id = 502), 0, 'signed out sees no likes on a followers-only post');
SELECT t.eq((SELECT sum(likes)::bigint FROM sewspace_post_counts(ARRAY[501, 502, 503])), 2, 'counts only for visible posts');

-- Comments and replies.
SELECT t.act_as('so');
INSERT INTO sewspace_comments (id, post_id, user_id, body) VALUES (601, 501, 'so', 'Lovely');
SELECT t.rejects($$INSERT INTO sewspace_comments (post_id, user_id, body) VALUES (502, 'so', 'x')$$, 'cannot comment on a post you cannot see');
SELECT t.rejects($$INSERT INTO sewspace_comments (post_id, user_id, body) VALUES (501, 'sf', 'x')$$, 'cannot comment as someone else');
SELECT t.rejects($$INSERT INTO sewspace_comments (post_id, user_id, body) VALUES (501, 'so', '   ')$$, 'empty comment');
SELECT t.act_as('sf');
INSERT INTO sewspace_comments (id, post_id, user_id, parent_id, body) VALUES (602, 501, 'sf', 601, 'Agreed');
SELECT t.rejects($$INSERT INTO sewspace_comments (post_id, user_id, parent_id, body) VALUES (501, 'sf', 602, 'nested')$$, 'only one level of replies');
INSERT INTO sewspace_comments (id, post_id, user_id, body) VALUES (603, 502, 'sf', 'followers chat');
SELECT t.rejects($$INSERT INTO sewspace_comments (post_id, user_id, parent_id, body) VALUES (501, 'sf', 603, 'cross-post')$$, 'a reply stays on its post');
SELECT t.eq(t.affected($$DELETE FROM sewspace_comments WHERE id = 601$$), 0, 'cannot delete someone else''s comment');
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_comments), 2, 'signed out sees comments on public posts only');
SELECT t.eq((SELECT sum(comments)::bigint FROM sewspace_post_counts(ARRAY[501, 502])), 2, 'comment counts for visible posts');

-- The post's author can remove comments on their post.
SELECT t.act_as('sa');
INSERT INTO sewspace_comments (id, post_id, user_id, body) VALUES (604, 501, 'sa', 'Thanks!');
SELECT t.eq(t.affected($$DELETE FROM sewspace_comments WHERE id = 602$$), 1, 'post author removes a reply');

-- Saves are private.
SELECT t.act_as('sf');
INSERT INTO sewspace_saves (user_id, post_id) VALUES ('sf', 501), ('sf', 502);
SELECT t.rejects($$INSERT INTO sewspace_saves (user_id, post_id) VALUES ('sf', 503)$$, 'cannot save a post you cannot see');
SELECT t.act_as('sa');
SELECT t.eq((SELECT count(*) FROM sewspace_saves), 0, 'nobody sees other people''s saves');

-- Follows.
SELECT t.act_as('so');
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('so', 'sa');
SELECT t.rejects($$INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('sf', 'so')$$, 'cannot follow as someone else');
SELECT t.rejects($$INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('so', 'sn')$$, 'cannot follow someone without a handle');
SELECT t.rejects($$INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('so', 'so')$$, 'cannot follow yourself');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE user_id = 'sa'), 2, 'following opens followers-only posts');
-- The person followed can remove a follower.
SELECT t.act_as('sa');
SELECT t.eq(t.affected($$DELETE FROM sewspace_follows WHERE follower_id = 'so'$$), 1, 'remove a follower');

-- Blocks: end follows both ways, hide everything both ways, stop new follows.
SELECT t.act_as('sb');
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('sb', 'sa');
INSERT INTO sewspace_comments (id, post_id, user_id, body) VALUES (605, 501, 'sb', 'from Bo');
SELECT t.act_as('sa');
INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('sa', 'sb');
INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES ('sa', 'sb');
SELECT t.rejects($$INSERT INTO sewspace_blocks (blocker_id, blocked_id) VALUES ('sb', 'so')$$, 'cannot block as someone else');
SELECT t.eq((SELECT count(*) FROM sewspace_follows WHERE 'sb' IN (follower_id, followee_id)), 0, 'block ends follows both ways');
SELECT t.eq((SELECT count(*) FROM sewspace_comments WHERE user_id = 'sb'), 0, 'blocker no longer sees the blocked person''s comments');
SELECT t.eq((SELECT count(*) FROM sewspace_my_blocks()), 1, 'blocker can list who they blocked');
SELECT t.act_as('sb');
SELECT t.rejects($$INSERT INTO sewspace_follows (follower_id, followee_id) VALUES ('sb', 'sa')$$, 'cannot follow across a block');
SELECT t.rejects($$INSERT INTO sewspace_likes (user_id, post_id) VALUES ('sb', 501)$$, 'cannot like across a block');
SELECT t.rejects($$INSERT INTO sewspace_comments (post_id, user_id, body) VALUES (501, 'sb', 'x')$$, 'cannot comment across a block');
SELECT t.eq((SELECT count(*) FROM sewspace_blocks), 0, 'blocked person cannot see the block');
SELECT t.eq((SELECT count(*) FROM sewspace_my_blocks()), 0, 'my_blocks lists only your own blocks');

-- Reports: filed as yourself, seen by you and admins only; only admins resolve.
SELECT t.act_as('so');
INSERT INTO sewspace_reports (id, reporter_id, target_kind, target_id, target_user_id, reason) VALUES (701, 'so', 'post', '503', 'sa', 'spam');
SELECT t.rejects($$INSERT INTO sewspace_reports (reporter_id, target_kind, target_id, target_user_id, reason) VALUES ('sf', 'post', '501', 'sa', 'spam')$$, 'cannot report as someone else');
SELECT t.rejects($$INSERT INTO sewspace_reports (reporter_id, target_kind, target_id, target_user_id, reason, status) VALUES ('so', 'post', '501', 'sa', 'spam', 'dismissed')$$, 'cannot file a resolved report');
SELECT t.eq(t.affected($$UPDATE sewspace_reports SET status = 'dismissed'$$), 0, 'reporter cannot resolve');
SELECT t.act_as('sf');
SELECT t.eq((SELECT count(*) FROM sewspace_reports), 0, 'others cannot see reports');
-- Being admin needs both the flag and a signed-in user.
SELECT t.admin(true);
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_reports), 0, 'admin flag without a user does nothing');
SELECT t.act_as('sx');
SELECT t.eq((SELECT count(*) FROM sewspace_reports), 1, 'admin sees reports');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 503), 1, 'admin sees a reported private post');
SELECT t.eq((SELECT count(*) FROM sewspace_posts WHERE id = 502), 0, 'admin does not see unreported followers-only posts');
SELECT t.eq(t.affected($$DELETE FROM sewspace_posts WHERE id = 502$$), 0, 'admin cannot remove unreported posts');
SELECT t.eq(t.affected($$DELETE FROM sewspace_posts WHERE id = 503$$), 1, 'admin removes a reported post');
SELECT t.eq(t.affected($$UPDATE sewspace_reports SET status = 'removed', resolved_at = now(), resolved_by = 'sx' WHERE id = 701$$), 1, 'admin resolves a report');
SELECT t.admin(false);
SELECT t.eq((SELECT count(*) FROM sewspace_reports), 0, 'without the flag, the same user is not an admin');
RESET ROLE;
\echo '  likes, comments, saves, follows, blocks, reports, admin: ok'
