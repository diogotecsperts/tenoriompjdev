-- Update RPC function to fetch email from auth.users (fonte oficial)
CREATE OR REPLACE FUNCTION public.get_email_by_user_id(p_user_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email TEXT;
  v_profile_id UUID;
BEGIN
  -- Primeiro, buscar o profile id pelo user_id
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE UPPER(user_id) = UPPER(p_user_id);
  
  IF v_profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Buscar o email diretamente do auth.users (fonte oficial)
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_profile_id;
  
  RETURN v_email;
END;
$$;