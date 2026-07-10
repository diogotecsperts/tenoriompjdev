ALTER TABLE public.email_login_events ADD COLUMN IF NOT EXISTS impersonated_by uuid NULL;
CREATE INDEX IF NOT EXISTS idx_email_login_events_impersonated_by ON public.email_login_events(impersonated_by) WHERE impersonated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_logs_event_type ON public.access_logs(event_type);