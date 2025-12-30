-- Tabela para rastrear jobs de importação de PDF
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  progress INTEGER NOT NULL DEFAULT 0,
  current_step TEXT DEFAULT 'Iniciando processamento...',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para queries rápidas
CREATE INDEX idx_import_jobs_user_status ON public.import_jobs(user_id, status);

-- Habilitar RLS
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - usuários só veem seus próprios jobs
CREATE POLICY "Users can view own import_jobs"
ON public.import_jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own import_jobs"
ON public.import_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own import_jobs"
ON public.import_jobs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own import_jobs"
ON public.import_jobs FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_import_jobs_updated_at
BEFORE UPDATE ON public.import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();