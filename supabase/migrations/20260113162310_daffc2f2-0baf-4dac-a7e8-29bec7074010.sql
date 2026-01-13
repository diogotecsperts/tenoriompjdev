-- Adicionar configuração de provider e modelo para PDF
INSERT INTO system_config (id, value, description, updated_at)
VALUES 
  ('pdf_ai_provider', '"openrouter"', 'Provider de IA para processamento de PDF (openrouter, gemini, lovable)', now()),
  ('pdf_ai_model', '"google/gemini-2.5-flash"', 'Modelo de IA para processamento de PDF via OpenRouter', now())
ON CONFLICT (id) DO NOTHING;