
-- ============================================================
-- Fase A — Fundação do novo módulo Previdenciário (v2)
-- Tabelas isoladas com prefixo prev_*, sem tocar no trabalhista
-- ============================================================

-- 1. prev_pautas: pasta (data + local) que agrupa perícias
CREATE TABLE public.prev_pautas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data date NOT NULL,
  local text NOT NULL,
  cidade text,
  uf text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prev_pautas TO authenticated;
GRANT ALL ON public.prev_pautas TO service_role;

ALTER TABLE public.prev_pautas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prev_pautas_select_own" ON public.prev_pautas
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prev_pautas_insert_own" ON public.prev_pautas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prev_pautas_update_own" ON public.prev_pautas
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prev_pautas_delete_own" ON public.prev_pautas
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX prev_pautas_user_data_idx ON public.prev_pautas (user_id, data DESC);

CREATE TRIGGER prev_pautas_updated_at
  BEFORE UPDATE ON public.prev_pautas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 2. prev_pericias: cada perícia individual dentro de uma pauta
CREATE TABLE public.prev_pericias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pauta_id uuid NOT NULL REFERENCES public.prev_pautas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando','em_atendimento','concluido','faltou')),
  periciado_nome text,
  pdf_path text,
  pdf_processado boolean NOT NULL DEFAULT false,
  prelaudo_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_extracao jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prev_pericias TO authenticated;
GRANT ALL ON public.prev_pericias TO service_role;

ALTER TABLE public.prev_pericias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prev_pericias_select_own" ON public.prev_pericias
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prev_pericias_insert_own" ON public.prev_pericias
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prev_pericias_update_own" ON public.prev_pericias
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prev_pericias_delete_own" ON public.prev_pericias
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX prev_pericias_pauta_ordem_idx ON public.prev_pericias (pauta_id, ordem);
CREATE INDEX prev_pericias_user_idx ON public.prev_pericias (user_id);

CREATE TRIGGER prev_pericias_updated_at
  BEFORE UPDATE ON public.prev_pericias
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 3. prev_documentos: documentos extraídos do PDF do processo (laudos, exames, receitas, outros)
CREATE TABLE public.prev_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pericia_id uuid NOT NULL REFERENCES public.prev_pericias(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('laudo','exame','receita','pedido','outro')),
  data date,
  resumo text,
  trecho_original text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prev_documentos TO authenticated;
GRANT ALL ON public.prev_documentos TO service_role;

ALTER TABLE public.prev_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prev_documentos_select_own" ON public.prev_documentos
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prev_documentos_insert_own" ON public.prev_documentos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prev_documentos_update_own" ON public.prev_documentos
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "prev_documentos_delete_own" ON public.prev_documentos
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX prev_documentos_pericia_idx ON public.prev_documentos (pericia_id, ordem);
