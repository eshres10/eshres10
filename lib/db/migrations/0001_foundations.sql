-- Phase 0 foundations: public profile fields, upload ownership, and row-level
-- security for every user-owned table. Additive only.

-- Public identity. Handles are chosen by the user, stored lowercase, unique
-- ignoring case. Reserved words are enforced by the API.
ALTER TABLE sewspace_profiles ADD COLUMN IF NOT EXISTS "handle" text;
ALTER TABLE sewspace_profiles ADD COLUMN IF NOT EXISTS "bio" text NOT NULL DEFAULT '';
ALTER TABLE sewspace_profiles ADD COLUMN IF NOT EXISTS "avatar_url" text;
-- (Guarded so the migration can be re-applied after the emergency rollback.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sewspace_profiles_handle_format') THEN
    ALTER TABLE sewspace_profiles ADD CONSTRAINT sewspace_profiles_handle_format
      CHECK (handle IS NULL OR handle ~ '^[a-z0-9_.]{3,30}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sewspace_profiles_bio_length') THEN
    ALTER TABLE sewspace_profiles ADD CONSTRAINT sewspace_profiles_bio_length
      CHECK (char_length(bio) <= 500);
  END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS sewspace_profiles_handle_lower_idx
  ON sewspace_profiles (lower(handle)) WHERE handle IS NOT NULL;

-- Row-level security.
--
-- The API connects as the database owner but runs each request in a transaction
-- that switches to the sewspace_app role (SET LOCAL ROLE) and records the caller
-- in the app.user_id setting. sewspace_app is not the table owner, so these
-- policies always apply to app queries. Migrations run as the owner and are not
-- affected.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sewspace_app') THEN
    CREATE ROLE sewspace_app NOLOGIN;
  END IF;
END
$$;

GRANT sewspace_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO sewspace_app;

-- The signed-in Clerk user id for this transaction, or NULL when signed out.
CREATE OR REPLACE FUNCTION sewspace_current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

GRANT EXECUTE ON FUNCTION sewspace_current_user_id() TO sewspace_app;

-- Uploaded objects and who owns them. The storage route serves an object only
-- when this table (under RLS) says the caller may see it.
CREATE TABLE IF NOT EXISTS "sewspace_uploads" (
  "object_path" text PRIMARY KEY,
  "user_id" varchar(255) NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL DEFAULT 0,
  "purpose" text NOT NULL DEFAULT 'image'
    CHECK (purpose IN ('image', 'avatar', 'pattern_pdf', 'visualization', 'unknown')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sewspace_uploads_user_id_idx" ON "sewspace_uploads" ("user_id");

-- Register files that existing rows already point at, so owners keep access.
INSERT INTO sewspace_uploads (object_path, user_id, content_type, purpose)
SELECT DISTINCT ON (path) path, user_id, 'unknown', purpose FROM (
  SELECT substring(image_url FROM '^/api/storage(/objects/.+)$') AS path, user_id, 'image' AS purpose FROM sewspace_fabrics
  UNION ALL SELECT substring(image_url FROM '^/api/storage(/objects/.+)$'), user_id, 'image' FROM sewspace_threads
  UNION ALL SELECT substring(cover_image_url FROM '^/api/storage(/objects/.+)$'), user_id, 'image' FROM sewspace_patterns
  UNION ALL SELECT substring(pdf_url FROM '^/api/storage(/objects/.+)$'), user_id, 'pattern_pdf' FROM sewspace_patterns
  UNION ALL SELECT substring(cover_image_url FROM '^/api/storage(/objects/.+)$'), user_id, 'image' FROM sewspace_projects
  UNION ALL SELECT substring(url FROM '^/api/storage(/objects/.+)$'), user_id, 'image' FROM sewspace_project_photos
) refs
WHERE path IS NOT NULL
ORDER BY path
ON CONFLICT (object_path) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  sewspace_profiles, sewspace_fabrics, sewspace_threads, sewspace_patterns,
  sewspace_measurement_profiles, sewspace_projects, sewspace_project_steps,
  sewspace_project_photos, sewspace_uploads
  TO sewspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sewspace_app;

ALTER TABLE sewspace_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_measurement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_project_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sewspace_uploads ENABLE ROW LEVEL SECURITY;

-- Phase 0: everything is private to its owner. Later migrations add public and
-- followers-only read policies alongside these.
CREATE POLICY owner_all ON sewspace_profiles TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY owner_all ON sewspace_fabrics TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY owner_all ON sewspace_threads TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY owner_all ON sewspace_patterns TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY owner_all ON sewspace_measurement_profiles TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
CREATE POLICY owner_all ON sewspace_uploads TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());

-- A project may only link the owner's own pattern, fabric, thread and
-- measurements. The subqueries run under RLS, so other people's rows are
-- invisible and fail the check.
CREATE POLICY owner_all ON sewspace_projects TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND (pattern_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_patterns p WHERE p.id = pattern_id))
    AND (fabric_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_fabrics f WHERE f.id = fabric_id))
    AND (thread_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_threads t WHERE t.id = thread_id))
    AND (measurement_profile_id IS NULL OR EXISTS (SELECT 1 FROM sewspace_measurement_profiles m WHERE m.id = measurement_profile_id))
  );

-- Steps and photos must belong to a project the caller owns.
CREATE POLICY owner_all ON sewspace_project_steps TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id)
  );
CREATE POLICY owner_all ON sewspace_project_photos TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (
    user_id = sewspace_current_user_id()
    AND EXISTS (SELECT 1 FROM sewspace_projects p WHERE p.id = project_id)
  );

-- Public profile fields, readable by anyone (including signed-out visitors).
-- The view runs with its owner's rights, so it bypasses the owner-only policy
-- on sewspace_profiles; that is why it lists safe columns only. Units,
-- experience and favourite garments stay private.
CREATE OR REPLACE VIEW sewspace_public_profiles WITH (security_barrier) AS
  SELECT user_id, handle, name, bio, avatar_url, created_at
  FROM sewspace_profiles
  WHERE handle IS NOT NULL;
GRANT SELECT ON sewspace_public_profiles TO sewspace_app;

-- True when the object is the avatar of a profile with a handle. Only uploads
-- registered with purpose 'avatar' qualify, so PDFs and visualisations can never
-- become public this way.
CREATE OR REPLACE FUNCTION sewspace_is_public_avatar(path text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM sewspace_profiles p
      JOIN sewspace_uploads u ON u.object_path = path AND u.user_id = p.user_id
      WHERE p.handle IS NOT NULL
        AND u.purpose = 'avatar'
        AND p.avatar_url = '/api/storage' || path
    )
  $$;
REVOKE ALL ON FUNCTION sewspace_is_public_avatar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sewspace_is_public_avatar(text) TO sewspace_app;

CREATE POLICY public_avatar_read ON sewspace_uploads FOR SELECT TO sewspace_app
  USING (sewspace_is_public_avatar(object_path));
