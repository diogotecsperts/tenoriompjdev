import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// PROMPTS DE REGENERAÇÃO (regerar-campo-pdf)
// ============================================

const regenPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string }> = {
  prompt_regen_historiaAtual: {
    cardId: 'periciando',
    sectionId: 'anamnese',
    description: 'História da Moléstia Atual - Regenerar via PDF',
    prompt: `Extraia e detalhe ao máximo a "História Atual" ou "Queixas Atuais" / "Anamnese" do documento.

EXTRAIA COM MÁXIMO DETALHAMENTO:
- Todos os sintomas relatados pelo periciando e sua intensidade
- Localização e irradiação da dor (onde dói, para onde irradia)
- Fatores de melhora e piora dos sintomas
- Periodicidade e frequência dos sintomas
- Impacto nas atividades diárias (o que não consegue fazer)
- Impacto nas atividades laborais (limitações no trabalho)
- Medicamentos em uso atual (nomes, doses)
- Qualidade do sono e alterações de humor
- Limitações funcionais específicas

MÍNIMO 3 parágrafos. NÃO resuma. Use linguagem técnica médico-legal.`
  },
  prompt_regen_historicoOcupacional: {
    cardId: 'periciando',
    sectionId: 'anamnese',
    description: 'Histórico ocupacional - Regenerar via PDF',
    prompt: `Extraia e detalhe ao máximo o "Histórico Ocupacional" do documento.

EXTRAIA CRONOLOGICAMENTE:
- Todas as empresas onde trabalhou (nome, período)
- Cargos e funções exercidas em cada emprego
- Atividades desenvolvidas em cada função
- Exposição a riscos ocupacionais (ruído, vibração, esforço físico, produtos químicos)
- Tempo de exposição em cada atividade
- Motivo de saída de cada emprego
- Evolução da carreira profissional

Busque em: CTPS, PPP, depoimentos, petição inicial.
MÍNIMO 2 parágrafos ou lista cronológica completa. Use linguagem técnica.`
  },
  prompt_regen_historiaAcidente: {
    cardId: 'periciando',
    sectionId: 'acidente',
    description: 'História do acidente - Regenerar via PDF',
    prompt: `Extraia e detalhe ao máximo a "História do Acidente" ou "Descrição do Evento" do documento.

EXTRAIA COM PRECISÃO:
- Data exata do acidente/evento
- Local exato onde ocorreu (setor, área, empresa)
- Circunstâncias detalhadas do evento
- Mecanismo da lesão (como ocorreu o trauma)
- Posição do trabalhador no momento
- Atividade que estava sendo realizada
- Testemunhas (se mencionadas)
- Atendimento inicial recebido (socorro, pronto-socorro)
- Consequências imediatas (lesões, sintomas iniciais)
- Emissão de CAT (se houve)

MÍNIMO 2 parágrafos. NÃO resuma. Transcreva todos os detalhes disponíveis.`
  },
  prompt_regen_antecedentes: {
    cardId: 'periciando',
    sectionId: 'antecedentes',
    description: 'Antecedentes Pessoais e Familiares - Regenerar via PDF',
    prompt: `Extraia TODOS os "Antecedentes Patológicos" do documento.

LISTE COMPLETAMENTE:
- Doenças crônicas prévias (diabetes, hipertensão, cardiopatias, etc.)
- Cirurgias anteriores (data, tipo, local, resultado)
- Internações hospitalares (motivo, período, hospital)
- Uso de medicamentos crônicos (lista completa)
- Histórico familiar relevante (doenças hereditárias)
- Hábitos de vida (tabagismo: quantos anos/maços; etilismo: frequência)
- Acidentes ou lesões anteriores ao evento em questão
- Tratamentos prévios realizados

NÃO deixe vazio se houver QUALQUER menção a saúde prévia.`
  },
  prompt_regen_tratamentos: {
    cardId: 'periciando',
    sectionId: 'antecedentes',
    description: 'Tratamentos realizados - Regenerar via PDF',
    prompt: `Extraia TODOS os "Tratamentos Realizados" do documento.

LISTE EM FORMATO ESTRUTURADO:
- Medicamentos utilizados (nome, dose, período de uso, resposta ao tratamento)
- Fisioterapia (número de sessões, período, resultado obtido)
- Cirurgias realizadas (data, tipo, hospital, evolução pós-operatória)
- Internações (período, motivo, condutas realizadas)
- Acompanhamento especializado (especialidade, frequência)
- Procedimentos invasivos (infiltrações, bloqueios, etc.)
- Uso de órteses, próteses ou equipamentos
- Tratamentos alternativos (acupuntura, RPG, etc.)

Seja específico com datas e resultados de cada tratamento.`
  },
  prompt_regen_afastamentos: {
    cardId: 'periciando',
    sectionId: 'antecedentes',
    description: 'Afastamentos do Trabalho - Regenerar via PDF',
    prompt: `Extraia TODOS os "Períodos de Afastamento" do documento.

LISTE CRONOLOGICAMENTE:
- Data de início e término de CADA afastamento
- CID-10 de cada afastamento (obrigatório se disponível)
- Tipo de benefício recebido:
  * Auxílio-doença previdenciário (B31)
  * Auxílio-doença acidentário (B91)
  * Aposentadoria por invalidez
  * Licença médica
- Duração de cada período afastado
- Tempo total acumulado de afastamento
- Se houve alta médica e retorno ao trabalho
- Resultado de perícias do INSS (se mencionado)

EXTRAIA DATAS EXATAS. Liste todos os afastamentos identificados.`
  },
  prompt_regen_laudosMedicos: {
    cardId: 'exame',
    sectionId: 'laudos',
    description: 'Descrição dos Laudos Médicos - Regenerar via PDF',
    prompt: `Extraia TODOS os "Laudos Médicos" ou "Pareceres Médicos" do documento.

PARA CADA LAUDO, EXTRAIA:
- Data do documento
- Nome do médico e especialidade
- Diagnósticos (com códigos CID-10 se disponíveis)
- Achados do exame clínico descritos
- Conclusões do médico
- Recomendações e restrições médicas
- Limitações funcionais apontadas
- Prognóstico (se mencionado)

ESTRUTURE ASSIM:
**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**
- Diagnósticos: [listar com CIDs]
- Conclusões: [descrever]
- Recomendações: [descrever]
- Limitações: [listar]

Liste CADA laudo separadamente. NÃO resuma.`
  },
  prompt_regen_examesComplementares: {
    cardId: 'exame',
    sectionId: 'exames',
    description: 'Descrição dos Exames Complementares - Regenerar via PDF',
    prompt: `Extraia TODOS os "Exames Complementares" do documento.

PARA CADA EXAME, EXTRAIA:
- Tipo de exame (Radiografia, RNM, TC, EMG, Ultrassonografia, Laboratoriais, etc.)
- Data de realização
- Região/área examinada
- TODOS os achados e resultados
- Conclusão do laudo do exame

ESTRUTURE ASSIM:
**[Tipo do Exame] - [Região] (DD/MM/AAAA):**
[Descrição completa dos achados]
Conclusão: [conclusão do exame]

Exemplo: "**RNM Coluna Lombar (15/03/2023):** Retificação da lordose lombar. Protrusão discal L4-L5 com contato radicular. Abaulamento discal difuso L5-S1. Estenose foraminal bilateral."

NÃO resuma. Liste TODOS os achados de cada exame.`
  },
  prompt_regen_exameFisico: {
    cardId: 'exame',
    sectionId: 'exame-fisico',
    description: 'Achados do Exame Físico - Regenerar via PDF',
    prompt: `Extraia as informações do "Exame Físico" realizadas no periciando.

SE HOUVER DESCRIÇÃO DE EXAME FÍSICO, EXTRAIA:
- Estado geral do periciando
- Inspeção (deformidades, atrofias, edemas, cicatrizes, posturas antálgicas)
- Palpação (pontos dolorosos, contraturas musculares, massas palpáveis)
- Testes especiais realizados e seus resultados:
  * Coluna: Lasègue, Wassermann, Schober
  * Ombro: Jobe, Neer, Hawkins
  * Punho: Phalen, Tinel, Finkelstein
  * Outros conforme região avaliada
- Amplitude de movimentos (ADM) de cada articulação
- Força muscular (graus 0-5 por grupamento)
- Reflexos profundos
- Sensibilidade
- Marcha e postura
- Manobras específicas

Se não houver exame físico descrito nos autos, retorne: "Exame físico não descrito nos autos do processo."`
  },
  // NOTA: prompt_regen_descricaoPostoTrabalho foi REMOVIDO - campo unificado em descricaoAtividadesLaborais
  prompt_regen_descricaoAtividadesLaborais: {
    cardId: 'posto-trabalho',
    sectionId: 'dados-posto',
    description: 'Ambiente e Atividades Laborais - Regenerar via PDF',
    prompt: `Extraia e detalhe o "Ambiente de Trabalho" e as "Atividades Laborais" do documento.

AMBIENTE DE TRABALHO - DETALHAR:
- Ambiente físico (interno/externo, coberto/descoberto, climatizado)
- Dimensões e layout do local de trabalho
- Equipamentos e máquinas utilizados (listar todos)
- Mobiliário disponível (mesa, cadeira, bancada - alturas, regulagens)
- Condições ergonômicas do posto
- Exposição a riscos físicos:
  * Ruído (intensidade se disponível)
  * Vibração (tipo, frequência)
  * Temperatura extrema
  * Radiação
- Exposição a riscos químicos (produtos, substâncias)
- Condições de iluminação e ventilação
- EPIs fornecidos e utilizados

ATIVIDADES LABORAIS - DETALHAR:
- Descrição completa das tarefas diárias
- Movimentos repetitivos realizados (tipo, frequência, duração)
- Esforço físico exigido (peso carregado em kg, frequência de levantamento)
- Posturas de trabalho:
  * Tempo em pé, sentado, agachado, curvado
  * Posições dos membros superiores
- Jornada de trabalho (horário, turnos)
- Horas extras (frequência, duração)
- Pausas durante a jornada (frequência, duração)
- Ritmo de trabalho e metas de produção
- Uso de ferramentas manuais
- Demanda física e mental da função

Busque em: PPP, PPRA, PCMSO, laudos ergonômicos, depoimentos, petição inicial.
MÍNIMO 3 parágrafos. Seja específico e detalhado.`
  },
  prompt_regen_descricaoTecnicaDoencas: {
    cardId: 'analise-tecnica',
    sectionId: 'descricao-doencas',
    description: 'Descrição técnica das doenças - Regenerar via PDF',
    prompt: `Extraia informações sobre as doenças mencionadas e descreva tecnicamente cada uma.
Para cada CID/doença, forneça: definição, etiologia, sintomas, relação ocupacional quando aplicável.
Use linguagem técnica médica apropriada para laudo pericial.`
  },
  prompt_regen_conclusaoAnalise: {
    cardId: 'conclusao',
    sectionId: 'conclusao',
    description: 'Análise conclusiva - Regenerar via PDF',
    prompt: `Elabore uma "Análise Conclusiva" técnica para o laudo pericial com base em todas as informações extraídas.

A ANÁLISE DEVE CONTER:
1. Síntese do quadro clínico atual do periciando
2. Correlação entre as atividades laborais e as patologias diagnosticadas
3. Análise crítica da documentação médica apresentada
4. Fundamentação técnica para as conclusões sobre:
   - Nexo causal (se há relação entre trabalho e doença/lesão)
   - Incapacidade laboral (tipo e grau)
5. Considerações sobre prognóstico

Use linguagem técnica médico-legal. Seja objetivo e fundamentado.
MÍNIMO 2 parágrafos.`
  },
  prompt_regen_tabelaSUSEP: {
    cardId: 'conclusao',
    sectionId: 'sequelas',
    description: 'Tabela SUSEP - Regenerar via PDF',
    prompt: `Extraia informações para avaliação pela "Tabela SUSEP/DPVAT" de invalidez permanente.

BUSQUE NOS AUTOS:
- Percentuais de invalidez mencionados em laudos médicos ou perícias anteriores
- Referências específicas à Tabela SUSEP, DPVAT ou outras tabelas de invalidez
- Item da tabela aplicável às lesões/sequelas identificadas
- Grau de comprometimento funcional ou anatômico documentado
- Decisões do INSS sobre grau de invalidez (B91, aposentadoria por invalidez)
- Laudos periciais anteriores que quantificaram sequelas

ESTRUTURE A RESPOSTA:
Se encontrar informações, formate assim:
"[X%] de invalidez permanente conforme item [Y] da Tabela SUSEP/DPVAT
Sequela: [descrição da lesão/sequela]
Fundamentação: [fonte da informação - laudo de Dr. X, perícia do INSS, etc.]"

Se não houver menção a percentuais de invalidez, retorne:
"Não foram identificados nos autos documentos que quantifiquem o grau de invalidez permanente segundo a Tabela SUSEP/DPVAT."`
  },
  prompt_regen_danoEstetico: {
    cardId: 'conclusao',
    sectionId: 'sequelas',
    description: 'Dano estético - Regenerar via PDF',
    prompt: `Extraia informações sobre "Dano Estético" do documento.

BUSQUE NOS AUTOS:
- Cicatrizes visíveis: localização anatômica, dimensões aproximadas, características (hipertrófica, queloidiana, hiperpigmentada)
- Deformidades permanentes: tipo (angular, rotacional), gravidade, visibilidade
- Amputações ou perdas anatômicas: nível, membro afetado
- Alterações de marcha ou postura permanentes e visíveis
- Assimetrias corporais resultantes de lesões
- Fotos anexadas aos autos que documentem o dano

CLASSIFICAÇÃO DO DANO ESTÉTICO (se mencionada ou possível inferir):
- Leve: cicatrizes discretas, pouco visíveis, em áreas normalmente cobertas
- Moderado: cicatrizes visíveis em áreas expostas, pequenas deformidades
- Grave: deformidades significativas, cicatrizes extensas, alterações funcionais visíveis
- Gravíssimo: grandes deformidades, amputações, desfiguramento

ESTRUTURE A RESPOSTA:
Descreva objetivamente os achados estéticos documentados, a localização, e se possível classifique a gravidade.

Se não houver menção a dano estético, retorne:
"Não foram identificados nos autos documentos que descrevam dano estético decorrente das lesões."`
  },
  prompt_regen_auxilioTerceiros: {
    cardId: 'conclusao',
    sectionId: 'sequelas',
    description: 'Necessidade de Auxílio de Terceiros - Regenerar via PDF',
    prompt: `Extraia informações sobre "Necessidade de Auxílio de Terceiros" do documento.

BUSQUE NOS AUTOS:
- Se o periciando necessita de ajuda para Atividades da Vida Diária (AVDs):
  * Alimentar-se (cortar alimentos, levar à boca)
  * Vestir-se e despir-se
  * Higiene pessoal (banho, uso do banheiro)
  * Locomoção dentro e fora de casa
- Se necessita de cuidador permanente ou intermitente
- Tipo de auxílio necessário e frequência (24 horas, apenas para certas atividades)
- Laudos médicos, de assistente social ou perícias que atestem a necessidade
- Prescrição médica de acompanhante ou cuidador

ESTRUTURE A RESPOSTA:
Descreva as limitações funcionais que demandam auxílio, as atividades para as quais necessita de ajuda, 
o tipo de cuidador necessário (familiar, profissional), e a fonte documental da informação.

Se não houver menção a necessidade de auxílio, retorne:
"Não foram identificados nos autos documentos que indiquem necessidade de auxílio permanente de terceiros para atividades da vida diária."`
  },
  prompt_regen_quesitosJuizo: {
    cardId: 'conclusao',
    sectionId: 'quesitos',
    description: 'Quesitos do juízo - Regenerar via PDF',
    prompt: `Extraia INTEGRALMENTE os "Quesitos do Juízo" do documento.

Os quesitos do Juízo são perguntas técnicas formuladas pelo Juiz para o perito responder.

ONDE BUSCAR:
- Despachos judiciais (busque por "O perito deverá responder...", "Quesitos do MM. Juízo")
- Decisões que nomeiam o perito
- Atas de audiência com determinação de quesitos
- Intimações do perito

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original (1, 2, 3... ou I, II, III... ou a, b, c...)
- NÃO altere o texto - transcreva literalmente
- Inclua todos os sub-quesitos se houver (Ex: 1.1, 1.2, 2.a, 2.b)
- Preserve a ordem original dos quesitos

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos do Juízo, retorne: "Quesitos do Juízo não identificados nos autos."`
  },
  prompt_regen_quesitosReclamante: {
    cardId: 'conclusao',
    sectionId: 'quesitos',
    description: 'Quesitos do reclamante - Regenerar via PDF',
    prompt: `Extraia INTEGRALMENTE os "Quesitos do Reclamante" (ou do Autor) do documento.

Os quesitos do Reclamante são perguntas formuladas pelo advogado da parte autora.

ONDE BUSCAR:
- Petição inicial (geralmente ao final)
- Petição específica de quesitos do reclamante
- Rol de quesitos anexado aos autos
- Emendas à inicial com quesitos

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original
- NÃO altere, resuma ou parafraseie o texto
- Inclua todos os sub-quesitos (Ex: 3.1, 3.2, 3.a, 3.b)
- Preserve a ordem original

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos do Reclamante, retorne: "Quesitos do Reclamante não identificados nos autos."`
  },
  prompt_regen_quesitosReclamada: {
    cardId: 'conclusao',
    sectionId: 'quesitos',
    description: 'Quesitos da reclamada - Regenerar via PDF',
    prompt: `Extraia INTEGRALMENTE os "Quesitos da Reclamada" (ou da Ré) do documento.

Os quesitos da Reclamada são perguntas formuladas pelo advogado da parte ré/empresa.

ONDE BUSCAR:
- Contestação (geralmente ao final)
- Petição específica de quesitos da reclamada
- Rol de quesitos anexado aos autos
- Réplica ou outras manifestações com quesitos

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original
- NÃO altere, resuma ou parafraseie o texto
- Inclua todos os sub-quesitos
- Preserve a ordem original

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos da Reclamada, retorne: "Quesitos da Reclamada não identificados nos autos."`
  },
  prompt_regen_resumoPeticaoInicial: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumo da petição inicial - Regenerar via PDF',
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial médico trabalhista.

Instruções:
- Resuma os pontos principais alegados pelo reclamante
- Destaque as doenças/lesões mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`
  },
  prompt_regen_resumoContestacao: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumo da contestação - Regenerar via PDF',
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da contestação para um laudo pericial médico trabalhista.

Instruções:
- Resuma os pontos principais alegados pela reclamada
- Destaque os argumentos contrários ao nexo causal
- Identifique documentos ou evidências mencionadas
- Mencione os pedidos de improcedência
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`
  }
};

// ============================================
// PROMPTS DE GERAÇÃO (gerar-resumos)
// ============================================

const genPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string; variables: string[] }> = {
  prompt_gen_resumo_peticao: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumir petição inicial',
    variables: ['peticaoInicial'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial médico trabalhista.

Texto da Petição Inicial:
\${peticaoInicial}

Instruções:
- Resuma os pontos principais alegados pelo reclamante
- Destaque as doenças/lesões mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`
  },
  prompt_gen_resumo_contestacao: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumir contestação',
    variables: ['contestacao'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da contestação para um laudo pericial médico trabalhista.

Texto da Contestação:
\${contestacao}

Instruções:
- Resuma os pontos principais alegados pela reclamada
- Destaque os argumentos contrários ao nexo causal
- Identifique documentos ou evidências mencionadas
- Mencione os pedidos de improcedência
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`
  },
  prompt_gen_descricao_doencas: {
    cardId: 'analise-tecnica',
    sectionId: 'descricao-doencas',
    description: 'Descrição técnica das doenças',
    variables: ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore uma descrição técnica detalhada das doenças identificadas para um laudo pericial.

CIDs identificados:
\${cids}

Informações adicionais:
- Posto de trabalho: \${postoTrabalho}
- Atividades laborais: \${atividadesLaborais}
- Histórico ocupacional: \${historicoOcupacional}

Instruções:
Para cada CID mencionado, forneça:
1. Nome da doença e código CID-10
2. Definição técnica
3. Etiologia (causas possíveis)
4. Sintomas característicos
5. Fatores de risco ocupacionais (quando aplicável)
6. Relação com atividades laborais descritas

Use linguagem técnica médica apropriada para laudo pericial.`
  },
  prompt_gen_nexo_causal: {
    cardId: 'analise-tecnica',
    sectionId: 'nexo',
    description: 'Análise de nexo causal',
    variables: ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional', 'historiaAcidente', 'historiaAtual', 'exameFisico', 'examesComplementares', 'antecedentes'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica do nexo causal para um laudo pericial médico trabalhista.

Dados para análise:
- CIDs/Diagnósticos: \${cids}
- Posto de trabalho: \${postoTrabalho}
- Atividades laborais: \${atividadesLaborais}
- Histórico ocupacional: \${historicoOcupacional}
- História do acidente/doença: \${historiaAcidente}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}
- Exames complementares: \${examesComplementares}
- Antecedentes patológicos: \${antecedentes}

Instruções:
Analise o nexo causal utilizando os critérios de Bradford-Hill e Simonin:
1. Plausibilidade biológica
2. Força da associação
3. Temporalidade
4. Consistência
5. Especificidade
6. Gradiente dose-resposta

Classifique o nexo como: Direto, Concausa, Agravamento ou Sem Nexo Causal.
Fundamente tecnicamente sua conclusão citando evidências clínicas e documentais.`
  },
  prompt_gen_incapacidade: {
    cardId: 'analise-tecnica',
    sectionId: 'analise-incapacidade',
    description: 'Análise de incapacidade',
    variables: ['cids', 'exameFisico', 'examesComplementares', 'tratamentos', 'atividadesLaborais', 'postoTrabalho'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica da incapacidade laboral para um laudo pericial.

Dados para análise:
- CIDs/Diagnósticos: \${cids}
- Exame físico: \${exameFisico}
- Exames complementares: \${examesComplementares}
- Tratamentos realizados: \${tratamentos}
- Atividades laborais: \${atividadesLaborais}
- Posto de trabalho: \${postoTrabalho}

Instruções:
Analise a capacidade laboral considerando:
1. Tipo de incapacidade (parcial/total, temporária/permanente)
2. Limitações funcionais identificadas no exame físico
3. Compatibilidade com a função exercida
4. Possibilidade de reabilitação profissional
5. Necessidade de readaptação de função
6. Impacto nas atividades de vida diária

Fundamente tecnicamente sua análise com base nos achados clínicos e exames.`
  },
  prompt_gen_sugestoes_pericia: {
    cardId: 'periciando',
    sectionId: 'anamnese',
    description: 'Sugestões para perícia',
    variables: ['cids', 'historiaAcidente', 'historiaAtual', 'postoTrabalho', 'atividadesLaborais', 'antecedentes'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. 
Com base nas informações do caso, elabore sugestões práticas para auxiliar a perícia.

DADOS DO CASO:
- CIDs/Diagnósticos alegados: \${cids}
- História do acidente/doença: \${historiaAcidente}
- História atual: \${historiaAtual}
- Posto de trabalho: \${postoTrabalho}
- Atividades laborais: \${atividadesLaborais}
- Antecedentes patológicos: \${antecedentes}

INSTRUÇÕES IMPORTANTES:
- Responda APENAS em português brasileiro
- NÃO use tabelas de forma alguma
- Use apenas listas com marcadores (-) e títulos (##, ###)
- Seja objetivo e direto
- Use linguagem técnica médica

ESTRUTURA DA RESPOSTA:

## PERGUNTAS SUGERIDAS PARA A ANAMNESE

### Sobre o início e evolução
- Liste 2-3 perguntas específicas sobre quando iniciaram os sintomas e como evoluíram

### Sobre o trabalho
- Liste 2-3 perguntas sobre as atividades realizadas e exposição a fatores de risco

### Sobre tratamentos
- Liste 2-3 perguntas sobre tratamentos realizados e resultados obtidos

### Sobre limitações atuais
- Liste 2-3 perguntas sobre atividades que não consegue mais realizar e impacto na vida diária

---

## EXAME FÍSICO SUGERIDO

### Inspeção Geral
- O que observar na inspeção inicial do periciando
- Postura, marcha, estado geral

### Testes Específicos
- Liste 3-5 manobras ou testes relevantes para os CIDs informados
- Para cada teste, indique brevemente o que avalia

### Avaliação Funcional
- Amplitude de movimento (quais articulações avaliar)
- Força muscular (quais grupos musculares)
- Sensibilidade (quando aplicável)

Forneça entre 8-12 perguntas e 5-8 testes/manobras específicas relevantes para os CIDs informados.`
  },
  prompt_gen_referencias: {
    cardId: 'referencias',
    sectionId: 'referencias',
    description: 'Referências bibliográficas',
    variables: ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional', 'nexoCausal', 'conclusao', 'metodologia', 'tratamentos', 'examesComplementares'],
    prompt: `Você é um perito médico especialista em medicina do trabalho. Com base nas informações do laudo, identifique e liste referências bibliográficas pertinentes e específicas para o caso.

DADOS DO LAUDO:
- CIDs/Diagnósticos: \${cids}
- Posto de trabalho: \${postoTrabalho}
- Atividades laborais: \${atividadesLaborais}
- Histórico ocupacional: \${historicoOcupacional}
- Nexo causal: \${nexoCausal}
- Conclusão: \${conclusao}
- Metodologia: \${metodologia}
- Tratamentos: \${tratamentos}
- Exames complementares: \${examesComplementares}

INSTRUÇÕES:
- Liste entre 5 e 8 referências bibliográficas pertinentes ao caso específico
- Numere cada referência (1-, 2-, 3-, etc.)
- Inclua obras de medicina do trabalho relacionadas aos CIDs informados
- Inclua legislação aplicável (CLT, Lei 8.213/91, NRs relevantes para o caso)
- Inclua normas técnicas do CFM e CID-10
- NÃO inclua referências genéricas desnecessárias
- Seja específico: se há lesão de coluna, cite obras sobre coluna; se há LER/DORT, cite obras sobre ergonomia
- Use formato ABNT para as referências

FORMATO DE SAÍDA:
1- AUTOR. Título da obra. Cidade: Editora, Ano.

2- BRASIL. Lei/Norma específica aplicável ao caso.

3- Norma técnica ou regulamentadora pertinente.

Forneça referências que realmente embasem tecnicamente o laudo para este caso específico.`
  },
  prompt_gen_aprimorar_texto: {
    cardId: '_global',
    sectionId: '_aprimorar',
    description: 'Aprimorar texto (correção gramatical)',
    variables: ['textoOriginal', 'campo'],
    prompt: `Você é um revisor especializado em textos médico-periciais. Seu trabalho é APENAS corrigir e aprimorar o texto fornecido, SEM alterar seu conteúdo técnico ou factual.

TEXTO ORIGINAL:
\${textoOriginal}

CAMPO DO LAUDO: \${campo}

REGRAS ESTRITAS:
1. Corrija APENAS: ortografia, gramática, concordância verbal/nominal, pontuação
2. Melhore a formalidade e o estilo para padrão de laudo pericial
3. NÃO altere dados técnicos: datas, números, CIDs, nomes, percentuais, medidas, lateralidade
4. NÃO adicione informações novas
5. NÃO remova informações existentes
6. NÃO altere diagnósticos ou conclusões médicas
7. Mantenha a estrutura de parágrafos original
8. Use linguagem técnica e formal apropriada para laudos periciais

Retorne APENAS o texto corrigido, sem comentários ou explicações.`
  }
};

// ============================================
// PROMPT DE SISTEMA (processar-autos)
// ============================================

const systemPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string }> = {
  prompt_system_perito: {
    cardId: '_system',
    sectionId: '_global',
    description: 'Prompt de sistema - Identidade do perito médico',
    prompt: 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.'
  },
  prompt_import_system: {
    cardId: '_system',
    sectionId: '_import',
    description: 'Mega-prompt de sistema para extração de dados de processos trabalhistas',
    prompt: `Você é um EXTRATOR especializado em análise de processos judiciais trabalhistas médico-periciais. Sua tarefa é EXTRAIR e ORGANIZAR informações de documentos processuais para preencher um laudo pericial.

REGRAS GERAIS:
1. Extraia APENAS informações EXPLICITAMENTE presentes nos documentos - NUNCA invente ou suponha dados
2. Se uma informação não estiver presente, deixe o campo vazio ou com valor padrão
3. Mantenha a fidelidade aos documentos - transcreva dados exatamente como aparecem
4. Use linguagem técnica médico-legal apropriada
5. Organize as informações de forma clara e estruturada
6. Priorize informações mais recentes quando houver conflito de datas

ESTRUTURA JSON DE SAÍDA:
Retorne APENAS o JSON válido com os campos preenchidos conforme encontrado nos documentos.`
  }
};

// ============================================
// HELPER: Get all prompts as a map
// ============================================

function getAllPromptsMap(): Record<string, { prompt: string; description: string; cardId: string; sectionId: string; variables?: string[] }> {
  const map: Record<string, { prompt: string; description: string; cardId: string; sectionId: string; variables?: string[] }> = {};
  
  for (const [id, data] of Object.entries(regenPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId };
  }
  
  for (const [id, data] of Object.entries(genPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId, variables: data.variables };
  }
  
  for (const [id, data] of Object.entries(systemPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId };
  }
  
  return map;
}

// ============================================
// ACTION: Check for updates
// ============================================

// deno-lint-ignore no-explicit-any
async function checkUpdates(supabase: any) {
  const hardcodedPrompts = getAllPromptsMap();
  
  const results = {
    outdatedDescriptions: [] as Array<{ id: string; current: string; new: string }>,
    newPrompts: [] as Array<{ id: string; description: string }>,
    customized: [] as Array<{ id: string; description: string }>,
    upToDate: [] as Array<{ id: string }>,
    totalHardcoded: Object.keys(hardcodedPrompts).length
  };
  
  for (const [id, config] of Object.entries(hardcodedPrompts)) {
    const { data: existing } = await supabase
      .from('system_config')
      .select('value')
      .eq('id', id)
      .single();
    
    if (!existing) {
      results.newPrompts.push({ id, description: config.description });
    } else {
      const dbConfig = existing.value as { prompt?: string; description?: string };
      
      // Check if description/metadata changed
      if (dbConfig.description !== config.description) {
        results.outdatedDescriptions.push({
          id,
          current: dbConfig.description || '(sem descrição)',
          new: config.description
        });
      }
      
      // Check if prompt was customized
      if (dbConfig.prompt !== config.prompt) {
        results.customized.push({
          id,
          description: config.description
        });
      } else {
        results.upToDate.push({ id });
      }
    }
  }
  
  return results;
}

// ============================================
// ACTION: Sync metadata only (preserve prompt content)
// ============================================

// deno-lint-ignore no-explicit-any
async function syncMetadataOnly(supabase: any) {
  const hardcodedPrompts = getAllPromptsMap();
  
  let updated = 0;
  let inserted = 0;
  let errors = 0;
  
  for (const [id, config] of Object.entries(hardcodedPrompts)) {
    const { data: existing } = await supabase
      .from('system_config')
      .select('value')
      .eq('id', id)
      .single();
    
    if (existing) {
      // Preserve the existing prompt, update only metadata
      // deno-lint-ignore no-explicit-any
      const existingValue = existing.value as Record<string, any>;
      const updatedConfig: Record<string, unknown> = {
        ...existingValue,
        description: config.description,
        cardId: config.cardId,
        sectionId: config.sectionId,
        isClassified: true,
        // Preserve: prompt, variables (if user edited them)
      };
      
      // Only update variables if they don't exist in DB
      if (!existingValue.variables && config.variables) {
        updatedConfig.variables = config.variables;
      }
      
      const { error } = await supabase
        .from('system_config')
        .update({ 
          value: updatedConfig, 
          description: config.description,
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) {
        console.error(`[seed-prompts] Error updating metadata for ${id}:`, error);
        errors++;
      } else {
        updated++;
      }
    } else {
      // Insert new prompt with full content
      const newValue = {
        prompt: config.prompt,
        description: config.description,
        cardId: config.cardId,
        sectionId: config.sectionId,
        variables: config.variables,
        isClassified: true
      };
      
      const { error } = await supabase
        .from('system_config')
        .insert({
          id,
          value: newValue,
          description: config.description,
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error(`[seed-prompts] Error inserting ${id}:`, error);
        errors++;
      } else {
        inserted++;
      }
    }
  }
  
  return { updated, inserted, errors };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[seed-prompts] No authorization header');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    // Verify user is developer
    const { data: isDev, error: devError } = await supabase.rpc('is_developer');
    if (devError || !isDev) {
      console.error('[seed-prompts] User is not a developer:', devError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Developer access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for action
    let action = 'seed'; // default action
    try {
      const body = await req.json();
      action = body?.action || 'seed';
    } catch {
      // No body or invalid JSON, use default action
    }

    console.log(`[seed-prompts] Action: ${action}`);

    // Handle check_updates action
    if (action === 'check_updates') {
      const results = await checkUpdates(supabase);
      console.log(`[seed-prompts] Check updates: ${results.outdatedDescriptions.length} outdated, ${results.newPrompts.length} new, ${results.customized.length} customized`);
      
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle sync_metadata action
    if (action === 'sync_metadata') {
      const results = await syncMetadataOnly(supabase);
      console.log(`[seed-prompts] Sync metadata: ${results.updated} updated, ${results.inserted} inserted, ${results.errors} errors`);
      
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: Full seed (factory reset)
    console.log('[seed-prompts] Starting full prompt seeding...');

    // Combine all prompts
    const allPrompts: Array<{
      id: string;
      value: {
        prompt: string;
        description: string;
        cardId: string;
        sectionId: string;
        variables?: string[];
        isClassified: boolean;
      };
      description: string;
    }> = [];

    // Add regen prompts
    for (const [id, data] of Object.entries(regenPrompts)) {
      allPrompts.push({
        id,
        value: {
          prompt: data.prompt,
          description: data.description,
          cardId: data.cardId,
          sectionId: data.sectionId,
          isClassified: true
        },
        description: data.description
      });
    }

    // Add gen prompts
    for (const [id, data] of Object.entries(genPrompts)) {
      allPrompts.push({
        id,
        value: {
          prompt: data.prompt,
          description: data.description,
          cardId: data.cardId,
          sectionId: data.sectionId,
          variables: data.variables,
          isClassified: true
        },
        description: data.description
      });
    }

    // Add system prompts
    for (const [id, data] of Object.entries(systemPrompts)) {
      allPrompts.push({
        id,
        value: {
          prompt: data.prompt,
          description: data.description,
          cardId: data.cardId,
          sectionId: data.sectionId,
          isClassified: true
        },
        description: data.description
      });
    }

    console.log(`[seed-prompts] Preparing to upsert ${allPrompts.length} prompts`);

    // Upsert all prompts
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const prompt of allPrompts) {
      // Check if exists
      const { data: existing } = await supabase
        .from('system_config')
        .select('id')
        .eq('id', prompt.id)
        .single();

      const { error } = await supabase
        .from('system_config')
        .upsert({
          id: prompt.id,
          value: prompt.value,
          description: prompt.description,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) {
        console.error(`[seed-prompts] Error upserting ${prompt.id}:`, error);
        errors++;
      } else if (existing) {
        updated++;
      } else {
        inserted++;
      }
    }

    console.log(`[seed-prompts] Completed: ${inserted} inserted, ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total: allPrompts.length,
        inserted,
        updated,
        errors
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[seed-prompts] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
