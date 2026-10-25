-- Replit's Publish copies the development schema to production but can't copy
-- custom roles, so policies written "TO sewspace_app" stop it (Replit support,
-- October 2026). Owner decision: keep every policy exactly as it is and only
-- drop the role from it, so the policies apply to every role (PUBLIC).
--
-- This changes nobody's access: only sewspace_app (and the owner, which skips
-- RLS as the table owner) holds any privilege on these tables, so another role
-- still can't read or write a row. The guard below refuses to run if PUBLIC has
-- been granted anything on a table, because then this would widen access.
-- ALTER POLICY ... TO keeps each policy's USING and WITH CHECK untouched.
DO $$
DECLARE p record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'PUBLIC')
     OR EXISTS (SELECT 1 FROM information_schema.column_privileges WHERE table_schema = 'public' AND grantee = 'PUBLIC') THEN
    RAISE EXCEPTION 'PUBLIC has table privileges in schema public: refusing to make policies apply to PUBLIC';
  END IF;
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND roles = '{sewspace_app}' LOOP
    EXECUTE format('ALTER POLICY %I ON %I TO PUBLIC', p.policyname, p.tablename);
  END LOOP;
END $$;
