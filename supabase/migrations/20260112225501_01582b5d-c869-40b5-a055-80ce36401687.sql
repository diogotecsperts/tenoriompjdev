-- Adicionar coluna de observações para ajudar a identificar laudos
ALTER TABLE public.laudos 
ADD COLUMN IF NOT EXISTS observacoes_historico TEXT DEFAULT '';

-- Comentário para documentação
COMMENT ON COLUMN public.laudos.observacoes_historico IS 'Observações pessoais para identificar/diferenciar laudos no histórico';