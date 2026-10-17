-- Keep forum tag validation equivalent to sewspace_valid_tags(tags), but use
-- built-in expressions so the Publish schema diff can serialize the check.
ALTER TABLE sewspace_forum_topics
  DROP CONSTRAINT sewspace_forum_topics_tags_check;

ALTER TABLE sewspace_forum_topics
  ADD CONSTRAINT sewspace_forum_topics_tags_check CHECK (
    coalesce(array_length(tags, 1), 0) <= 5
    AND coalesce(
      regexp_replace(
        CASE
          WHEN tags::text LIKE '[%' THEN regexp_replace(tags::text, '^[^=]*=', '')
          ELSE tags::text
        END,
        '[{}]', '', 'g'
      ) ~ '^$|^(NULL|[a-z0-9-]{1,30})(,(NULL|[a-z0-9-]{1,30}))*$',
      true
    )
  );
