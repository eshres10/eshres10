-- Phase O: sign-up and onboarding with Pip. Additive: one new table and one
-- new profile column.
--
-- sewspace_onboarding holds a person's answers to Pip's questions and where
-- they got to. Always private to its owner: no visibility setting, no public
-- API, owner_all is the only policy. Allowed values match the options in
-- docs/design/onboarding (and the API's enums).
CREATE TABLE IF NOT EXISTS sewspace_onboarding (
  user_id varchar(255) PRIMARY KEY REFERENCES sewspace_profiles(user_id) ON DELETE CASCADE,
  -- 0 = Meet Pip, 1-7 = the questions, 8 = finished (Ready).
  current_step smallint NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 8),
  goals text[] NOT NULL DEFAULT '{}' CHECK (
    goals <@ ARRAY['stash', 'idea', 'learn', 'share', 'challenges', 'sell']::text[]
    AND cardinality(goals) <= 6 AND array_position(goals, NULL) IS NULL
  ),
  experience text CHECK (experience IN ('start', 'couple', 'years', 'pro')),
  tools text[] NOT NULL DEFAULT '{}' CHECK (
    tools <@ ARRAY['machine', 'overlocker', 'cover', 'embroidery', 'hand']::text[]
    AND cardinality(tools) <= 5 AND array_position(tools, NULL) IS NULL
  ),
  stash_size text CHECK (stash_size IN ('start', 'drawer', 'cupboard', 'secret')),
  completed_at timestamp with time zone,
  skipped_at timestamp with time zone,
  -- Rate limit for the write endpoints (120 an hour): writes in the current window.
  write_count integer NOT NULL DEFAULT 0 CHECK (write_count >= 0),
  write_window_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE sewspace_onboarding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_all ON sewspace_onboarding;
CREATE POLICY owner_all ON sewspace_onboarding TO sewspace_app
  USING (user_id = sewspace_current_user_id())
  WITH CHECK (user_id = sewspace_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON sewspace_onboarding TO sewspace_app;

-- Who new posts are shared with by default (Pip's question 7; the composer
-- preselects it). A preference, not a row's visibility, so it starts as
-- 'public' like the composer did before. Private to the owner: profiles are
-- owner_all, and sewspace_public_profiles lists its columns explicitly.
ALTER TABLE sewspace_profiles ADD COLUMN IF NOT EXISTS default_post_visibility text NOT NULL DEFAULT 'public'
  CHECK (default_post_visibility IN ('public', 'followers', 'private'));
