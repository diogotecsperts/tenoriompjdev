
INSERT INTO public.system_config (id, value, description) VALUES
  ('ocr_fallback_enabled', 'false'::jsonb,
   'Master switch do fallback de OCR. Quando false, nenhum provider de OCR é chamado como fallback — se o primário falhar, o job falha. Alterar apenas via DevPanel.'),
  ('ocr_fallback_provider', '"none"'::jsonb,
   'Provider a ser usado como fallback quando o master switch está ligado. Valores válidos: none, gemini, mistral, minimax. Default "none" garante que nenhum provider é acionado sem escolha explícita.'),
  ('ocr_fallback_on_size_exceeded', 'false'::jsonb,
   'Se true, quando o provider primário rejeita por tamanho (ex.: Mistral > 50 MB), tenta o fallback configurado. Default false: o job falha com o erro nativo do primário.')
ON CONFLICT (id) DO NOTHING;
