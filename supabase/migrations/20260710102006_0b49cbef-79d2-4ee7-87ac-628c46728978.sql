
-- 1) Campos de bloqueio por módulo/usuário
ALTER TABLE public.user_modules
  ADD COLUMN IF NOT EXISTS block_mode text,
  ADD COLUMN IF NOT EXISTS block_message text;

ALTER TABLE public.user_modules
  DROP CONSTRAINT IF EXISTS user_modules_block_mode_check;

ALTER TABLE public.user_modules
  ADD CONSTRAINT user_modules_block_mode_check
  CHECK (block_mode IS NULL OR block_mode IN ('notice','blocked'));

-- 2) Preferências de UI do DevPanel (filtros persistentes)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS dev_ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
