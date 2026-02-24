CREATE POLICY "Users can view own presence"
  ON public.user_presence
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);