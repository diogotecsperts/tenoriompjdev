-- 1. Inserir role 'user' para usuarios existentes sem role
INSERT INTO user_roles (user_id, role)
SELECT p.id, 'user'
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
WHERE ur.id IS NULL;

-- 2. Criar user_settings para usuarios existentes que não possuem
INSERT INTO user_settings (user_id)
SELECT p.id
FROM profiles p
LEFT JOIN user_settings us ON p.id = us.user_id
WHERE us.id IS NULL;

-- 3. Adicionar constraint unique para evitar roles duplicadas (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_role_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
END $$;

-- 4. Função para adicionar developer automaticamente ao email específico
CREATE OR REPLACE FUNCTION public.handle_developer_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Adicionar role developer para email específico
  IF NEW.email = 'diogomixcds@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'developer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Trigger que executa após criação de usuário no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_developer ON auth.users;
CREATE TRIGGER on_auth_user_created_developer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_developer_email();

-- 6. Adicionar policies para developers gerenciarem roles
DROP POLICY IF EXISTS "Developers can insert roles" ON public.user_roles;
CREATE POLICY "Developers can insert roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (is_developer());

DROP POLICY IF EXISTS "Developers can delete roles" ON public.user_roles;
CREATE POLICY "Developers can delete roles" 
ON public.user_roles 
FOR DELETE 
USING (is_developer());

DROP POLICY IF EXISTS "Developers can view all roles" ON public.user_roles;
CREATE POLICY "Developers can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (is_developer());

DROP POLICY IF EXISTS "Developers can view all profiles" ON public.profiles;
CREATE POLICY "Developers can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (is_developer());