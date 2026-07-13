
-- Remover configurações fantasmas apontando para OpenRouter que nunca foram escolhidas explicitamente pelo usuário no DevPanel.
-- Substituir por Lovable AI Gateway (gerenciado, sem custo escondido de OpenRouter).
UPDATE public.system_config
  SET value = to_jsonb('lovable'::text), updated_at = now()
  WHERE id = 'text_fill_provider' AND value::text = '"openrouter"';

UPDATE public.system_config
  SET value = to_jsonb('google/gemini-2.5-flash'::text), updated_at = now()
  WHERE id = 'text_fill_model' AND value::text = '"google/gemini-3-flash-preview"';

UPDATE public.system_config
  SET value = to_jsonb('lovable'::text), updated_at = now()
  WHERE id = 'fallback_ai_provider' AND value::text = '"openrouter"';

UPDATE public.system_config
  SET value = to_jsonb('google/gemini-2.5-flash'::text), updated_at = now()
  WHERE id = 'fallback_ai_model' AND value::text = '"google/gemini-3-flash-preview"';
