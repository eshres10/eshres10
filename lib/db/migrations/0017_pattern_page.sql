-- Pattern page (docs/design/patterns): the star breakdown and the common
-- alterations count every review, like the overall rating already does
-- (sewspace_catalog_stats), so the numbers don't change with who is looking.
-- Only numbers leave this function.
CREATE OR REPLACE FUNCTION sewspace_catalog_review_numbers(cid integer)
  RETURNS TABLE (what text, key text, n bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT 'stars', r.rating::text, count(*) FROM sewspace_reviews r WHERE r.catalog_id = cid GROUP BY r.rating
    UNION ALL
    SELECT 'alteration', a, count(*) FROM sewspace_reviews r, unnest(r.alterations) a WHERE r.catalog_id = cid GROUP BY a
  $$;
REVOKE ALL ON FUNCTION sewspace_catalog_review_numbers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_catalog_review_numbers(integer) TO sewspace_app;
