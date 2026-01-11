-- Criar tabela para API keys globais dos providers de IA
CREATE TABLE IF NOT EXISTS public.global_api_keys (
  id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.global_api_keys ENABLE ROW LEVEL SECURITY;

-- Política para developers gerenciarem API keys globais
CREATE POLICY "Developers can manage global api keys"
  ON public.global_api_keys
  FOR ALL
  TO authenticated
  USING (public.is_developer())
  WITH CHECK (public.is_developer());

-- Trigger para updated_at
CREATE TRIGGER set_global_api_keys_updated_at
  BEFORE UPDATE ON public.global_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();