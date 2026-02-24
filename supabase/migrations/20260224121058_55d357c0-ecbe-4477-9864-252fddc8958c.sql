DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;

CREATE POLICY "Users can update own presence"
  ON public.user_presence
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);