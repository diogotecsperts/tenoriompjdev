-- Fase 1B: Criar tabelas e funções para DevPanel

-- 1.2 Tabela user_settings - Configurações individuais por médico
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  -- Configurações de IA
  ai_provider TEXT DEFAULT 'lovable',
  ai_model TEXT DEFAULT 'google/gemini-3-flash-preview',
  ai_temperature NUMERIC(3,2) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 4096,
  -- Chave API customizada (para providers externos)
  custom_api_key TEXT,
  -- Limites e cotas
  monthly_ai_limit INTEGER DEFAULT 100,
  ai_requests_used INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  -- Feature flags
  features_enabled JSONB DEFAULT '{"importar_autos": true, "gerar_resumos": true, "assistente_ia": true}'::jsonb,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 Tabela ai_usage_logs - Logs de uso de IA
CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_type TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  latency_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance em ai_usage_logs
CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs(provider);

-- 1.4 Tabela system_config - Configurações globais do sistema
CREATE TABLE public.system_config (
  id TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Valores iniciais do sistema
INSERT INTO public.system_config (id, value, description) VALUES
('default_ai_provider', '"lovable"', 'Provider padrão para novos usuários'),
('default_ai_model', '"google/gemini-3-flash-preview"', 'Modelo padrão'),
('maintenance_mode', 'false', 'Modo de manutenção ativo'),
('max_pdf_size_mb', '50', 'Tamanho máximo de PDF em MB'),
('allowed_ai_providers', '["lovable", "openai", "gemini", "claude", "groq", "deepseek", "openrouter"]', 'Providers disponíveis');

-- 1.5 Função is_developer() - Security definer
CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'developer'
  )
$$;

-- 1.6 Trigger para atualizar updated_at em user_settings
CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 1.7 Habilitar RLS em todas as novas tabelas
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- 1.8 RLS Policies para user_settings
CREATE POLICY "Developers can view all user_settings"
ON public.user_settings FOR SELECT USING (is_developer());

CREATE POLICY "Developers can update all user_settings"
ON public.user_settings FOR UPDATE USING (is_developer());

CREATE POLICY "Developers can insert user_settings"
ON public.user_settings FOR INSERT WITH CHECK (is_developer());

CREATE POLICY "Developers can delete user_settings"
ON public.user_settings FOR DELETE USING (is_developer());

CREATE POLICY "Users can view own user_settings"
ON public.user_settings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own user_settings"
ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- 1.9 RLS Policies para ai_usage_logs
CREATE POLICY "Developers can view all ai_usage_logs"
ON public.ai_usage_logs FOR SELECT USING (is_developer());

CREATE POLICY "Developers can insert ai_usage_logs"
ON public.ai_usage_logs FOR INSERT WITH CHECK (is_developer());

CREATE POLICY "Users can view own ai_usage_logs"
ON public.ai_usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can insert ai_usage_logs"
ON public.ai_usage_logs FOR INSERT WITH CHECK (true);

-- 1.10 RLS Policies para system_config
CREATE POLICY "Developers can view system_config"
ON public.system_config FOR SELECT USING (is_developer());

CREATE POLICY "Developers can update system_config"
ON public.system_config FOR UPDATE USING (is_developer());

CREATE POLICY "Developers can insert system_config"
ON public.system_config FOR INSERT WITH CHECK (is_developer());

CREATE POLICY "Admins can view system_config"
ON public.system_config FOR SELECT USING (is_admin());

-- 1.11 Função para criar user_settings automaticamente para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger para criar settings quando um novo usuário é criado
CREATE TRIGGER on_auth_user_created_settings
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_settings();