-- Add a free-form campaign notes column (presentation metadata, like bio).
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS notes text;
