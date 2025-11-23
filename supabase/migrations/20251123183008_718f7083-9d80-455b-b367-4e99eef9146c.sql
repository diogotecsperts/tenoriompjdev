-- Criar tabela de perfis de médicos peritos
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  especialidade TEXT,
  crm TEXT,
  email TEXT NOT NULL,
  telefone TEXT,
  endereco TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS na tabela profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Política: Usuários podem atualizar seu próprio perfil
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Política: Usuários podem inserir seu próprio perfil
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Criar tabela de laudos
CREATE TABLE public.laudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Novo Laudo',
  
  -- Dados do Perito
  perito_nome TEXT DEFAULT '',
  perito_especialidade TEXT DEFAULT '',
  perito_crm TEXT DEFAULT '',
  perito_email TEXT DEFAULT '',
  perito_telefone TEXT DEFAULT '',
  perito_endereco TEXT DEFAULT '',
  
  -- Dados do Processo
  processo_numero TEXT DEFAULT '',
  processo_vara TEXT DEFAULT '',
  reclamante TEXT DEFAULT '',
  reclamada TEXT DEFAULT '',
  data_acidente DATE,
  data_pericia DATE,
  
  -- Documentos (array de strings)
  documentos TEXT[] DEFAULT '{}',
  
  -- Dados da Vítima
  vitima_nome TEXT DEFAULT '',
  vitima_escolaridade TEXT DEFAULT '',
  vitima_nascimento DATE,
  vitima_profissao TEXT DEFAULT '',
  vitima_dominancia TEXT DEFAULT '',
  
  -- Dados do Acidente
  historico_ocupacional TEXT DEFAULT '',
  historia_acidente TEXT DEFAULT '',
  
  -- Anamnese
  historia_atual TEXT DEFAULT '',
  
  -- Antecedentes
  antecedentes TEXT DEFAULT '',
  tratamentos TEXT DEFAULT '',
  afastamentos TEXT DEFAULT '',
  
  -- Planejamento (array de strings)
  planejamento TEXT[] DEFAULT '{}',
  
  -- Laudos e Exames
  laudos_medicos TEXT DEFAULT '',
  exames_complementares TEXT DEFAULT '',
  exame_fisico TEXT DEFAULT '',
  
  -- Nexo Causal
  nexo_causal_tipo TEXT DEFAULT '',
  nexo_causal_justificativa TEXT DEFAULT '',
  
  -- Conclusão
  conclusao_cid TEXT DEFAULT '',
  conclusao_analise TEXT DEFAULT '',
  conclusao_incapacidade TEXT DEFAULT '',
  conclusao_status TEXT DEFAULT '',
  conclusao_justificativa TEXT DEFAULT '',
  conclusao_destino TEXT DEFAULT '',
  
  -- Avaliação Sequelas
  tabela_susep TEXT DEFAULT '',
  dano_estetico TEXT DEFAULT '',
  auxilio_terceiros TEXT DEFAULT '',
  
  -- Quesitos
  quesitos_juizo TEXT DEFAULT '',
  quesitos_reclamante TEXT DEFAULT '',
  quesitos_reclamada TEXT DEFAULT '',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS na tabela laudos
ALTER TABLE public.laudos ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver seus próprios laudos
CREATE POLICY "Users can view own laudos"
  ON public.laudos
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Usuários podem inserir seus próprios laudos
CREATE POLICY "Users can insert own laudos"
  ON public.laudos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem atualizar seus próprios laudos
CREATE POLICY "Users can update own laudos"
  ON public.laudos
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Política: Usuários podem deletar seus próprios laudos
CREATE POLICY "Users can delete own laudos"
  ON public.laudos
  FOR DELETE
  USING (auth.uid() = user_id);

-- Função para atualizar o campo updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger para atualizar updated_at em profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para atualizar updated_at em laudos
CREATE TRIGGER update_laudos_updated_at
  BEFORE UPDATE ON public.laudos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Função para criar perfil automaticamente quando um usuário se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Trigger para criar perfil ao cadastrar usuário
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();