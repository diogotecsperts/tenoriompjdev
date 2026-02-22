import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { DEFAULT_IMPORT_PROMPTS, getImportPromptIds } from "../_shared/build-import-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// PROMPTS DE IMPORTAÇÃO (processar-autos)
// ============================================

function buildImportPrompts(): Record<string, { prompt: string; cardId: string; sectionId: string; description: string; order: number }> {
  const importPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string; order: number }> = {};
  
  const cardMapping: Record<string, { cardId: string; sectionId: string }> = {
    prompt_import_vitima: { cardId: 'periciando', sectionId: 'vitima' },
    prompt_import_processo: { cardId: 'preliminares', sectionId: 'processo' },
    prompt_import_historiaAcidente: { cardId: 'periciando', sectionId: 'acidente' },
    prompt_import_historicoOcupacional: { cardId: 'periciando', sectionId: 'acidente' },
    prompt_import_historiaAtual: { cardId: 'periciando', sectionId: 'anamnese' },
    prompt_import_antecedentes: { cardId: 'periciando', sectionId: 'antecedentes' },
    prompt_import_tratamentos: { cardId: 'periciando', sectionId: 'antecedentes' },
    prompt_import_afastamentos: { cardId: 'periciando', sectionId: 'antecedentes' },
    prompt_import_postoTrabalho: { cardId: 'posto-trabalho', sectionId: 'dados-posto' },
    prompt_import_ambienteAtividades: { cardId: 'posto-trabalho', sectionId: 'dados-posto' },
    prompt_import_laudosMedicos: { cardId: 'exame', sectionId: 'laudos' },
    prompt_import_examesComplementares: { cardId: 'exame', sectionId: 'exames' },
    prompt_import_exameFisico: { cardId: 'exame', sectionId: 'exame-fisico' },
    prompt_import_cids: { cardId: 'analise-tecnica', sectionId: 'descricao-doencas' },
    prompt_import_incapacidade: { cardId: 'analise-tecnica', sectionId: 'analise-incapacidade' },
    prompt_import_nexoCausal: { cardId: 'analise-tecnica', sectionId: 'nexo' },
    prompt_import_sequelas: { cardId: 'conclusao', sectionId: 'sequelas' },
    prompt_import_quesitos: { cardId: 'conclusao', sectionId: 'quesitos' },
    prompt_import_textosBrutos: { cardId: 'resumo-autos', sectionId: 'resumo' },
    prompt_import_resumo: { cardId: '_system', sectionId: '_import' }
  };
  
  for (const promptId of getImportPromptIds()) {
    const defaultData = DEFAULT_IMPORT_PROMPTS[promptId];
    const mapping = cardMapping[promptId] || { cardId: '_system', sectionId: '_import' };
    
    if (defaultData) {
      importPrompts[promptId] = {
        cardId: mapping.cardId,
        sectionId: mapping.sectionId,
        description: `${defaultData.section}`,
        order: defaultData.order,
        prompt: defaultData.prompt
      };
    }
  }
  
  return importPrompts;
}

// ============================================
// PROMPTS DE REGENERAÇÃO (regerar-campo-pdf)
// ============================================

const regenPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string; order: number }> = {
  // ================================
  // CARD: resumo-autos | SECTION: resumo
  // ================================
  prompt_regen_resumoPeticaoInicial: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumo da Petição Inicial - Regerar via PDF',
    order: 2,
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
    description: 'Resumo da Contestação - Regerar via PDF',
    order: 4,
    prompt: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da contestação para um laudo pericial médico trabalhista.

Instruções:
- Resuma os pontos principais alegados pela reclamada
- Destaque os argumentos contrários ao nexo causal
- Identifique documentos ou evidências mencionadas
- Mencione os pedidos de improcedência
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`
  },
  
  // ================================
  // CARD: periciando | SECTION: acidente
  // ================================
  prompt_regen_historicoOcupacional: {
    cardId: 'periciando',
    sectionId: 'acidente',
    description: 'Histórico Ocupacional - Regerar via PDF',
    order: 1,
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
    description: 'História do Acidente - Regerar via PDF',
    order: 2,
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
  
  // ================================
  // CARD: periciando | SECTION: anamnese
  // ================================
  prompt_regen_historiaAtual: {
    cardId: 'periciando',
    sectionId: 'anamnese',
    description: 'Anamnese - Regerar via PDF',
    order: 1,
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
  
  // ================================
  // CARD: periciando | SECTION: antecedentes
  // ================================
  prompt_regen_antecedentes: {
    cardId: 'periciando',
    sectionId: 'antecedentes',
    description: 'Antecedentes Patológicos - Regerar via PDF',
    order: 1,
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
    description: 'Tratamentos Realizados - Regerar via PDF',
    order: 2,
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
    description: 'Afastamentos do Trabalho - Regerar via PDF',
    order: 3,
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
  
  // ================================
  // CARD: posto-trabalho | SECTION: dados-posto
  // ================================
  prompt_regen_descricaoAtividadesLaborais: {
    cardId: 'posto-trabalho',
    sectionId: 'dados-posto',
    description: 'Ambiente e Atividades Laborais',
    order: 1,
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
  
  // ================================
  // CARD: exame | SECTION: laudos
  // ================================
  prompt_regen_laudosMedicos: {
    cardId: 'exame',
    sectionId: 'laudos',
    description: 'Laudos Médicos - Regerar via PDF',
    order: 1,
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
  
  // ================================
  // CARD: exame | SECTION: exames
  // ================================
  prompt_regen_examesComplementares: {
    cardId: 'exame',
    sectionId: 'exames',
    description: 'Exames Complementares - Regerar via PDF',
    order: 1,
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
  
  // ================================
  // CARD: exame | SECTION: exame-fisico
  // ================================
  prompt_regen_exameFisico: {
    cardId: 'exame',
    sectionId: 'exame-fisico',
    description: 'Exame Físico - Regerar via PDF',
    order: 1,
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
  
  // ================================
  // CARD: analise-tecnica | SECTION: descricao-doencas
  // ================================
  prompt_regen_descricaoTecnicaDoencas: {
    cardId: 'analise-tecnica',
    sectionId: 'descricao-doencas',
    description: 'Descrição Técnica das Doenças - Regerar via PDF',
    order: 3,
    prompt: `Extraia informações sobre as doenças mencionadas e descreva tecnicamente cada uma.
Para cada CID/doença, forneça: definição, etiologia, sintomas, relação ocupacional quando aplicável.
Use linguagem técnica médica apropriada para laudo pericial.`
  },
  
  // ================================
  // CARD: conclusao | SECTION: conclusao
  // ================================
  prompt_regen_conclusaoAnalise: {
    cardId: 'conclusao',
    sectionId: 'conclusao',
    description: 'Conclusão - Regerar via PDF',
    order: 1,
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
  
  // ================================
  // CARD: conclusao | SECTION: sequelas
  // ================================
  prompt_regen_tabelaSUSEP: {
    cardId: 'conclusao',
    sectionId: 'sequelas',
    description: 'Tabela SUSEP - Regerar via PDF',
    order: 1,
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
    description: 'Dano Estético - Regerar via PDF',
    order: 2,
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
    description: 'Auxílio de Terceiros - Regerar via PDF',
    order: 3,
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
  
  // ================================
  // CARD: conclusao | SECTION: quesitos
  // ================================
  prompt_regen_quesitosJuizo: {
    cardId: 'conclusao',
    sectionId: 'quesitos',
    description: 'Quesitos do Juízo - Regerar via PDF',
    order: 1,
    prompt: `Extraia os "Quesitos do Juízo" do documento e gere sugestões de respostas técnicas.

Os quesitos do Juízo são perguntas técnicas formuladas pelo Juiz para o perito responder.

SUA TAREFA:
1. Extraia LITERALMENTE cada pergunta mantendo a numeração original.
2. CORREÇÃO DE IDIOMA: Corrija os erros de OCR, aplicando todos os acentos e cedilhas na pergunta extraída.
3. RESPOSTA: Logo abaixo de cada pergunta, gere uma sugestão de resposta técnica baseada estritamente na anamnese, exames e análise do caso. Se faltar dado, sugira "Aguardando avaliação pericial complementar."

REGRA DE FORMATAÇÃO: Use uma quebra de linha dupla (\\n\\n) entre a resposta de um quesito e a pergunta do próximo.

ESTRUTURA EXATA ESPERADA:
QUESITO 1: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

QUESITO 2: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

FOCO DE BUSCA: As perguntas do Juízo estão tipicamente localizadas no FINAL do texto (Despachos). Procure por pontos de interrogação (?), listas numeradas, e termos como 'diga o perito', 'informe', 'esclareça'. Extraia as perguntas e responda-as tecnicamente.

REGRA DE INEXISTÊNCIA: Caso não exista absolutamente nenhuma pergunta formulada pelo Juízo no texto, retorne apenas a frase exata: 'Quesitos do Juízo não identificados nos autos.'`
  },
  prompt_regen_quesitosReclamante: {
    cardId: 'conclusao',
    sectionId: 'quesitos',
    description: 'Quesitos do Reclamante - Regerar via PDF',
    order: 2,
    prompt: `Extraia os "Quesitos do Reclamante" (ou do Autor) do documento e gere sugestões de respostas técnicas.

Os quesitos do Reclamante são perguntas formuladas pelo advogado da parte autora.

SUA TAREFA:
1. Extraia LITERALMENTE cada pergunta mantendo a numeração original.
2. CORREÇÃO DE IDIOMA: Corrija os erros de OCR, aplicando todos os acentos e cedilhas na pergunta extraída.
3. RESPOSTA: Logo abaixo de cada pergunta, gere uma sugestão de resposta técnica baseada estritamente na anamnese, exames e análise do caso. Se faltar dado, sugira "Aguardando avaliação pericial complementar."

REGRA DE FORMATAÇÃO: Use uma quebra de linha dupla (\\n\\n) entre a resposta de um quesito e a pergunta do próximo.

ESTRUTURA EXATA ESPERADA:
QUESITO 1: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

QUESITO 2: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

FOCO DE BUSCA: As perguntas do Reclamante estão tipicamente localizadas no INÍCIO do texto (Petição Inicial). Procure por pontos de interrogação (?), listas numeradas, e termos como 'diga o perito', 'informe', 'esclareça'. Extraia as perguntas do reclamante e responda-as tecnicamente.

REGRA DE INEXISTÊNCIA: Caso não exista absolutamente nenhuma pergunta formulada pelo Reclamante no texto, retorne apenas a frase exata: 'Quesitos do Reclamante não identificados nos autos.'`
  },
  prompt_regen_quesitosReclamada: {
    cardId: 'conclusao',
    sectionId: 'quesitos',
    description: 'Quesitos da Reclamada - Regerar via PDF',
    order: 3,
    prompt: `Extraia os "Quesitos da Reclamada" (ou da Ré) do documento e gere sugestões de respostas técnicas.

Os quesitos da Reclamada são perguntas formuladas pelo advogado da parte ré/empresa.

SUA TAREFA:
1. Extraia LITERALMENTE cada pergunta mantendo a numeração original.
2. CORREÇÃO DE IDIOMA: Corrija os erros de OCR, aplicando todos os acentos e cedilhas na pergunta extraída.
3. RESPOSTA: Logo abaixo de cada pergunta, gere uma sugestão de resposta técnica baseada estritamente na anamnese, exames e análise do caso. Se faltar dado, sugira "Aguardando avaliação pericial complementar."

REGRA DE FORMATAÇÃO: Use uma quebra de linha dupla (\\n\\n) entre a resposta de um quesito e a pergunta do próximo.

ESTRUTURA EXATA ESPERADA:
QUESITO 1: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

QUESITO 2: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

FOCO DE BUSCA: As perguntas da Reclamada estão tipicamente localizadas no FINAL do texto (Contestações e Despachos). Procure por pontos de interrogação (?), listas numeradas, e termos como 'diga o perito', 'informe', 'esclareça'. Extraia as perguntas e responda-as tecnicamente.

REGRA DE INEXISTÊNCIA: Caso não exista absolutamente nenhuma pergunta formulada pela Reclamada no texto, retorne apenas a frase exata: 'Quesitos da Reclamada não identificados nos autos.'`
  }
};

// ============================================
// PROMPTS DE GERAÇÃO (gerar-resumos)
// ============================================

const genPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string; variables: string[]; order: number }> = {
  // ================================
  // CARD: resumo-autos | SECTION: resumo
  // ================================
  prompt_gen_resumo_peticao: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumo da Petição Inicial - Gerar',
    variables: ['peticaoInicial'],
    order: 1,
    prompt: `Você é um perito médico especialista em medicina do trabalho.
Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial.

Texto da Petição Inicial extraído:
\${peticaoInicial}

REGRAS DE REDAÇÃO INQUEBRÁVEIS (RISCO LEGAL):
1. ATENÇÃO AO VIÉS: É ESTRITAMENTE PROIBIDO presumir, inventar ou adicionar doenças ocupacionais típicas da profissão (ex: tendinopatias, LER/DORT, síndrome do impacto, PAIR) se elas NÃO estiverem textualmente descritas na petição. O caso pode se tratar de um trauma grave ou acidente atípico.
2. Seja absolutamente fiel aos fatos: cite apenas as lesões, sintomas e dinâmicas de acidente que estão explícitas no texto fornecido.
3. Não utilize placeholders ([INSERIR]). Se não houver clareza, limite-se aos fatos apresentados.
4. Use apenas texto plano, sem Markdown, em no máximo 3 parágrafos contínuos.

INSTRUÇÕES:
- Resuma os pontos principais alegados pelo reclamante
- Destaque a dinâmica do adoecimento/acidente e as doenças reais mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais`
  },
  prompt_gen_resumo_contestacao: {
    cardId: 'resumo-autos',
    sectionId: 'resumo',
    description: 'Resumo da Contestação - Gerar',
    variables: ['contestacao'],
    order: 3,
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
  
  // ================================
  // CARD: analise-tecnica | SECTION: descricao-doencas
  // ================================
  prompt_gen_descricao_doencas: {
    cardId: 'analise-tecnica',
    sectionId: 'descricao-doencas',
    description: 'Descrição Técnica das Doenças - Gerar',
    variables: ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional'],
    order: 1,
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
  prompt_gen_descricao_cid: {
    cardId: 'analise-tecnica',
    sectionId: 'descricao-doencas',
    description: 'Descrição por CID - Gerar',
    variables: ['cid', 'postoTrabalho', 'atividadesLaborais'],
    order: 2,
    prompt: `Você é um perito médico especialista. Descreva tecnicamente a doença do CID informado.

CID: \${cid}
Posto de trabalho: \${postoTrabalho}
Atividades laborais: \${atividadesLaborais}

Forneça: definição, etiologia, sintomas, relação ocupacional quando aplicável.
Use linguagem técnica médica apropriada para laudo pericial.`
  },
  
  // ================================
  // CARD: analise-tecnica | SECTION: nexo
  // ================================
  prompt_gen_nexo_causal: {
    cardId: 'analise-tecnica',
    sectionId: 'nexo',
    description: 'Nexo Causal - Gerar',
    variables: ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional', 'historiaAcidente', 'historiaAtual', 'exameFisico', 'examesComplementares', 'antecedentes'],
    order: 1,
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
  
  // ================================
  // CARD: analise-tecnica | SECTION: analise-incapacidade
  // ================================
  prompt_gen_incapacidade: {
    cardId: 'analise-tecnica',
    sectionId: 'analise-incapacidade',
    description: 'Análise da Incapacidade - Gerar',
    variables: ['cids', 'exameFisico', 'examesComplementares', 'tratamentos', 'atividadesLaborais', 'postoTrabalho'],
    order: 1,
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
  
  // ================================
  // CARD: referencias | SECTION: referencias
  // ================================
  prompt_gen_referencias: {
    cardId: 'referencias',
    sectionId: 'referencias',
    description: 'Referências Bibliográficas - Gerar',
    variables: ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional', 'nexoCausal', 'conclusao', 'metodologia', 'tratamentos', 'examesComplementares'],
    order: 1,
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
  
  // ================================
  // CARD: _global | SECTION: _aprimorar
  // ================================
  prompt_gen_aprimorar_texto: {
    cardId: '_global',
    sectionId: '_aprimorar',
    description: 'Aprimorar Texto - Gerar',
    variables: ['textoOriginal', 'campo'],
    order: 1,
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
  },
  
  // ================================
  // CARD: _system | SECTION: _internal (não visível no laudo)
  // ================================
  prompt_gen_sugestoes_pericia: {
    cardId: '_system',
    sectionId: '_internal',
    description: 'Sugestões para Perícia - Sistema',
    variables: ['cids', 'historiaAcidente', 'historiaAtual', 'postoTrabalho', 'atividadesLaborais', 'antecedentes'],
    order: 1,
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
  }
};

// ============================================
// PROMPT DE SISTEMA (processar-autos)
// ============================================

const systemPrompts: Record<string, { prompt: string; cardId: string; sectionId: string; description: string; order: number }> = {
  // ================================
  // CARD: _system | SECTION: _gerar_resumos
  // ================================
  prompt_system_gerar_resumos: {
    cardId: '_system',
    sectionId: '_gerar_resumos',
    description: 'System Prompt - Geração de Resumos',
    order: 1,
    prompt: 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.'
  },
  prompt_system_perito: {
    cardId: '_system',
    sectionId: '_gerar_resumos',
    description: 'System Prompt - Identidade do Perito',
    order: 2,
    prompt: 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.'
  },
  
  // ================================
  // CARD: _system | SECTION: _import
  // ================================
  prompt_import_system: {
    cardId: '_system',
    sectionId: '_import',
    description: 'System Prompt - Importação de PDF',
    order: 1,
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
  },
  
  // ================================
  // CARD: impugnacao | SECTION: resposta
  // ================================
  prompt_system_impugnacao: {
    cardId: 'impugnacao',
    sectionId: 'resposta',
    description: 'Resposta à Impugnação - Sistema',
    order: 1,
    prompt: `Você é um perito médico especialista em medicina do trabalho, respondendo a uma impugnação de laudo pericial.

Sua tarefa é elaborar uma resposta técnica fundamentada que:
1. Mantenha a coerência com as conclusões do laudo original
2. Cite evidências clínicas e documentais do laudo
3. Use linguagem técnica e formal apropriada
4. Seja objetiva e imparcial
5. Fundamente cada afirmação com dados do laudo

Responda sempre em português brasileiro, de forma técnica e profissional.`
  }
};

// ============================================
// HELPER: Get all prompts as a map
// ============================================

function getAllPromptsMap(): Record<string, { prompt: string; description: string; cardId: string; sectionId: string; order: number; variables?: string[] }> {
  const map: Record<string, { prompt: string; description: string; cardId: string; sectionId: string; order: number; variables?: string[] }> = {};
  
  for (const [id, data] of Object.entries(regenPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId, order: data.order };
  }
  
  for (const [id, data] of Object.entries(genPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId, order: data.order, variables: data.variables };
  }
  
  for (const [id, data] of Object.entries(systemPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId, order: data.order };
  }
  
  // Add import prompts
  const importPrompts = buildImportPrompts();
  for (const [id, data] of Object.entries(importPrompts)) {
    map[id] = { prompt: data.prompt, description: data.description, cardId: data.cardId, sectionId: data.sectionId, order: data.order };
  }
  
  return map;
}

// ============================================
// OBSOLETE PROMPTS - Removed from code, should be deleted from DB
// ============================================

const OBSOLETE_PROMPTS = [
  'prompt_regen_descricaoPostoTrabalho', // Unificado em descricaoAtividadesLaborais
];

// ============================================
// ACTION: Cleanup obsolete prompts (AUTOMATIC ORPHAN DETECTION)
// ============================================

// deno-lint-ignore no-explicit-any
async function cleanupObsoletePrompts(supabase: any) {
  const hardcodedPrompts = getAllPromptsMap();
  const hardcodedIds = new Set(Object.keys(hardcodedPrompts));
  
  // Fetch all prompts from database with prompt_% prefix
  const { data: allDbPrompts, error: fetchError } = await supabase
    .from('system_config')
    .select('id')
    .like('id', 'prompt_%');
  
  if (fetchError) {
    console.error('[seed-prompts] Error fetching prompts for cleanup:', fetchError);
    return 0;
  }
  
  let deletedCount = 0;
  
  // Delete prompts that exist in DB but NOT in code (orphans)
  for (const row of (allDbPrompts || [])) {
    if (!hardcodedIds.has(row.id)) {
      const { error } = await supabase
        .from('system_config')
        .delete()
        .eq('id', row.id);
      
      if (!error) {
        console.log(`[seed-prompts] Deleted orphan prompt: ${row.id}`);
        deletedCount++;
      } else {
        console.error(`[seed-prompts] Failed to delete orphan ${row.id}:`, error);
      }
    }
  }
  
  // Also delete from manual obsolete list (retrocompatibility)
  for (const id of OBSOLETE_PROMPTS) {
    // Skip if already deleted by automatic detection
    if (!hardcodedIds.has(id)) {
      const { error } = await supabase
        .from('system_config')
        .delete()
        .eq('id', id);
      
      if (!error) {
        console.log(`[seed-prompts] Deleted obsolete (manual) prompt: ${id}`);
        // Don't double-count if already deleted above
      }
    }
  }
  
  return deletedCount;
}

// ============================================
// ACTION: Check for updates
// ============================================

// deno-lint-ignore no-explicit-any
async function checkUpdates(supabase: any) {
  const hardcodedPrompts = getAllPromptsMap();
  const hardcodedIds = new Set(Object.keys(hardcodedPrompts));
  
  // Fetch ALL prompts from database
  const { data: allDbPrompts } = await supabase
    .from('system_config')
    .select('id, value')
    .like('id', 'prompt_%');
  
  const results = {
    outdatedDescriptions: [] as Array<{ id: string; current: string; new: string }>,
    newPrompts: [] as Array<{ id: string; description: string }>,
    customized: [] as Array<{ id: string; description: string }>,
    upToDate: [] as Array<{ id: string }>,
    // NEW: orphaned prompts that exist in DB but removed from code
    orphaned: [] as Array<{ id: string; description: string }>,
    totalHardcoded: hardcodedIds.size
  };
  
  // Detect orphaned prompts: in DB but not in code
  for (const row of (allDbPrompts || [])) {
    if (!hardcodedIds.has(row.id)) {
      const dbConfig = row.value as { description?: string };
      results.orphaned.push({
        id: row.id,
        description: dbConfig?.description || '(sem descrição)'
      });
    }
  }
  
  // Check each hardcoded prompt
  for (const [id, config] of Object.entries(hardcodedPrompts)) {
    const existing = (allDbPrompts || []).find((p: { id: string }) => p.id === id);
    
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
        order: config.order,
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
        order: config.order,
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

    // Parse request body for action + extra params
    let action = 'seed'; // default action
    let promptId: string | undefined;
    try {
      const body = await req.json();
      action = body?.action || 'seed';
      promptId = body?.promptId;
    } catch {
      // No body or invalid JSON, use default action
    }

    console.log(`[seed-prompts] Action: ${action}${promptId ? `, promptId: ${promptId}` : ''}`);

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

    // Handle restore_single action — restaura apenas UM prompt para o default do código
    if (action === 'restore_single') {
      if (!promptId) {
        return new Response(
          JSON.stringify({ error: 'promptId is required for restore_single' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const allDefaults = getAllPromptsMap();
      const defaultConfig = allDefaults[promptId];
      
      if (!defaultConfig) {
        return new Response(
          JSON.stringify({ error: `No default found for promptId: ${promptId}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const restoredValue = {
        id: promptId,
        prompt: defaultConfig.prompt,
        description: defaultConfig.description,
        cardId: defaultConfig.cardId,
        sectionId: defaultConfig.sectionId,
        order: defaultConfig.order,
        variables: defaultConfig.variables,
        isClassified: true,
        updatedAt: new Date().toISOString()
      };
      
      const { error: upsertError } = await supabase
        .from('system_config')
        .upsert({
          id: promptId,
          value: restoredValue,
          description: defaultConfig.description,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      
      if (upsertError) {
        console.error(`[seed-prompts] Error restoring ${promptId}:`, upsertError);
        return new Response(
          JSON.stringify({ error: `Failed to restore prompt: ${upsertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[seed-prompts] Restored single prompt: ${promptId}`);
      return new Response(
        JSON.stringify({ success: true, promptId, restored: restoredValue }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle get_defaults action — retorna o(s) prompt(s) padrão do código
    if (action === 'get_defaults') {
      const allDefaults = getAllPromptsMap();
      
      if (promptId) {
        // Retornar apenas o default de um prompt específico
        const defaultConfig = allDefaults[promptId];
        if (!defaultConfig) {
          return new Response(
            JSON.stringify({ error: `No default found for promptId: ${promptId}` }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, promptId, defaultPrompt: defaultConfig.prompt }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Retornar todos os defaults (apenas campo prompt de cada um)
      const defaults: Record<string, string> = {};
      for (const [id, config] of Object.entries(allDefaults)) {
        defaults[id] = config.prompt;
      }
      return new Response(
        JSON.stringify({ success: true, defaults }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: Full seed (factory reset)
    console.log('[seed-prompts] Starting full prompt seeding...');

    // First, cleanup obsolete prompts
    const deletedCount = await cleanupObsoletePrompts(supabase);
    console.log(`[seed-prompts] Cleaned up ${deletedCount} obsolete prompts`);

    // Combine all prompts
    const allPrompts: Array<{
      id: string;
      value: {
        prompt: string;
        description: string;
        cardId: string;
        sectionId: string;
        order: number;
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
          order: data.order,
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
          order: data.order,
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
          order: data.order,
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

    console.log(`[seed-prompts] Completed: ${inserted} inserted, ${updated} updated, ${deletedCount} deleted, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total: allPrompts.length,
        inserted,
        updated,
        deleted: deletedCount,
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
