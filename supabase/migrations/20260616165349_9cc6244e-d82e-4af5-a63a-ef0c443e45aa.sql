
-- RLS no bucket prev-pdfs: cada usuário só acessa arquivos sob seu próprio user_id (primeira pasta do path)

CREATE POLICY "prev_pdfs_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'prev-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "prev_pdfs_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prev-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "prev_pdfs_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'prev-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "prev_pdfs_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'prev-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
