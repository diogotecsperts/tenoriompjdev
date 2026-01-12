-- Add ai_metadata column to store AI usage information per laudo
ALTER TABLE public.laudos 
ADD COLUMN ai_metadata JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.laudos.ai_metadata IS 'Stores AI usage metadata from import process: providers, models, and processing times';