-- Tabela para armazenar histórico de tentativas de importação
CREATE TABLE public.import_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'processing',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.import_attempts ENABLE ROW LEVEL SECURITY;

-- Users can view attempts from their own jobs
CREATE POLICY "Users can view attempts from own jobs"
  ON public.import_attempts FOR SELECT
  USING (
    job_id IN (SELECT id FROM public.import_jobs WHERE user_id = auth.uid())
  );

-- Developers can view all attempts
CREATE POLICY "Developers can view all attempts"
  ON public.import_attempts FOR SELECT
  USING (is_developer());

-- Developers can delete attempts
CREATE POLICY "Developers can delete attempts"
  ON public.import_attempts FOR DELETE
  USING (is_developer());

-- Adicionar coluna retry_count ao import_jobs
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;