-- Adicionar configurações de fallback para IA
INSERT INTO system_config (id, value, description) VALUES 
  ('fallback_ai_provider', '"lovable"', 'Provider de IA secundário (fallback)')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO system_config (id, value, description) VALUES 
  ('fallback_ai_model', '"google/gemini-2.5-flash"', 'Modelo de IA secundário (fallback)')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;