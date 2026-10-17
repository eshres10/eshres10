-- Rollback for 0016: the new columns all have defaults or are nullable, and the
-- new tables are only read by the new API, so older API builds ignore them.
-- Their rows and values stay (additive only). The one thing an older build
-- would trip over is the designer trigger, which only fires when designer_id
-- changes; it stays too. To re-run 0016 later, forget it was applied:
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0016_pattern_directory.down.sql
BEGIN;
DELETE FROM sewspace_schema_migrations WHERE name = '0016_pattern_directory.sql';
COMMIT;
