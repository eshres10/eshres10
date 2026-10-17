-- Phase F2: create a project in one step, then "Finish setting up".
-- Additive only.

-- The garment being made (optional chip on Quick start).
ALTER TABLE sewspace_projects ADD COLUMN IF NOT EXISTS garment text
  CHECK (garment IS NULL OR char_length(garment) BETWEEN 1 AND 40);

-- Setup checklist state: dismissed, whether "Who can see it" was chosen on
-- purpose, and how steps are tracked (pattern | own | none). Projects that
-- existed before this migration start dismissed, so the checklist only appears
-- on projects made with the new flow; new rows default to an empty object.
ALTER TABLE sewspace_projects ADD COLUMN IF NOT EXISTS setup jsonb NOT NULL DEFAULT '{"dismissed": true}'::jsonb
  CHECK (jsonb_typeof(setup) = 'object' AND octet_length(setup::text) <= 1024);
ALTER TABLE sewspace_projects ALTER COLUMN setup SET DEFAULT '{}'::jsonb;

-- A pattern's construction steps (short phrases), from the PDF reader or typed
-- in. Private like the rest of the pattern row; never sent on public pages.
ALTER TABLE sewspace_patterns ADD COLUMN IF NOT EXISTS steps jsonb
  CHECK (steps IS NULL OR (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 60));

-- RLS: the existing owner_all / visible_read policies on both tables cover the
-- new columns; nothing else changes.
