ALTER TABLE public.prev_pericias
  ADD COLUMN IF NOT EXISTS pdf_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS pdf_pages integer;