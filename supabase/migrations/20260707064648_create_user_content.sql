-- Per-user homebrew content (custom feats first; extensible to species/
-- subclass/spell/etc via the `kind` column). Owner-only via RLS.
CREATE TABLE IF NOT EXISTS public.user_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_content_user_kind_idx ON public.user_content (user_id, kind);

ALTER TABLE public.user_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own content"
  ON public.user_content
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
