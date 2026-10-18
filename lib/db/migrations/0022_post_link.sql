-- A link on a post (owner, October 2026: "add a link" under the Make /
-- Pattern / Fabric tags in the post flow). Additive only: one optional
-- column. It follows its post (same visibility, same RLS); only the author
-- writes it. Only http(s) links, at most 500 characters, no spaces (the API
-- normalises and checks the same; this CHECK is the backstop).
ALTER TABLE sewspace_posts ADD COLUMN IF NOT EXISTS link_url text
  CHECK (link_url IS NULL OR (length(link_url) <= 500 AND link_url ~ '^https?://[^[:space:]]+$'));
