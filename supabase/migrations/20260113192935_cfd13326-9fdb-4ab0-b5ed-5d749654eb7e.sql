-- Create backend_logs table for centralized edge function logging
CREATE TABLE IF NOT EXISTS public.backend_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  job_id UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_backend_logs_job_id ON public.backend_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_backend_logs_created_at ON public.backend_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backend_logs_level ON public.backend_logs(level);
CREATE INDEX IF NOT EXISTS idx_backend_logs_function_name ON public.backend_logs(function_name);

-- Enable RLS
ALTER TABLE public.backend_logs ENABLE ROW LEVEL SECURITY;

-- Developers can view all logs
CREATE POLICY "Developers can view all backend_logs" ON public.backend_logs 
  FOR SELECT USING (is_developer());

-- Developers can delete logs
CREATE POLICY "Developers can delete backend_logs" ON public.backend_logs 
  FOR DELETE USING (is_developer());

-- Service role can insert logs (edge functions)
CREATE POLICY "Service role can insert backend_logs" ON public.backend_logs
  FOR INSERT WITH CHECK (true);

-- Auto-cleanup: Delete logs older than 30 days (optional trigger)
-- This is just a comment for reference - could be implemented via scheduled function