-- Adicionar novos campos para o modelo completo de laudo

-- Assistentes Técnicos
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS assistente_tecnico_reclamada TEXT DEFAULT '';
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS assistente_tecnico_reclamante TEXT DEFAULT '';

-- Local da Perícia
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS local_pericia TEXT DEFAULT '';

-- Objetivo da Perícia
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS objetivo_pericia TEXT DEFAULT '';

-- Resumo dos Autos
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS resumo_peticao_inicial TEXT DEFAULT '';
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS resumo_contestacao TEXT DEFAULT '';

-- Metodologia Pericial
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS metodologia_pericial TEXT DEFAULT 'Este laudo foi elaborado com base no estudo das peças contidas nos autos do processo; exame pericial do(a) reclamante, conforme parâmetros técnicos utilizados pela especialidade de Medicina do Trabalho. Análise criteriosa e imparcial das informações coligidas durante a perícia e nos autos do processo, que é exigida pelo CÓDIGO DE ÉTICA MÉDICA (Res. CFM 2.217/2018), em seus artigos 93 e 98. A literatura especializada que serviu de embasamento técnico científico das conclusões está relacionada nas referências bibliográficas (ao final).';

-- Dados do Posto de Trabalho
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS dados_funcionais_cargo TEXT DEFAULT '';
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS dados_funcionais_admissao DATE;
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS dados_funcionais_afastamento DATE;
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS descricao_posto_trabalho TEXT DEFAULT '';
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS descricao_atividades_laborais TEXT DEFAULT '';

-- Descrição Técnica das Doenças
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS descricao_tecnica_doencas TEXT DEFAULT '';

-- Análise da Incapacidade Laboral
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS analise_incapacidade_laboral TEXT DEFAULT '';

-- Referências Bibliográficas
ALTER TABLE public.laudos ADD COLUMN IF NOT EXISTS referencias_bibliograficas TEXT DEFAULT '- BARROS, B. T. Perícia Médica. São Paulo: Editora LTR, 2023.
- BRASIL. Ministério do Trabalho e Emprego. Normas Regulamentadoras.
- MENDES, René. Patologia do trabalho. São Paulo: Atheneu, 2005.
- VIEIRA, Sebastião Ivone. Manual de saúde e segurança do trabalho. São Paulo: LTr, 2005.
- OMS. Classificação Internacional de Doenças - CID-10.
- CFM. Código de Ética Médica - Resolução CFM 2.217/2018.';