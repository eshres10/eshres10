-- Rollback for 0015: nothing to switch off. sewspace_onboarding is private
-- (owner_all only) and sewspace_profiles.default_post_visibility has a
-- default, so older API builds ignore both; their rows and values stay.
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0015_onboarding.down.sql
BEGIN;
DELETE FROM sewspace_schema_migrations WHERE name = '0015_onboarding.sql';
COMMIT;
