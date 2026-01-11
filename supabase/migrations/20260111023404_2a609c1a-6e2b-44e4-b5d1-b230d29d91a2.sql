-- Corrigir policy de ai_usage_logs para ser mais segura
DROP POLICY IF EXISTS "Service can insert ai_usage_logs" ON public.ai_usage_logs;

-- Permitir inserção apenas quando o user_id corresponde ao usuário autenticado
CREATE POLICY "Users can insert own ai_usage_logs"
ON public.ai_usage_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);