-- RLS policies para permitir developers deletarem dados de usuários
-- (apenas as que ainda não existem)

-- Policy para developers deletarem profiles
CREATE POLICY "Developers can delete profiles"
ON public.profiles
FOR DELETE
USING (is_developer());

-- Policy para developers deletarem financeiro
CREATE POLICY "Developers can delete financeiro"
ON public.financeiro
FOR DELETE
USING (is_developer());

-- Policy para developers deletarem impugnacoes
CREATE POLICY "Developers can delete impugnacoes"
ON public.impugnacoes
FOR DELETE
USING (is_developer());

-- Policy para developers deletarem laudos
CREATE POLICY "Developers can delete laudos"
ON public.laudos
FOR DELETE
USING (is_developer());

-- Policy para developers deletarem modelos_laudo
CREATE POLICY "Developers can delete modelos_laudo"
ON public.modelos_laudo
FOR DELETE
USING (is_developer());

-- Policy para developers deletarem ai_usage_logs
CREATE POLICY "Developers can delete ai_usage_logs"
ON public.ai_usage_logs
FOR DELETE
USING (is_developer());

-- Policy para developers deletarem import_jobs
CREATE POLICY "Developers can delete import_jobs"
ON public.import_jobs
FOR DELETE
USING (is_developer());