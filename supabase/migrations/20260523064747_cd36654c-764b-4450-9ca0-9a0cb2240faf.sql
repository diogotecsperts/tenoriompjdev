
-- 1. Enum de módulos
CREATE TYPE public.app_module AS ENUM ('trabalhista', 'previdenciario');

-- 2. Tabela user_modules
CREATE TABLE public.user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module public.app_module NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module)
);

CREATE INDEX idx_user_modules_user ON public.user_modules(user_id);

ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER trg_user_modules_updated_at
  BEFORE UPDATE ON public.user_modules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Função has_module (SECURITY DEFINER, evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_module(_user_id uuid, _module public.app_module)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_modules
    WHERE user_id = _user_id AND module = _module AND enabled = true
  )
$$;

-- 4. RLS policies
CREATE POLICY "Users can view own modules"
  ON public.user_modules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Developers can view all modules"
  ON public.user_modules FOR SELECT
  TO authenticated
  USING (public.is_developer());

CREATE POLICY "Developers can insert modules"
  ON public.user_modules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_developer());

CREATE POLICY "Developers can update modules"
  ON public.user_modules FOR UPDATE
  TO authenticated
  USING (public.is_developer());

CREATE POLICY "Developers can delete modules"
  ON public.user_modules FOR DELETE
  TO authenticated
  USING (public.is_developer());

CREATE POLICY "Admins can manage all modules"
  ON public.user_modules FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Coluna tipo_laudo em laudos (default seguro = trabalhista)
ALTER TABLE public.laudos
  ADD COLUMN tipo_laudo public.app_module NOT NULL DEFAULT 'trabalhista';

CREATE INDEX idx_laudos_user_tipo ON public.laudos(user_id, tipo_laudo);

-- 6. Backfill: dar trabalhista a todos os usuários existentes
INSERT INTO public.user_modules (user_id, module, enabled)
SELECT id, 'trabalhista'::public.app_module, true FROM public.profiles
ON CONFLICT (user_id, module) DO NOTHING;

-- 7. Atualizar handle_new_user para dar trabalhista automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  new_user_id TEXT;
BEGIN
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

  -- Novo: dar acesso ao módulo Trabalhista por padrão
  INSERT INTO public.user_modules (user_id, module, enabled)
  VALUES (NEW.id, 'trabalhista'::public.app_module, true)
  ON CONFLICT (user_id, module) DO NOTHING;

  RETURN NEW;
END;
$function$;
