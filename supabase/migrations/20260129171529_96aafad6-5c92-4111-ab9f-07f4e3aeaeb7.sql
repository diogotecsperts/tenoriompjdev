-- Permitir que todos os usuários autenticados leiam as configurações do sistema
-- Isso garante que configurações do DevPanel (limite de PDF, modelo IA, etc.)
-- sejam aplicadas a TODOS os usuários, não apenas developers/admins

CREATE POLICY "Authenticated users can read system_config"
  ON public.system_config
  FOR SELECT
  TO authenticated
  USING (true);