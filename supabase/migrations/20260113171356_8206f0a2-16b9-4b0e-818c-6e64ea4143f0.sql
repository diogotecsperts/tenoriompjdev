-- Adicionar campos para rastrear retries em ai_usage_logs
ALTER TABLE ai_usage_logs 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

ALTER TABLE ai_usage_logs 
ADD COLUMN IF NOT EXISTS used_fallback BOOLEAN DEFAULT FALSE;

-- Adicionar índice para consultas de estatísticas de retry
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_retry_count 
ON ai_usage_logs(retry_count) WHERE retry_count > 0;

-- Adicionar índice para consultas de fallback
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_used_fallback 
ON ai_usage_logs(used_fallback) WHERE used_fallback = TRUE;