 /**
  * Build Import Prompt - Montagem modular do system prompt de importação
  * 
  * Este módulo busca prompts individuais do banco de dados via prompt-manager
  * e os concatena para formar o system prompt completo de importação de PDFs.
  * 
  * Funcionalidades:
  * - Busca paralela de ~18 prompts individuais
  * - Concatenação ordenada para formar o prompt final
  * - Fallback automático para o prompt monolítico se algo falhar
  * - Validação de estrutura antes de retornar
  * - Cache integrado via prompt-manager
  */
 
 import { getPrompt } from "./prompt-manager.ts";
 
 // ============================================
 // CONSTANTES - HEADER, FOOTER E JSON TEMPLATE
 // ============================================
 
 const IMPORT_PROMPT_HEADER = `Você é um perito médico especialista em medicina do trabalho com vasta experiência em elaboração de laudos periciais. Analise os autos do processo e extraia TODAS as informações disponíveis com MÁXIMO DETALHAMENTO para preencher um laudo pericial completo.
 
 === REGRAS GERAIS DE EXTRAÇÃO - LEIA COM ATENÇÃO ===
 
 1. NÃO RESUMA. Extraia o MÁXIMO de detalhes disponíveis no documento.
 2. Campos de texto descritivo devem ter NO MÍNIMO 3 parágrafos quando a informação existir.
 3. Use linguagem técnica MÉDICO-LEGAL apropriada para laudos periciais trabalhistas.
 4. Use APENAS texto plano nas respostas. Separe itens com quebras de linha. NUNCA use formatação Markdown (asteriscos, negritos, bullets) dentro dos valores JSON.
 5. Extraia APENAS o que está EXPLÍCITO no documento - não invente informações.
 6. Campos não encontrados = "" (string vazia) ou [] (array vazio).
 7. Datas no formato: YYYY-MM-DD
 8. CPF no formato: XXX.XXX.XXX-XX
 9. CIDs: apenas códigos (ex: "J15.9", "M54.2")
 
 === PRIORIDADE DE EXTRAÇÃO (em caso de documento extenso/truncado) ===
 1. MÁXIMA: CIDs mencionados, nome da vítima, número do processo, descrição do acidente
 2. ALTA: História atual, histórico ocupacional, posto de trabalho, atividades laborais
 3. MÉDIA: Quesitos, exames, tratamentos, afastamentos, laudos médicos
 4. NORMAL: Textos brutos completos (petição e contestação)`;
 
 const IMPORT_JSON_TEMPLATE = `
 === ESTRUTURA JSON A RETORNAR ===
 {
   "vitima": {
     "nome": "",
     "cpf": "",
     "data_nascimento": "",
     "profissao": "",
     "escolaridade": "",
     "dominancia": ""
   },
   "processo": {
     "numero": "",
     "vara": "",
     "reclamante": "",
     "reclamada": ""
   },
   "acidente": {
     "data": "",
     "descricao": "",
     "local": ""
   },
  "documentos_checklist": {
     "cat": false,
     "prontuario": false,
     "receitas": false,
     "exames": false,
     "laudos_anteriores": false,
     "atestados": false,
     "ppra_pcmso": false,
     "pgr": false,
     "aso": false,
     "outros": []
   },
   "historico": {
     "historia_atual": "",
     "historico_ocupacional": "",
     "antecedentes_patologicos": "",
     "tratamentos_realizados": "",
     "afastamentos": ""
   },
   "posto_trabalho": {
     "cargo_funcao": "",
     "data_admissao": "",
     "data_afastamento": "",
     "ambiente_e_atividades": ""
   },
   "exame_clinico": {
     "laudos_medicos": "",
     "exames_complementares": "",
     "lesoes_descritas": "",
     "exame_fisico": ""
   },
   "informacoes_medicas": {
     "cids_mencionados": [],
     "incapacidade_alegada": "",
     "nexo_sugerido": "",
     "tipo_incapacidade": ""
   },
   "avaliacao_sequelas": {
     "tabela_susep": "",
     "dano_estetico": "",
     "auxilio_terceiros": ""
   },
   "quesitos": {
     "juizo": "",
     "reclamante": "",
     "reclamada": ""
   },
   "textos_brutos": {
     "peticao_inicial": "",
     "contestacao": ""
   },
   "resumo": ""
 }`;
 
 const IMPORT_PROMPT_FOOTER = `
 === FORMATO DE RESPOSTA OBRIGATÓRIO ===
 - Retorne APENAS o objeto JSON, sem markdown, sem \`\`\`, sem explicações.
 - Comece diretamente com { e termine com }
 - NÃO use blocos de código. Apenas JSON puro.`;
 
 // ============================================
 // PROMPTS DE CAMPO - DEFAULTS
 // ============================================
 
 export const DEFAULT_IMPORT_PROMPTS: Record<string, { prompt: string; section: string; order: number }> = {
  // ================================
  // CARD: preliminares | SECTION: processo
  // ================================
  prompt_import_processo: {
    section: 'Dados do Processo',
    order: 1,
    prompt: `Extraia os dados do processo judicial.
Busque: Número completo do processo, vara, nomes das partes exatamente como aparecem nos autos.
O reclamante é a parte autora (geralmente o trabalhador).
A reclamada é a parte ré (geralmente a empresa).`
  },
  
  // ================================
  // CARD: periciando | SECTION: vitima
  // ================================
   prompt_import_vitima: {
    section: 'Dados da Vítima',
    order: 2,
     prompt: `Extraia todos os dados pessoais do periciando/reclamante.
 ATENÇÃO: "dominancia" é a MÃO DOMINANTE (destro, canhoto ou ambidestro), NÃO é gênero/sexo.
 Busque: nome completo, CPF, data de nascimento, profissão, escolaridade, dominância manual.`
   },
   
  // ================================
  // CARD: periciando | SECTION: acidente
  // ================================
  prompt_import_historicoOcupacional: {
    section: 'Histórico Ocupacional',
     order: 3,
    prompt: `EXTRAÇÃO OBRIGATÓRIA - Liste CRONOLOGICAMENTE todos os empregos anteriores com detalhes:
- Nome da empresa, período de trabalho (início e término)
- Cargo/função exercida em cada emprego
- Atividades desenvolvidas em cada função
- Exposição a riscos ocupacionais (ruído, vibração, produtos químicos, esforço físico)
- Motivo da saída de cada emprego
- Tempo total de exposição ocupacional
MÍNIMO 2 parágrafos ou lista cronológica completa. Busque em CTPS, PPP, depoimentos.`
   },
   
  prompt_import_historiaAcidente: {
    section: 'História do Acidente',
     order: 4,
    prompt: `EXTRAÇÃO DETALHADA OBRIGATÓRIA - Extraia e detalhe ao máximo a descrição do acidente/evento:
- data: Data exata do evento traumático (YYYY-MM-DD)
- descricao: TRANSCREVA INTEGRALMENTE a descrição do acidente/evento.
  Inclua TODOS os detalhes: circunstâncias, local exato, horário aproximado, 
  mecanismo da lesão, posição do trabalhador, testemunhas se mencionadas, 
  atendimento inicial recebido, consequências imediatas.
  MÍNIMO 2 parágrafos. NÃO RESUMA. Se houver descrição de CAT, copie-a integralmente.
- local: Local completo onde ocorreu (setor, área, empresa)`
   },
   
  // ================================
  // CARD: periciando | SECTION: anamnese
  // ================================
   prompt_import_historiaAtual: {
    section: 'Anamnese',
     order: 5,
     prompt: `Extraia TODAS as queixas relatadas pelo periciando com riqueza de detalhes:
 - Sintomas atuais, intensidade (escala de dor se mencionada)
 - Localização e irradiação da dor
 - Fatores de melhora e piora
 - Periodicidade e frequência dos sintomas
 - Impacto nas atividades diárias e laborais
 - Uso atual de medicamentos (nomes, doses)
 - Qualidade do sono e humor
 - Limitações funcionais específicas (não consegue fazer X, dificuldade para Y)
 MÍNIMO 3 parágrafos. NÃO OMITA nenhuma queixa mencionada pelo reclamante.`
   },
   
   // Seção: Antecedentes
   prompt_import_antecedentes: {
    section: 'Antecedentes Patológicos',
     order: 6,
     prompt: `Liste TODAS as condições de saúde prévias, mesmo que não relacionadas:
 - Doenças crônicas (diabetes, hipertensão, cardiopatias, etc.)
 - Cirurgias anteriores (data, tipo, local, resultado)
 - Internações hospitalares prévias (motivo, duração)
 - Uso de medicamentos crônicos (lista completa)
 - Histórico familiar relevante (doenças hereditárias)
 - Hábitos de vida (tabagismo, etilismo, sedentarismo)
 - Acidentes ou lesões anteriores
 NÃO deixe vazio se houver QUALQUER menção a saúde prévia no documento.`
   },
   
   // Seção: Tratamentos
   prompt_import_tratamentos: {
    section: 'Tratamentos Realizados',
     order: 7,
     prompt: `Liste TODOS os tratamentos realizados em formato estruturado:
 - Medicamentos utilizados (nome comercial/genérico, dose, período de uso, resposta)
 - Fisioterapia (quantidade de sessões, período, resultado)
 - Cirurgias realizadas (data, tipo, hospital, resultado pós-operatório)
 - Internações (período, motivo, hospital)
 - Acompanhamento especializado (especialidade, frequência, conduta)
 - Procedimentos invasivos (infiltrações, bloqueios, etc.)
 - Uso de órteses ou próteses
 Separe cada tratamento com uma quebra de linha. Seja específico com datas e resultados.`
   },
   
   // Seção: Afastamentos
   prompt_import_afastamentos: {
    section: 'Afastamentos do Trabalho',
     order: 8,
     prompt: `Liste TODOS os períodos de afastamento do trabalho com precisão:
 - Data de início e término de CADA afastamento
 - CID do afastamento (obrigatório se disponível)
 - Tipo de benefício recebido (auxílio-doença B31, auxílio-acidentário B91, aposentadoria por invalidez, etc.)
 - Duração de cada afastamento
 - Tempo total acumulado afastado do trabalho
 - Se houve alta médica ou retorno ao trabalho
 EXTRAIA DATAS EXATAS quando disponíveis. Liste cronologicamente.`
   },
   
   // Seção: Posto de Trabalho
   prompt_import_postoTrabalho: {
    section: 'Dados Funcionais do Posto',
     order: 9,
     prompt: `Extraia informações do cargo e posto de trabalho:
 - cargo_funcao: Cargo exato exercido pelo reclamante
 - data_admissao: Data de admissão na empresa (YYYY-MM-DD)
 - data_afastamento: Data de afastamento ou desligamento (YYYY-MM-DD)
 Busque em: CTPS, contrato de trabalho, PPP, petição inicial.`
   },
   
   // Seção: Ambiente e Atividades Laborais
   prompt_import_ambienteAtividades: {
    section: 'Ambiente e Atividades Laborais',
     order: 10,
     prompt: `AMBIENTE DE TRABALHO - DETALHAR:
 - Ambiente físico (interno/externo, coberto/descoberto, climatizado/não)
 - Dimensões aproximadas do local de trabalho
 - Equipamentos e máquinas utilizados (listar todos)
 - Mobiliário (mesa, cadeira, altura, regulagem)
 - Condições ergonômicas do posto
 - Exposição a riscos físicos (ruído, vibração, temperatura, radiação)
 - Exposição a riscos químicos (poeiras, fumos, névoas, vapores)
 - Condições de iluminação e ventilação
 - Uso de EPIs (quais, frequência de uso)
 
 ATIVIDADES LABORAIS - DETALHAR:
 - Descrição completa das tarefas diárias executadas
 - Movimentos repetitivos (quais, frequência, duração)
 - Esforço físico exigido (peso carregado, frequência de levantamento)
 - Posturas predominantes (sentado, em pé, agachado, curvado)
 - Tempo em cada postura
 - Jornada de trabalho (horário, horas extras)
 - Pausas durante o trabalho (frequência, duração)
 - Ritmo de trabalho e metas de produção
 
 MÍNIMO 3 parágrafos. Busque em PPP, PPRA, PCMSO, laudos ergonômicos, depoimentos.`
   },
   
   // Seção: Laudos Médicos
   prompt_import_laudosMedicos: {
    section: 'Laudos Médicos',
     order: 11,
     prompt: `Extraia de CADA laudo/parecer médico presente nos autos:
 - Data do documento
 - Nome do médico/especialidade responsável
 - Diagnósticos estabelecidos (com CID se disponível)
 - Achados do exame clínico descrito no laudo
 - Conclusões do médico assistente
 - Recomendações e restrições médicas
 - Limitações funcionais apontadas
 - Prognóstico se mencionado
  ESTRUTURE por documento. Liste cada laudo separadamente usando texto plano.
  Exemplo de formato esperado:
  LAUDO 1
  Data: DD/MM/AAAA
  Médico: Dr. Nome - Especialidade
  Diagnósticos: listar com CIDs
  Conclusões: descrever
  Recomendações: descrever
  Limitações: descrever`
   },
   
   // Seção: Exames Complementares
   prompt_import_examesComplementares: {
    section: 'Exames Complementares',
     order: 12,
     prompt: `Liste CADA exame separadamente com estrutura:
 - Tipo de exame (Radiografia, Ressonância Magnética, Tomografia, EMG, Laboratoriais, etc.)
 - Data de realização
 - Região/área examinada
 - Resultados e achados principais
 - Conclusão do laudo do exame
  Exemplo de formato esperado (texto plano):
  EXAME 1
  Tipo e Região: RNM Coluna Lombar
  Data: 15/03/2023
  Resultados: Protrusão discal L4-L5, abaulamento discal L5-S1, estenose foraminal à direita.
  Conclusão: descrever
  NÃO RESUMA. Liste todos os achados de cada exame.`
   },
   
   // Seção: Exame Físico
   prompt_import_exameFisico: {
    section: 'Exame Físico',
     order: 13,
     prompt: `Se houver descrição de exame físico realizado (em laudos médicos, perícias anteriores), extraia:
 - Estado geral do periciando
 - Inspeção (deformidades, atrofias, edemas, cicatrizes)
 - Palpação (pontos dolorosos, contraturas, massas)
 - Testes especiais realizados (Lasègue, Phalen, Tinel, Finkelstein, etc.) e resultados
 - Amplitude de movimentos (ADM) de cada articulação avaliada
 - Força muscular (grau de força por grupamento)
 - Reflexos e sensibilidade
 - Marcha e postura
 Deixe vazio APENAS se não houver NENHUM exame físico descrito nos autos.`
   },
   
   // Seção: CIDs
   prompt_import_cids: {
    section: 'CIDs Mencionados',
     order: 14,
     prompt: `EXTRAIA ABSOLUTAMENTE TODOS os códigos CID-10 mencionados no documento.
 Procure em: laudos médicos, atestados, receitas, CAT, decisões do INSS, perícias anteriores.
 Formato: ["J15.9", "M54.2", "G56.0", "S62.3"]
 NÃO DEIXE ESTE CAMPO VAZIO se houver qualquer código CID nos autos.`
   },
   
   // Seção: Incapacidade
   prompt_import_incapacidade: {
    section: 'Incapacidade Alegada',
     order: 15,
     prompt: `Extraia informações sobre incapacidade:
 - incapacidade_alegada: Descreva detalhadamente o tipo de incapacidade mencionada nos autos.
   Inclua: grau (total/parcial), duração (temporária/permanente), limitações específicas alegadas.
 
 - tipo_incapacidade: Retorne baseado nas evidências:
   * "total_permanente" → aposentadoria por invalidez concedida ou incapacidade total sem recuperação
   * "total_temporaria" → afastamento total do trabalho com expectativa de recuperação
   * "parcial_permanente" → sequelas permanentes com capacidade laboral residual
   * "parcial_temporaria" → limitações temporárias com melhora esperada
   * "ausencia" → laudos indicam capacidade laboral preservada
   * "" → se não há informação suficiente para classificar`
   },
   
   // Seção: Nexo Causal
   prompt_import_nexoCausal: {
    section: 'Nexo Causal Sugerido',
     order: 16,
     prompt: `Retorne o tipo de nexo causal baseado nas evidências documentais:
 - "direto" → se CAT foi emitida e aceita, ou se há nexo claramente estabelecido
 - "concausa" → se há fatores ocupacionais E pessoais contribuintes
 - "agravamento" → se doença pré-existente foi agravada pelo trabalho
 - "" → se não há elementos suficientes para determinar
 
 ATENÇÃO: Preencha APENAS se houver evidência clara no documento. Não invente nexo.`
   },
   
   // Seção: Avaliação de Sequelas
   prompt_import_sequelas: {
    section: 'Avaliação de Sequelas',
     order: 17,
     prompt: `Busque informações sobre sequelas permanentes:
 
 1. tabela_susep: Busque percentual de invalidez, referências à Tabela SUSEP/DPVAT.
    Estruture: "[X%] de invalidez permanente conforme item [Y] da Tabela SUSEP - [descrição da sequela]"
 
 2. dano_estetico: Extraia informações sobre danos estéticos:
    Cicatrizes visíveis, deformidades permanentes, amputações, alterações de marcha visíveis.
    Classifique se mencionado: leve, moderado, grave, gravíssimo.
 
 3. auxilio_terceiros: Extraia necessidade de auxílio de terceiros:
    AVDs (alimentar-se, vestir-se, higiene), locomoção, cuidador permanente/intermitente.
 
 Se não houver informações, deixe os campos vazios.`
   },
   
   // Seção: Quesitos
   prompt_import_quesitos: {
    section: 'Quesitos',
     order: 18,
    prompt: `EXTRAÇÃO INTEGRAL OBRIGATÓRIA COM SUGESTÃO DE RESPOSTAS - Os quesitos são perguntas técnicas formuladas pelo Juízo e pelas partes para serem respondidas pelo perito.

SUA TAREFA para CADA grupo de quesitos (Juízo, Reclamante, Reclamada):
1. Extraia LITERALMENTE cada pergunta mantendo a numeração original.
2. CORREÇÃO DE IDIOMA: Corrija os erros de OCR, aplicando todos os acentos e cedilhas na pergunta extraída.
3. RESPOSTA: Logo abaixo de cada pergunta, gere uma sugestão de resposta técnica baseada estritamente na anamnese, exames e análise do caso. Se faltar dado, sugira "Aguardando avaliação pericial complementar."

REGRA DE FORMATAÇÃO: Use uma quebra de linha dupla (\\n\\n) entre a resposta de um quesito e a pergunta do próximo para evitar aglomeração.

ESTRUTURA EXATA ESPERADA (para cada grupo):
QUESITO 1: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

QUESITO 2: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestão de resposta técnica]

QUESITOS DO JUÍZO: Busque em despachos ou decisões judiciais.
QUESITOS DO RECLAMANTE: Extraia da petição inicial ou petição específica.
QUESITOS DA RECLAMADA: Extraia da contestação ou petição específica.

ATENÇÃO — BUSCA AGRESSIVA OBRIGATÓRIA: É GARANTIDO que os quesitos (perguntas direcionadas ao perito) EXISTEM neste documento. Você DEVE realizar uma busca agressiva. Não procure apenas por títulos óbvios como "Quesitos". Procure ativamente por: pontos de interrogação (?), listas numeradas no meio ou fim das petições, e termos como 'diga o perito', 'informe', 'esclareça', 'requer a perícia'. Extraia todas as perguntas que encontrar.

REGRA DE INEXISTÊNCIA (RISCO LEGAL): Se, e SOMENTE SE, após uma busca exaustiva você confirmar que houve falha no OCR e não há texto legível de perguntas, é ESTRITAMENTE PROIBIDO justificar, explicar, pedir desculpas ou conversar. Você DEVE retornar ÚNICA E EXCLUSIVAMENTE a string exata: 'Quesitos do [Juízo/Reclamante/Reclamada] não identificados nos autos.' Qualquer palavra adicional além desta frase exata causará quebra crítica no sistema do tribunal.

NÃO invente quesitos - extraia APENAS os que existem no documento.`
   },
   
   // Seção: Textos Brutos
   prompt_import_textosBrutos: {
    section: 'Petição Inicial e Contestação',
     order: 19,
     prompt: `Copie os textos completos quando disponíveis:
 - peticao_inicial: Copie o TEXTO COMPLETO da petição inicial (a íntegra ou o máximo possível)
 - contestacao: Copie o TEXTO COMPLETO da contestação (a íntegra ou o máximo possível)
 Esses textos são a fonte primária para geração de resumos técnicos posteriormente.`
   },
   
   // Seção: Resumo
   prompt_import_resumo: {
    section: 'Resumo do Caso',
     order: 20,
     prompt: `Elabore uma síntese breve do caso para identificação rápida (máximo 300 caracteres).
 Inclua: nome do reclamante, doença/lesão principal, empresa reclamada.`
   }
 };
 
 // Lista ordenada de prompts para concatenação
 const IMPORT_PROMPT_ORDER = [
   'prompt_import_processo',
  'prompt_import_vitima',
   'prompt_import_historicoOcupacional',
  'prompt_import_historiaAcidente',
   'prompt_import_historiaAtual',
   'prompt_import_antecedentes',
   'prompt_import_tratamentos',
   'prompt_import_afastamentos',
   'prompt_import_postoTrabalho',
   'prompt_import_ambienteAtividades',
   'prompt_import_laudosMedicos',
   'prompt_import_examesComplementares',
   'prompt_import_exameFisico',
   'prompt_import_cids',
   'prompt_import_incapacidade',
   'prompt_import_nexoCausal',
   'prompt_import_sequelas',
   'prompt_import_quesitos',
   'prompt_import_textosBrutos',
   'prompt_import_resumo'
 ];
 
 // ============================================
 // FUNÇÕES PRINCIPAIS
 // ============================================
 
 function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
   const prefix = `[build-import-prompt]`;
   const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
   console[level](`${prefix} ${message}${metaStr}`);
 }
 
 /**
  * Monta o system prompt modular buscando cada prompt individual do banco
  * 
  * @returns System prompt completo montado a partir dos prompts individuais
  */
 export async function buildModularImportPrompt(): Promise<string> {
   log('info', 'Iniciando montagem do system prompt modular');
   
   try {
     // Buscar todos os prompts em paralelo para performance
     const promptPromises = IMPORT_PROMPT_ORDER.map(async (promptId) => {
       const defaultData = DEFAULT_IMPORT_PROMPTS[promptId];
       if (!defaultData) {
         log('warn', `Prompt não encontrado no catálogo: ${promptId}`);
         return null;
       }
       
       const prompt = await getPrompt(
         promptId,
         defaultData.prompt,
         {},
         {
           autoRegister: true,
           description: `Instrução de extração - ${defaultData.section}`,
           cardId: getCardIdForPrompt(promptId),
           sectionId: getSectionIdForPrompt(promptId)
         }
       );
       
       return {
         id: promptId,
         section: defaultData.section,
         order: defaultData.order,
         prompt
       };
     });
     
     const results = await Promise.all(promptPromises);
     const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
     
     if (validResults.length < 10) {
       log('error', 'Poucos prompts válidos retornados', { count: validResults.length });
       throw new Error('Insufficient prompts loaded');
     }
     
     // Ordenar por order
     validResults.sort((a, b) => a.order - b.order);
     
     // Montar as instruções por campo
     const fieldInstructions = validResults.map(({ section, prompt }) => {
       return `### ${section}\n${prompt}`;
     });
     
     // Concatenar tudo
     const finalPrompt = `${IMPORT_PROMPT_HEADER}
 
 ${IMPORT_JSON_TEMPLATE}
 
 === INSTRUÇÕES ESPECÍFICAS POR SEÇÃO ===
 
 ${fieldInstructions.join('\n\n')}
 
 ${IMPORT_PROMPT_FOOTER}`;
     
     log('info', 'System prompt modular montado com sucesso', { 
       totalFields: validResults.length,
       totalChars: finalPrompt.length 
     });
     
     return finalPrompt;
     
   } catch (error) {
     log('error', 'Erro ao montar system prompt modular', { error: String(error) });
     throw error;
   }
 }
 
 /**
  * Valida se um system prompt tem a estrutura esperada
  */
 export function isValidSystemPrompt(prompt: string): boolean {
   if (!prompt || typeof prompt !== 'string') return false;
   if (prompt.length < 1000) return false;
   
   // Verificar se contém elementos essenciais
   const requiredElements = [
     'REGRAS GERAIS',
     'ESTRUTURA JSON',
     'INSTRUÇÕES',
     'vitima',
     'processo',
     'historico'
   ];
   
   return requiredElements.every(el => prompt.includes(el));
 }
 
 /**
  * Mapeia promptId para cardId da UI
  */
 function getCardIdForPrompt(promptId: string): string {
   const mapping: Record<string, string> = {
    prompt_import_vitima: 'periciando',
     prompt_import_processo: 'preliminares',
     prompt_import_historiaAcidente: 'periciando',
     prompt_import_historicoOcupacional: 'periciando',
     prompt_import_historiaAtual: 'periciando',
     prompt_import_antecedentes: 'periciando',
     prompt_import_tratamentos: 'periciando',
     prompt_import_afastamentos: 'periciando',
     prompt_import_postoTrabalho: 'posto-trabalho',
     prompt_import_ambienteAtividades: 'posto-trabalho',
     prompt_import_laudosMedicos: 'exame',
     prompt_import_examesComplementares: 'exame',
     prompt_import_exameFisico: 'exame',
     prompt_import_cids: 'analise-tecnica',
     prompt_import_incapacidade: 'analise-tecnica',
     prompt_import_nexoCausal: 'analise-tecnica',
     prompt_import_sequelas: 'conclusao',
     prompt_import_quesitos: 'conclusao',
     prompt_import_textosBrutos: 'resumo-autos',
     prompt_import_resumo: '_system'
   };
   return mapping[promptId] || '_system';
 }
 
 /**
  * Mapeia promptId para sectionId da UI
  */
 function getSectionIdForPrompt(promptId: string): string {
   const mapping: Record<string, string> = {
    prompt_import_vitima: 'vitima',
    prompt_import_processo: 'processo',
     prompt_import_historiaAcidente: 'acidente',
     prompt_import_historicoOcupacional: 'acidente',
     prompt_import_historiaAtual: 'anamnese',
     prompt_import_antecedentes: 'antecedentes',
     prompt_import_tratamentos: 'antecedentes',
     prompt_import_afastamentos: 'antecedentes',
     prompt_import_postoTrabalho: 'dados-posto',
     prompt_import_ambienteAtividades: 'dados-posto',
     prompt_import_laudosMedicos: 'laudos',
     prompt_import_examesComplementares: 'exames',
     prompt_import_exameFisico: 'exame-fisico',
     prompt_import_cids: 'descricao-doencas',
     prompt_import_incapacidade: 'analise-incapacidade',
     prompt_import_nexoCausal: 'nexo',
     prompt_import_sequelas: 'sequelas',
     prompt_import_quesitos: 'quesitos',
     prompt_import_textosBrutos: 'resumo',
     prompt_import_resumo: '_import'
   };
   return mapping[promptId] || '_import';
 }
 
 /**
  * Retorna a lista de todos os IDs de prompts de importação
  */
 export function getImportPromptIds(): string[] {
   return IMPORT_PROMPT_ORDER;
 }
 
 /**
  * Retorna os defaults de todos os prompts de importação
  */
 export function getImportPromptDefaults(): typeof DEFAULT_IMPORT_PROMPTS {
   return DEFAULT_IMPORT_PROMPTS;
 }