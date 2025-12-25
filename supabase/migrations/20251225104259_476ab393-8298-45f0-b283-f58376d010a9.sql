-- Adicionar campo logo_url à tabela profiles
ALTER TABLE public.profiles ADD COLUMN logo_url TEXT;

-- Criar bucket para logos dos peritos
INSERT INTO storage.buckets (id, name, public)
VALUES ('perito-logos', 'perito-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Política para usuários visualizarem logos públicas
CREATE POLICY "Logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'perito-logos');

-- Política para usuários fazerem upload de sua própria logo
CREATE POLICY "Users can upload their own logo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'perito-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Política para usuários atualizarem sua própria logo
CREATE POLICY "Users can update their own logo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'perito-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Política para usuários deletarem sua própria logo
CREATE POLICY "Users can delete their own logo"
ON storage.objects FOR DELETE
USING (bucket_id = 'perito-logos' AND auth.uid()::text = (storage.foldername(name))[1]);