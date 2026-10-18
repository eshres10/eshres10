-- The colour of a status (words) post's card (owner, October 2026: pick one
-- of five brand colours when posting a status). Additive only: one column,
-- yellow for every existing post (the colour words cards already had). It
-- follows its post (same visibility, same RLS); only the author writes it.
ALTER TABLE sewspace_posts ADD COLUMN IF NOT EXISTS card_color text NOT NULL DEFAULT 'yellow'
  CHECK (card_color IN ('yellow', 'red', 'blue', 'peach', 'black'));
