
-- Tabela de logs de acesso (logins)
CREATE TABLE public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL DEFAULT 'login',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can view access_logs"
  ON public.access_logs FOR SELECT
  USING (is_developer());

CREATE POLICY "Authenticated can insert own access_logs"
  ON public.access_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Developers can delete access_logs"
  ON public.access_logs FOR DELETE
  USING (is_developer());

-- Tabela de presença (heartbeat)
CREATE TABLE public.user_presence (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz DEFAULT now(),
  is_online boolean DEFAULT true
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can view presence"
  ON public.user_presence FOR SELECT
  USING (is_developer());

CREATE POLICY "Users can upsert own presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
  ON public.user_presence FOR UPDATE
  USING (auth.uid() = user_id);
