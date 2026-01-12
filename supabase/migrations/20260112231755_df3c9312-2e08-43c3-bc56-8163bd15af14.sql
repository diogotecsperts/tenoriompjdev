-- Add file_path column to import_jobs for retry functionality
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS file_path TEXT;