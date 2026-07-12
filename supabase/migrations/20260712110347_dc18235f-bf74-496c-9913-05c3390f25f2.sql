
CREATE TABLE public.signup_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  login_desejado TEXT,
  email TEXT NOT NULL,
  medico_vinculado TEXT NOT NULL,
  informacoes_adicionais TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  review_notes TEXT,
  invite_sent_at TIMESTAMPTZ,
  invite_user_id UUID
);

CREATE UNIQUE INDEX signup_requests_email_pending_uniq
  ON public.signup_requests (lower(email))
  WHERE status = 'pending';

CREATE INDEX signup_requests_status_created_idx
  ON public.signup_requests (status, created_at DESC);

GRANT INSERT ON public.signup_requests TO anon, authenticated;
GRANT ALL ON public.signup_requests TO service_role;

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer visitante pode criar uma solicitação (é o formulário público).
-- Não há policy de SELECT/UPDATE/DELETE: leitura/gerenciamento passa apenas
-- por edge function service-role, seguindo mem/architecture/dev-access-isolation.md.
CREATE POLICY "Anyone can submit a signup request"
  ON public.signup_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
