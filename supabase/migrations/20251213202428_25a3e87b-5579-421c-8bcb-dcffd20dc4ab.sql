-- Criar função RPC para buscar email pelo user_id
CREATE OR REPLACE FUNCTION public.get_email_by_user_id(p_user_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE UPPER(user_id) = UPPER(p_user_id);
  
  RETURN v_email;
END;
$$;

-- Permitir que qualquer usuário (mesmo não autenticado) possa chamar esta função
GRANT EXECUTE ON FUNCTION public.get_email_by_user_id(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_user_id(TEXT) TO authenticated;