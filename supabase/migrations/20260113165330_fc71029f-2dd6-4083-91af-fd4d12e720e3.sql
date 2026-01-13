-- Tabela de preços por modelo de IA
CREATE TABLE model_pricing (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  input_price_per_million DECIMAL(10,6) NOT NULL,
  output_price_per_million DECIMAL(10,6) NOT NULL,
  display_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Preços aproximados (Janeiro 2026)
INSERT INTO model_pricing VALUES
  ('gemini-2.5-flash', 'gemini', 0.10, 0.40, 'Gemini 2.5 Flash', now()),
  ('gemini-2.5-pro', 'gemini', 2.50, 10.00, 'Gemini 2.5 Pro', now()),
  ('google/gemini-2.5-flash', 'openrouter', 0.10, 0.40, 'Gemini 2.5 Flash (OR)', now()),
  ('google/gemini-2.5-pro', 'openrouter', 2.50, 10.00, 'Gemini 2.5 Pro (OR)', now()),
  ('google/gemini-3-pro-preview', 'openrouter', 2.00, 8.00, 'Gemini 3 Pro Preview', now()),
  ('google/gemini-3-flash-preview', 'openrouter', 0.15, 0.60, 'Gemini 3 Flash Preview', now()),
  ('anthropic/claude-3.5-sonnet', 'openrouter', 3.00, 15.00, 'Claude 3.5 Sonnet', now()),
  ('meta-llama/llama-3.3-70b-instruct', 'openrouter', 0.30, 0.60, 'Llama 3.3 70B', now()),
  ('qwen/qwen-turbo', 'openrouter', 0.10, 0.30, 'Qwen Turbo', now()),
  ('google/gemini-2.5-flash-preview', 'lovable', 0.10, 0.40, 'Gemini 2.5 Flash (Lovable)', now()),
  ('google/gemini-2.5-pro-preview', 'lovable', 2.50, 10.00, 'Gemini 2.5 Pro (Lovable)', now());

ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage pricing"
  ON model_pricing FOR ALL
  USING (is_developer());