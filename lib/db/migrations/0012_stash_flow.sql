-- Phase F3: Add to stash. Additive only.

-- A fabric's colour as picked from a swatch (photo or palette), next to the
-- existing colour name. Only a hex value; never typed by hand.
ALTER TABLE sewspace_fabrics ADD COLUMN IF NOT EXISTS color_hex text
  CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9a-f]{6}$');

-- How the pattern is kept: a PDF, a paper pattern, or a traced copy.
ALTER TABLE sewspace_patterns ADD COLUMN IF NOT EXISTS format text
  CHECK (format IS NULL OR format IN ('pdf', 'paper', 'traced'));

-- RLS: the existing policies on both tables cover the new columns.
