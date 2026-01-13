-- Add step_id column to import_jobs for step-by-step progress tracking
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS step_id TEXT DEFAULT NULL;