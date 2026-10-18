-- Emergency rollback for 0023_post_card_color.sql (use with the previous API build).
-- Drops the card colour column; status posts go back to yellow. Run as the database owner.
BEGIN;
ALTER TABLE sewspace_posts DROP COLUMN IF EXISTS card_color;
DELETE FROM sewspace_schema_migrations WHERE name = '0023_post_card_color.sql';
COMMIT;
