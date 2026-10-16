-- Emergency rollback for 0007: switches challenges, members and entries off
-- for the app (RLS with no policies hides every row). Tables and data are
-- kept. The widened report check stays (it only allows more).
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/rollback/0007_challenges.down.sql
BEGIN;
DROP POLICY IF EXISTS visible_read ON sewspace_challenges;
DROP POLICY IF EXISTS own_insert ON sewspace_challenges;
DROP POLICY IF EXISTS host_update ON sewspace_challenges;
DROP POLICY IF EXISTS admin_delete ON sewspace_challenges;
DROP POLICY IF EXISTS visible_read ON sewspace_challenge_members;
DROP POLICY IF EXISTS own_join ON sewspace_challenge_members;
DROP POLICY IF EXISTS own_leave ON sewspace_challenge_members;
DROP POLICY IF EXISTS visible_read ON sewspace_challenge_entries;
DROP POLICY IF EXISTS own_enter ON sewspace_challenge_entries;
DROP POLICY IF EXISTS own_withdraw ON sewspace_challenge_entries;
DROP POLICY IF EXISTS host_remove ON sewspace_challenge_entries;
DROP FUNCTION IF EXISTS sewspace_challenge_counts(integer[]);
DELETE FROM sewspace_schema_migrations WHERE name = '0007_challenges.sql';
COMMIT;
