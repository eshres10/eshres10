-- Policies name no role (so Replit's Publish can copy them), yet nobody but
-- the app role can touch a table: PUBLIC holds no privileges, and a role with
-- no grants is refused on every table, even with the policies applying to it.
\i test/helpers.psql

SELECT t.eq((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles <> '{public}'), 0, 'no policy names a role');
SELECT t.eq((SELECT count(*) FROM pg_policies WHERE schemaname = 'public'), (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles = '{public}'), 'every policy applies to PUBLIC');
SELECT t.eq((SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'PUBLIC'), 0, 'PUBLIC has no table privileges');
SELECT t.eq((SELECT count(*) FROM information_schema.column_privileges WHERE table_schema = 'public' AND grantee = 'PUBLIC'), 0, 'PUBLIC has no column privileges');

DROP ROLE IF EXISTS sewspace_test_stranger;
CREATE ROLE sewspace_test_stranger NOLOGIN;
GRANT sewspace_test_stranger TO CURRENT_USER;
SET ROLE sewspace_test_stranger;
DO $$
DECLARE r record; allowed int := 0;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM %I LIMIT 1', r.relname);
      allowed := allowed + 1;
      RAISE WARNING 'a role with no grants could read %', r.relname;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF allowed > 0 THEN RAISE EXCEPTION 'FAIL a role with no grants could read % tables or views', allowed; END IF;
END $$;
RESET ROLE;
DROP ROLE sewspace_test_stranger;

-- The app role still gets exactly its rules (the other test files prove each one).
SELECT t.act_as(NULL);
SELECT t.eq((SELECT count(*) FROM sewspace_measurement_profiles), 0, 'signed out still sees no measurements');
