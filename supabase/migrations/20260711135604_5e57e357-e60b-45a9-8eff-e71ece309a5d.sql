CREATE TABLE public.prev_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pericia_id uuid NOT NULL REFERENCES public.prev_pericias(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  provider text,
  model text,
  error_code text,
  error_message text,
  technical_detail text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

GRANT SELECT ON public.prev_processing_jobs TO authenticated;
GRANT ALL ON public.prev_processing_jobs TO service_role;

ALTER TABLE public.prev_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prev processing jobs"
ON public.prev_processing_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_prev_processing_jobs_pericia_id ON public.prev_processing_jobs(pericia_id);
CREATE INDEX idx_prev_processing_jobs_user_created ON public.prev_processing_jobs(user_id, created_at DESC);
CREATE INDEX idx_prev_processing_jobs_status ON public.prev_processing_jobs(status);

CREATE TRIGGER update_prev_processing_jobs_updated_at
BEFORE UPDATE ON public.prev_processing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();