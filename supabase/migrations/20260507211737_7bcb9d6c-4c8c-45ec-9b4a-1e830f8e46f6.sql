ALTER TABLE public.laudos
  ADD COLUMN IF NOT EXISTS cids_selecionados jsonb NOT NULL DEFAULT '[]'::jsonb;