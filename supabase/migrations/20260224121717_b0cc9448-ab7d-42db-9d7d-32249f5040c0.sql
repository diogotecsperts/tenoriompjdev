
-- Recriar INSERT como PERMISSIVE
DROP POLICY IF EXISTS "Users can upsert own presence" ON public.user_presence;
CREATE POLICY "Users can upsert own presence"
  ON public.user_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Recriar UPDATE como PERMISSIVE
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;
CREATE POLICY "Users can update own presence"
  ON public.user_presence
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Recriar SELECT (dev) como PERMISSIVE
DROP POLICY IF EXISTS "Developers can view presence" ON public.user_presence;
CREATE POLICY "Developers can view presence"
  ON public.user_presence
  FOR SELECT
  TO authenticated
  USING (is_developer());
