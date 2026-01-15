-- Adicionar coluna resumo_pericia para persistir sugestões de IA
ALTER TABLE public.laudos 
ADD COLUMN IF NOT EXISTS resumo_pericia TEXT DEFAULT '';