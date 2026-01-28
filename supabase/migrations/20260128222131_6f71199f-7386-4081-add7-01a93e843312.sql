-- Novas configurações para estratégia de duas fases
INSERT INTO system_config (id, value, description) VALUES
  ('import_strategy', '"two_phase"', 'Estratégia de importação: single_pass ou two_phase'),
  ('text_fill_provider', '"openrouter"', 'Provider para preenchimento de campos (Fase 2)'),
  ('text_fill_model', '"openai/gpt-4o-mini"', 'Modelo para preenchimento de campos'),
  ('store_extracted_text', 'true', 'Armazenar texto extraído para regeneração')
ON CONFLICT (id) DO NOTHING;

-- Garantir bucket existe (bucket processos-pdf já existe mas garantindo)
INSERT INTO storage.buckets (id, name, public)
VALUES ('processos-pdf', 'processos-pdf', false)
ON CONFLICT DO NOTHING;