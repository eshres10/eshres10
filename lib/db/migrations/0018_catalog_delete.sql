-- Shared pages: the person who added a page may delete it while nobody else
-- uses it (owner decision, after a page added from a private pattern showed
-- up in the directory). "Used" = someone else's review, save, linked library
-- item (pattern, fabric, thread) or forum topic/reply naming the page. Their
-- own links and review go with it (links are ON DELETE SET NULL; reviews,
-- sizes and saves cascade). Admins don't get a new power here.
-- The check reads other people's rows, which RLS hides from the caller, so it
-- is a small SECURITY DEFINER function that returns only true/false.
CREATE OR REPLACE FUNCTION sewspace_catalog_used_by_others(cid integer)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (SELECT 1 FROM sewspace_reviews WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
        OR EXISTS (SELECT 1 FROM sewspace_catalog_saves WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
        OR EXISTS (SELECT 1 FROM sewspace_patterns WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
        OR EXISTS (SELECT 1 FROM sewspace_fabrics WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
        OR EXISTS (SELECT 1 FROM sewspace_threads WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
        OR EXISTS (SELECT 1 FROM sewspace_forum_topics WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
        OR EXISTS (SELECT 1 FROM sewspace_forum_replies WHERE catalog_id = cid AND user_id IS DISTINCT FROM sewspace_current_user_id())
  $$;
REVOKE ALL ON FUNCTION sewspace_catalog_used_by_others(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_catalog_used_by_others(integer) TO sewspace_app;

GRANT DELETE ON sewspace_catalog TO sewspace_app;
DROP POLICY IF EXISTS creator_delete ON sewspace_catalog;
CREATE POLICY creator_delete ON sewspace_catalog FOR DELETE TO sewspace_app
  USING (created_by = sewspace_current_user_id() AND NOT sewspace_catalog_used_by_others(id));
