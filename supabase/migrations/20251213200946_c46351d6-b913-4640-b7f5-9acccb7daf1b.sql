-- Adicionar coluna user_id única na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_id TEXT UNIQUE;

-- Criar índice para buscas rápidas por user_id
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- Definir ID para usuários existentes que não têm user_id
UPDATE public.profiles 
SET user_id = 'MED' || LPAD(ROW_NUMBER::TEXT, 3, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as ROW_NUMBER
  FROM public.profiles
  WHERE user_id IS NULL
) sub
WHERE profiles.id = sub.id;

-- Atualizar a função handle_new_user para gerar ID sequencial automático
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public 
AS $$
DECLARE
  next_number INTEGER;
  new_user_id TEXT;
BEGIN
  -- Gerar próximo número sequencial baseado no maior existente
  SELECT COALESCE(MAX(CAST(SUBSTRING(user_id FROM 4) AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.profiles
  WHERE user_id LIKE 'MED%';
  
  new_user_id := 'MED' || LPAD(next_number::TEXT, 3, '0');
  
  INSERT INTO public.profiles (id, nome, email, user_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    new_user_id
  );
  RETURN NEW;
END;
$$;