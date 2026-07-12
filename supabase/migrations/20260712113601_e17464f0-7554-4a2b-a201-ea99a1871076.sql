ALTER TABLE public.signup_requests DROP CONSTRAINT IF EXISTS signup_requests_status_check;
ALTER TABLE public.signup_requests ADD CONSTRAINT signup_requests_status_check CHECK (status IN ('pending','approved','awaiting_finalization','completed','rejected','cancelled'));
ALTER TABLE public.signup_requests ADD COLUMN IF NOT EXISTS finalized_at timestamptz;