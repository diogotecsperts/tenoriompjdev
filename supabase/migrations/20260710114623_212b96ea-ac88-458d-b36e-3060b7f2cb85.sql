
-- 1) email_tracking_config
CREATE TABLE public.email_tracking_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT false,
  recipient_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notify_on_login BOOLEAN NOT NULL DEFAULT true,
  notify_on_pdf_error BOOLEAN NOT NULL DEFAULT true,
  notify_daily_summary BOOLEAN NOT NULL DEFAULT true,
  daily_summary_hour INT NOT NULL DEFAULT 23 CHECK (daily_summary_hour BETWEEN 0 AND 23),
  daily_summary_minute INT NOT NULL DEFAULT 30 CHECK (daily_summary_minute BETWEEN 0 AND 59),
  last_daily_sent_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_tracking_config TO authenticated;
GRANT ALL ON public.email_tracking_config TO service_role;

ALTER TABLE public.email_tracking_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can read email tracking config"
ON public.email_tracking_config FOR SELECT
TO authenticated
USING (public.is_developer());

CREATE POLICY "Developers can insert email tracking config"
ON public.email_tracking_config FOR INSERT
TO authenticated
WITH CHECK (public.is_developer());

CREATE POLICY "Developers can update email tracking config"
ON public.email_tracking_config FOR UPDATE
TO authenticated
USING (public.is_developer())
WITH CHECK (public.is_developer());

CREATE TRIGGER update_email_tracking_config_updated_at
BEFORE UPDATE ON public.email_tracking_config
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed da linha default
INSERT INTO public.email_tracking_config (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- 2) email_login_events
CREATE TABLE public.email_login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_login_events_user_time ON public.email_login_events(user_id, notified_at DESC);

GRANT SELECT, INSERT ON public.email_login_events TO authenticated;
GRANT ALL ON public.email_login_events TO service_role;

ALTER TABLE public.email_login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own login events"
ON public.email_login_events FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own login events"
ON public.email_login_events FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_developer());

-- 3) email_tracking_log
CREATE TABLE public.email_tracking_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  subject TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_tracking_log_sent_at ON public.email_tracking_log(sent_at DESC);

GRANT SELECT ON public.email_tracking_log TO authenticated;
GRANT ALL ON public.email_tracking_log TO service_role;

ALTER TABLE public.email_tracking_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can read email tracking log"
ON public.email_tracking_log FOR SELECT
TO authenticated
USING (public.is_developer());
