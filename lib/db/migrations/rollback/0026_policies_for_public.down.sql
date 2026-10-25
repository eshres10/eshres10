-- Puts every policy back on the sewspace_app role (needs the role to exist).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND roles = '{public}' LOOP
    EXECUTE format('ALTER POLICY %I ON %I TO sewspace_app', p.policyname, p.tablename);
  END LOOP;
END $$;
