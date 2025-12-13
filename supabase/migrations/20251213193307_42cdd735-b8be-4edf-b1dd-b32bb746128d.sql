-- Criar bucket para armazenar PDFs dos processos
INSERT INTO storage.buckets (id, name, public)
VALUES ('processos-pdf', 'processos-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Política para usuários autenticados fazerem upload
CREATE POLICY "Users can upload their own PDFs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'processos-pdf' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para usuários verem seus próprios PDFs
CREATE POLICY "Users can view their own PDFs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'processos-pdf' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para usuários deletarem seus próprios PDFs
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'processos-pdf' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);