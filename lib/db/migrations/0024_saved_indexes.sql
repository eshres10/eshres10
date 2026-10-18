-- Saved page (owner's Saved brief): "All posts" pages through your post saves
-- and pattern hearts newest first. Two indexes only; no table changes (the
-- collections from migration 0020 are reused as they are).
CREATE INDEX IF NOT EXISTS sewspace_saves_user_recent_idx ON sewspace_saves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sewspace_catalog_saves_user_recent_idx ON sewspace_catalog_saves (user_id, created_at DESC);
