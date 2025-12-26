-- Adicionar novos campos para o laudo completo
ALTER TABLE public.laudos
ADD COLUMN IF NOT EXISTS diagnostico_cids jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS fatores_individuais text DEFAULT ''::text,
ADD COLUMN IF NOT EXISTS atestados_detalhados jsonb DEFAULT '[]'::jsonb;