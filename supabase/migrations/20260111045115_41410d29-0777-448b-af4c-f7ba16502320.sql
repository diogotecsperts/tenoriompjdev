-- Tabela para armazenar logs de erros do frontend
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  component_stack TEXT,
  url TEXT NOT NULL,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX idx_error_logs_user_id ON public.error_logs(user_id);
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_error_type ON public.error_logs(error_type);

-- Habilitar RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode inserir logs (mesmo anônimos)
CREATE POLICY "Anyone can insert error logs"
  ON public.error_logs FOR INSERT
  WITH CHECK (true);

-- Developers podem ver todos os logs
CREATE POLICY "Developers can view all error logs"
  ON public.error_logs FOR SELECT
  USING (public.is_developer());

-- Developers podem deletar logs
CREATE POLICY "Developers can delete error logs"
  ON public.error_logs FOR DELETE
  USING (public.is_developer());