import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI, callPDFProvider } from "../_shared/ai-config.ts";
import { logToBackend, logError, logWarn, logInfo } from "../_shared/backend-logger.ts";
import { extractVisualContent, storeExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk, getFieldPrompt } from "../_shared/smart-chunker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout for individual summary generation (2 minutes)
const SUMMARY_TIMEOUT_MS = 120000;

const systemPrompt = `Você é um assistente especializado em análise de processos trabalhistas para médicos peritos. Analise os autos do processo e extraia TODAS as informações disponíveis para preencher um laudo pericial completo.

PRIORIDADE DE EXTRAÇÃO (em caso de documento extenso/truncado):
1. MÁXIMA PRIORIDADE: CIDs mencionados, nome da vítima, número do processo
2. ALTA PRIORIDADE: Descrição do acidente/doença, história atual, dados ocupacionais
3. MÉDIA PRIORIDADE: Quesitos, exames, tratamentos
4. NORMAL: Textos brutos completos (petição e contestação)

REGRAS GERAIS:
- Extraia APENAS o que está EXPLÍCITO no documento
- Campos não encontrados = "" (string vazia) ou [] (array vazio)
- Datas no formato: YYYY-MM-DD
- CPF no formato: XXX.XXX.XXX-XX
- CIDs: apenas códigos (ex: "J15.9", "M54.2")
- Seja detalhado nos campos de texto (história, descrições)

ESTRUTURA JSON A RETORNAR:
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
    "outros": []
  },
  "historico": {
    "historia_atual": "",
    "historico_ocupacional": "",
    "antecedentes_patologicos": "",
    "tratamentos_realizados": "",
    "afastamentos": ""
  },
  "exame_clinico": {
    "laudos_medicos": "",
    "exames_complementares": "",
    "lesoes_descritas": ""
  },
  "informacoes_medicas": {
    "cids_mencionados": [],
    "incapacidade_alegada": "",
    "nexo_sugerido": ""
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
}

INSTRUÇÕES ESPECÍFICAS:
1. VÍTIMA: Extraia todos os dados pessoais do periciando/reclamante. ATENÇÃO: "dominancia" é a MÃO DOMINANTE (destro, canhoto ou ambidestro), NÃO é gênero/sexo
2. PROCESSO: Número completo do processo, vara, partes
3. ACIDENTE: Data, descrição detalhada do evento, local
4. DOCUMENTOS: Marque true se o tipo de documento foi mencionado/anexado
5. HISTÓRICO: 
   - historia_atual: queixas atuais, sintomas relatados
   - historico_ocupacional: funções exercidas, tempo de serviço, atividades
   - antecedentes_patologicos: doenças prévias, cirurgias, condições anteriores
   - tratamentos_realizados: medicamentos, fisioterapia, cirurgias feitas
   - afastamentos: períodos de afastamento do trabalho, motivos
6. EXAME CLÍNICO:
   - laudos_medicos: resumo dos laudos médicos apresentados
   - exames_complementares: resultados de exames (imagem, laboratoriais)
   - lesoes_descritas: lesões mencionadas nos documentos
7. INFORMAÇÕES MÉDICAS:
   - cids_mencionados: lista de códigos CID encontrados
   - incapacidade_alegada: tipo de incapacidade mencionada
   - nexo_sugerido: "direto", "concausa", "agravamento" ou "" se não mencionado
8. QUESITOS: Se houver quesitos no documento, copie-os integralmente separados por categoria
9. TEXTOS BRUTOS - MUITO IMPORTANTE:
   - peticao_inicial: Copie o TEXTO COMPLETO da petição inicial (a íntegra ou o máximo possível)
   - contestacao: Copie o TEXTO COMPLETO da contestação (a íntegra ou o máximo possível)
   - Esses textos serão usados para gerar resumos técnicos posteriormente
10. RESUMO: Síntese breve do caso (máximo 300 caracteres)

FORMATO DE RESPOSTA OBRIGATÓRIO:
- Retorne APENAS o objeto JSON, sem markdown, sem \`\`\`, sem explicações.
- Comece diretamente com { e termine com }
- NÃO use blocos de código. Apenas JSON puro.`;

// Helper to try to fix truncated JSON - ROBUST VERSION
function tryFixTruncatedJson(jsonStr: string): object | null {
  if (!jsonStr || typeof jsonStr !== 'string') return null;
  
  // PASSO 1: Limpar entrada
  let cleaned = jsonStr.trim();
  
  // PASSO 2: Extrair JSON de blocos Markdown (```json ... ``` ou ``` ... ```)
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
    console.log('[tryFixTruncatedJson] Extracted JSON from Markdown block');
  } else {
    // Remover marcadores soltos no início/fim
    const hadMarkdown = cleaned.startsWith('```') || cleaned.endsWith('```');
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    if (hadMarkdown) {
      console.log('[tryFixTruncatedJson] Removed loose Markdown markers');
    }
  }
  
  // PASSO 3: Tentar parse direto primeiro
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  
  // PASSO 4: Escapar caracteres de controle dentro de strings JSON
  // Isso corrige newlines literais (\n real) dentro de valores de string
  // Usar abordagem mais segura sem lookbehind (compatibilidade com alguns runtimes)
  try {
    // Encontrar strings JSON e escapar caracteres de controle
    let inString = false;
    let escaped = false;
    let result = '';
    
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      
      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        result += char;
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }
      
      if (inString) {
        // Escapar caracteres de controle dentro de strings
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }
    cleaned = result;
  } catch (escapeError) {
    console.warn('[tryFixTruncatedJson] Control char escape failed:', escapeError);
  }
  
  // PASSO 5: Remover trailing commas antes de } ou ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  // PASSO 6: Tentar parse após limpeza
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  
  // PASSO 7: Fechar estruturas truncadas
  const openBraces = (cleaned.match(/{/g) || []).length;
  const closeBraces = (cleaned.match(/}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/]/g) || []).length;
  
  // Fechar string aberta (procurar aspas não balanceadas)
  const quoteCount = (cleaned.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    cleaned += '"';
    console.log('[tryFixTruncatedJson] Closed unclosed string');
  }
  
  // Fechar arrays
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    cleaned += ']';
  }
  
  // Fechar objetos
  for (let i = 0; i < openBraces - closeBraces; i++) {
    cleaned += '}';
  }
  
  if (openBrackets !== closeBrackets || openBraces !== closeBraces) {
    console.log(`[tryFixTruncatedJson] Auto-closed structures: added ${openBrackets - closeBrackets} ] and ${openBraces - closeBraces} }`);
  }
  
  // PASSO 8: Parse final
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[tryFixTruncatedJson] Could not fix JSON:', e);
    console.error('[tryFixTruncatedJson] First 300 chars:', cleaned.substring(0, 300));
    console.error('[tryFixTruncatedJson] Last 300 chars:', cleaned.slice(-300));
    return null;
  }
}

// Helper to create a valid structure with defaults
function ensureValidStructure(data: any): object {
  const defaultStructure = {
    vitima: { nome: "", cpf: "", data_nascimento: "", profissao: "", escolaridade: "", dominancia: "" },
    processo: { numero: "", vara: "", reclamante: "", reclamada: "" },
    acidente: { data: "", descricao: "", local: "" },
    documentos_checklist: { cat: false, prontuario: false, receitas: false, exames: false, laudos_anteriores: false, atestados: false, outros: [] },
    historico: { historia_atual: "", historico_ocupacional: "", antecedentes_patologicos: "", tratamentos_realizados: "", afastamentos: "" },
    exame_clinico: { laudos_medicos: "", exames_complementares: "", lesoes_descritas: "" },
    informacoes_medicas: { cids_mencionados: [], incapacidade_alegada: "", nexo_sugerido: "" },
    quesitos: { juizo: "", reclamante: "", reclamada: "" },
    textos_brutos: { peticao_inicial: "", contestacao: "" },
    resumo: ""
  };

  if (!data || typeof data !== 'object') {
    return defaultStructure;
  }

  return {
    vitima: { ...defaultStructure.vitima, ...(data.vitima || {}) },
    processo: { ...defaultStructure.processo, ...(data.processo || {}) },
    acidente: { ...defaultStructure.acidente, ...(data.acidente || {}) },
    documentos_checklist: { ...defaultStructure.documentos_checklist, ...(data.documentos_checklist || {}) },
    historico: { ...defaultStructure.historico, ...(data.historico || {}) },
    exame_clinico: { ...defaultStructure.exame_clinico, ...(data.exame_clinico || {}) },
    informacoes_medicas: { ...defaultStructure.informacoes_medicas, ...(data.informacoes_medicas || {}) },
    quesitos: { ...defaultStructure.quesitos, ...(data.quesitos || {}) },
    textos_brutos: { ...defaultStructure.textos_brutos, ...(data.textos_brutos || {}) },
    resumo: data.resumo || ""
  };
}

// Get prompt based on summary type
function getPromptForType(tipo: string, ctx: any): string {
  const prompts: Record<string, string> = {
    resumo_peticao: `
Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial médico trabalhista.

Texto da Petição Inicial:
${ctx.peticaoInicial || 'Não informado'}

Instruções:
- Resuma os pontos principais alegados pelo reclamante
- Destaque as doenças/lesões mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos
`,
    resumo_contestacao: `
Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da contestação para um laudo pericial médico trabalhista.

Texto da Contestação:
${ctx.contestacao || 'Não informado'}

Instruções:
- Resuma os pontos principais alegados pela reclamada
- Destaque os argumentos contrários ao nexo causal
- Identifique documentos ou evidências mencionadas
- Mencione os pedidos de improcedência
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos
`,
    descricao_doencas: `
Você é um perito médico especialista em medicina do trabalho. Elabore uma descrição técnica detalhada das doenças identificadas para um laudo pericial.

CIDs identificados:
${ctx.cids || 'Não informado'}

Informações adicionais:
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}

Instruções:
Para cada CID mencionado, forneça:
1. Nome da doença e código CID-10
2. Definição técnica
3. Etiologia (causas possíveis)
4. Sintomas característicos
5. Fatores de risco ocupacionais (quando aplicável)
6. Relação com atividades laborais descritas

Use linguagem técnica médica apropriada para laudo pericial.
`,
    nexo_causal: `
Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica do nexo causal para um laudo pericial médico trabalhista.

Dados para análise:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- História do acidente/doença: ${ctx.historiaAcidente || 'Não informado'}
- História atual: ${ctx.historiaAtual || 'Não informado'}
- Exame físico: ${ctx.exameFisico || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Antecedentes patológicos: ${ctx.antecedentes || 'Não informado'}

Instruções:
Analise o nexo causal utilizando os critérios de Bradford-Hill e Simonin:
1. Plausibilidade biológica
2. Força da associação
3. Temporalidade
4. Consistência
5. Especificidade
6. Gradiente dose-resposta

Classifique o nexo como: Direto, Concausa, Agravamento ou Sem Nexo Causal.
Fundamente tecnicamente sua conclusão citando evidências clínicas e documentais.
`,
    incapacidade: `
Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica da incapacidade laboral para um laudo pericial.

Dados para análise:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Exame físico: ${ctx.exameFisico || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Tratamentos realizados: ${ctx.tratamentos || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}

Instruções:
Analise a capacidade laboral considerando:
1. Tipo de incapacidade (parcial/total, temporária/permanente)
2. Limitações funcionais identificadas no exame físico
3. Compatibilidade com a função exercida
4. Possibilidade de reabilitação profissional
5. Necessidade de readaptação de função
6. Impacto nas atividades de vida diária

Fundamente tecnicamente sua análise com base nos achados clínicos e exames.
`,
    referencias_bibliograficas: `
Você é um perito médico especialista em medicina do trabalho. Com base nas informações do processo, identifique e liste referências bibliográficas pertinentes e específicas para o caso.

DADOS DO CASO:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- História do acidente/doença: ${ctx.historiaAcidente || 'Não informado'}
- Tratamentos realizados: ${ctx.tratamentos || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Laudos médicos: ${ctx.laudosMedicos || 'Não informado'}
- Lesões descritas: ${ctx.lesoesDescritas || 'Não informado'}

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

Forneça referências que realmente embasem tecnicamente o laudo para este caso específico.
`
  };

  return prompts[tipo] || '';
}

const summarySystemPrompt = 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.';

// Generate AI summaries using configured AI provider
async function gerarResumosIA(
  extractedData: any, 
  supabaseAdmin: any, 
  jobId: string,
  userId: string
): Promise<{
  resumos: {
    resumo_peticao: string;
    resumo_contestacao: string;
    descricao_doencas: string;
    nexo_causal: string;
    incapacidade: string;
    referencias_bibliograficas: string;
  };
  aiInfo: {
    provider: string;
    model: string;
    summariesGenerated: number;
    summariesFailed: string[];  // NEW: lista de resumos que falharam
    errors: Record<string, string>;  // NEW: mensagens de erro por tipo
  };
}> {
const results = {
    resumo_peticao: '',
    resumo_contestacao: '',
    descricao_doencas: '',
    nexo_causal: '',
    incapacidade: '',
    referencias_bibliograficas: ''
  };

  // Buscar configuração de IA
  const aiConfig = await getAIConfig();
  console.log(`[gerarResumosIA] Using AI Config - Provider: ${aiConfig.provider}, Model: ${aiConfig.model}`);

  if (!aiConfig.apiKey) {
    console.warn('[gerarResumosIA] No API key configured, skipping AI summaries');
    return {
      resumos: results,
      aiInfo: { provider: 'none', model: 'none', summariesGenerated: 0, summariesFailed: [], errors: {} }
    };
  }

  const contexto = {
    peticaoInicial: extractedData.textos_brutos?.peticao_inicial || '',
    contestacao: extractedData.textos_brutos?.contestacao || '',
    cids: Array.isArray(extractedData.informacoes_medicas?.cids_mencionados) && extractedData.informacoes_medicas.cids_mencionados.length > 0
      ? extractedData.informacoes_medicas.cids_mencionados.join(', ') 
      : '',
    postoTrabalho: '',
    atividadesLaborais: '',
    historicoOcupacional: extractedData.historico?.historico_ocupacional || '',
    exameFisico: '',
    examesComplementares: extractedData.exame_clinico?.exames_complementares || '',
    antecedentes: extractedData.historico?.antecedentes_patologicos || '',
    tratamentos: extractedData.historico?.tratamentos_realizados || '',
    historiaAcidente: extractedData.acidente?.descricao || '',
    historiaAtual: extractedData.historico?.historia_atual || '',
    laudosMedicos: extractedData.exame_clinico?.laudos_medicos || '',
    lesoesDescritas: extractedData.exame_clinico?.lesoes_descritas || ''
  };

  // Log context availability for debugging
  console.log('[gerarResumosIA] Contexto disponível:', {
    peticaoInicial: contexto.peticaoInicial ? `${contexto.peticaoInicial.length} chars` : 'VAZIO',
    contestacao: contexto.contestacao ? `${contexto.contestacao.length} chars` : 'VAZIO',
    cids: contexto.cids || 'VAZIO',
    historicoOcupacional: contexto.historicoOcupacional ? `${contexto.historicoOcupacional.length} chars` : 'VAZIO',
    historiaAcidente: contexto.historiaAcidente ? `${contexto.historiaAcidente.length} chars` : 'VAZIO',
    historiaAtual: contexto.historiaAtual ? `${contexto.historiaAtual.length} chars` : 'VAZIO',
    examesComplementares: contexto.examesComplementares ? `${contexto.examesComplementares.length} chars` : 'VAZIO',
    laudosMedicos: contexto.laudosMedicos ? `${contexto.laudosMedicos.length} chars` : 'VAZIO',
    lesoesDescritas: contexto.lesoesDescritas ? `${contexto.lesoesDescritas.length} chars` : 'VAZIO',
    antecedentes: contexto.antecedentes ? `${contexto.antecedentes.length} chars` : 'VAZIO',
    tratamentos: contexto.tratamentos ? `${contexto.tratamentos.length} chars` : 'VAZIO'
  });

  // More flexible conditions - generate summaries if we have ANY relevant context
  const hasHistoryContext = !!contexto.historiaAtual || !!contexto.historiaAcidente || !!contexto.historicoOcupacional;
  const hasMedicalContext = !!contexto.cids || !!contexto.examesComplementares || !!contexto.laudosMedicos || !!contexto.lesoesDescritas;

  const summariesToGenerate: Array<{ tipo: string; shouldGenerate: boolean; step: string; progress: number }> = [
    { tipo: 'resumo_peticao', shouldGenerate: !!contexto.peticaoInicial, step: 'Gerando resumo da petição inicial...', progress: 45 },
    { tipo: 'resumo_contestacao', shouldGenerate: !!contexto.contestacao, step: 'Gerando resumo da contestação...', progress: 55 },
    // descricao_doencas: gerar se tiver CIDs, ou se tiver histórico ou dados médicos relevantes
    { tipo: 'descricao_doencas', shouldGenerate: !!contexto.cids || hasHistoryContext || hasMedicalContext, step: 'Gerando descrição técnica das doenças...', progress: 65 },
    // nexo_causal: gerar se tiver qualquer contexto relevante
    { tipo: 'nexo_causal', shouldGenerate: !!contexto.cids || hasHistoryContext || hasMedicalContext, step: 'Analisando nexo causal...', progress: 75 },
    // incapacidade: gerar se tiver CIDs, exames, histórico ou dados médicos
    { tipo: 'incapacidade', shouldGenerate: !!contexto.cids || !!contexto.examesComplementares || hasHistoryContext || hasMedicalContext, step: 'Analisando incapacidade laboral...', progress: 85 },
    // referencias_bibliograficas: gerar se tiver qualquer contexto relevante
    { tipo: 'referencias_bibliograficas', shouldGenerate: !!contexto.cids || hasHistoryContext || hasMedicalContext, step: 'Gerando referências bibliográficas...', progress: 92 }
  ];

  // Log which summaries will be generated vs skipped
  for (const { tipo, shouldGenerate } of summariesToGenerate) {
    if (!shouldGenerate) {
      console.log(`[gerarResumosIA] Pulando ${tipo} - dados insuficientes`);
    }
  }

  let summariesGenerated = 0;
  const summaryErrors: string[] = [];

  // Generate summaries sequentially with progress updates
  for (const { tipo, shouldGenerate, step, progress } of summariesToGenerate) {
    if (!shouldGenerate) continue;

    try {
      // Update progress with step_id for frontend tracking
      await supabaseAdmin
        .from('import_jobs')
        .update({ 
          progress, 
          current_step: step,
          step_id: tipo,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      console.log(`[gerarResumosIA] Generating: ${tipo} with ${aiConfig.provider}/${aiConfig.model}`);
      
      const prompt = getPromptForType(tipo, contexto);
      
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout após ${SUMMARY_TIMEOUT_MS/1000}s aguardando resposta da IA`)), SUMMARY_TIMEOUT_MS);
      });
      
      // Race between AI call and timeout
      const result = await Promise.race([
        callAI(aiConfig, summarySystemPrompt, prompt, {
          promptType: tipo,
          userId: userId
        }),
        timeoutPromise
      ]);
      
      console.log(`[gerarResumosIA] Successfully generated ${tipo}`);
      
      if (tipo in results) {
        (results as any)[tipo] = result.text;
        summariesGenerated++;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[gerarResumosIA] Error generating ${tipo}:`, error);
      summaryErrors.push(`${tipo}: ${errorMsg}`);
      
      // Log error to backend_logs for visibility in DevPanel
      await logError('processar-autos', `Falha ao gerar ${tipo}: ${errorMsg}`, jobId, { 
        tipo, 
        provider: aiConfig.provider, 
        model: aiConfig.model 
      });
    }
  }

  // Criar mapa de erros para frontend
  const errorsMap: Record<string, string> = {};
  for (const errMsg of summaryErrors) {
    const colonIdx = errMsg.indexOf(': ');
    if (colonIdx > 0) {
      const tipo = errMsg.substring(0, colonIdx);
      const msg = errMsg.substring(colonIdx + 2);
      errorsMap[tipo] = msg;
    }
  }
  
  // Identificar quais falharam
  const failedTypes = Object.keys(errorsMap);

  // Log warning se houver falhas parciais
  if (failedTypes.length > 0) {
    await logWarn('processar-autos', 
      `Processamento parcial: ${summariesGenerated}/${summariesToGenerate.filter(s => s.shouldGenerate).length} resumos gerados`, 
      jobId, {
        summariesGenerated,
        failed: failedTypes,
        errors: errorsMap
      }
    );
  }

  return {
    resumos: results,
    aiInfo: {
      provider: aiConfig.provider,
      model: aiConfig.model,
      summariesGenerated,
      summariesFailed: failedTypes,
      errors: errorsMap
    }
  };
}

// Background processing function
async function processarPDFBackground(
  jobId: string,
  pdfBase64: string,
  fileName: string,
  supabaseAdmin: any,
  isRetry: boolean = false,
  userId: string
) {
  let modelUsed = 'unknown';
  let attemptId: string | null = null;
  
  // Timing tracking
  const timings = {
    total: { start: Date.now(), end: 0 },
    pdfExtraction: { start: 0, end: 0 },
    summaries: { start: 0, end: 0 }
  };
  
  try {
    // Log job start
    await logInfo('processar-autos', `Iniciando processamento de PDF: ${fileName}`, jobId, {
      isRetry,
      pdfSizeChars: pdfBase64.length
    });

    // Get current retry_count from job
    const { data: jobData } = await supabaseAdmin
      .from('import_jobs')
      .select('retry_count')
      .eq('id', jobId)
      .single();
    
    const currentRetryCount = jobData?.retry_count || 0;
    const attemptNumber = isRetry ? currentRetryCount + 1 : 1;

    // Create attempt record
    const { data: attemptData, error: attemptError } = await supabaseAdmin
      .from('import_attempts')
      .insert({
        job_id: jobId,
        attempt_number: attemptNumber,
        status: 'processing'
      })
      .select('id')
      .single();

    if (!attemptError && attemptData) {
      attemptId = attemptData.id;
      console.log(`[processar-autos] Created attempt #${attemptNumber} (${attemptId}) for job ${jobId}`);
    }

    // If retry, increment retry_count on the job
    if (isRetry) {
      await supabaseAdmin
        .from('import_jobs')
        .update({ 
          retry_count: attemptNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    // Update progress: Starting
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        progress: 5, 
        current_step: isRetry ? 'Reprocessando PDF...' : 'Enviando PDF para análise...',
        step_id: 'upload',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[processar-autos] Processing PDF: ${fileName}, size: ${pdfBase64.length} chars`);

    // Fetch import strategy configuration
    const { data: strategyData } = await supabaseAdmin
      .from('system_config')
      .select('id, value')
      .in('id', ['import_strategy', 'text_fill_provider', 'text_fill_model', 'store_extracted_text', 'phase1_gemini_model']);

    const strategyMap: Record<string, any> = {};
    strategyData?.forEach((item: { id: string; value: any }) => { strategyMap[item.id] = item.value; });

    const usesTwoPhase = strategyMap.import_strategy === 'two_phase';
    console.log(`[processar-autos] Import strategy: ${usesTwoPhase ? 'two_phase' : 'single_pass'}`);

    let extractedData: any;
    let extractedContentPath: string | null = null;
    let visionResult: any = null;

    if (usesTwoPhase) {
      // === TWO-PHASE EXTRACTION ===
      console.log('[processar-autos] Starting TWO-PHASE extraction...');

      // PHASE 1: Visual Extraction with Gemini OCR
      await supabaseAdmin.from('import_jobs').update({ 
        progress: 10, 
        current_step: 'Fase 1: Extraindo texto com OCR...', 
        step_id: 'extraction',
        updated_at: new Date().toISOString()
      }).eq('id', jobId);

      timings.pdfExtraction.start = Date.now();

      // Determine if we need Files API for large PDFs (> 50MB)
      const pdfSizeBytes = Math.ceil(pdfBase64.length * 3 / 4);
      const useFilesAPI = pdfSizeBytes > 50_000_000;
      console.log(`[processar-autos] PDF size: ${(pdfSizeBytes / (1024 * 1024)).toFixed(2)}MB, useFilesAPI: ${useFilesAPI}`);

      // Get Phase 1 model from config (synchronized with Provider Inventory)
      const phase1Model = strategyMap.phase1_gemini_model || 'gemini-2.5-flash';
      console.log(`[processar-autos] Phase 1 using model: ${phase1Model}`);

      try {
        const extracted = await extractVisualContent(pdfBase64, { 
          useFilesAPI,
          model: phase1Model 
        });
        
        timings.pdfExtraction.end = Date.now();
        modelUsed = `${extracted.provider}/${extracted.model}`;
        
        console.log(`[processar-autos] Phase 1 completed - rawText length: ${extracted.rawText.length}, pages: ${extracted.pageCount}`);

        // Validate extraction result
        if (!extracted.rawText || extracted.rawText.length < 500) {
          throw new Error('Extração visual retornou texto muito curto, fazendo fallback para passagem única');
        }

        // Store extracted content in bucket (if configured)
        if (strategyMap.store_extracted_text !== false) {
          try {
            extractedContentPath = await storeExtractedContent(extracted, userId, jobId);
            console.log(`[processar-autos] Extracted content stored at: ${extractedContentPath}`);
          } catch (storageError) {
            console.warn('[processar-autos] Failed to store extracted content:', storageError);
            // Continue without storage - not critical
          }
        }

        // PHASE 2: Field Filling with Flexible Provider
        await supabaseAdmin.from('import_jobs').update({ 
          progress: 35, 
          current_step: 'Fase 2: Preenchendo campos...', 
          step_id: 'processing',
          updated_at: new Date().toISOString()
        }).eq('id', jobId);

        console.log('[processar-autos] Starting Phase 2 - structured field filling...');
        
        const fillProvider = strategyMap.text_fill_provider || 'lovable';
        const fillModel = strategyMap.text_fill_model || 'google/gemini-3-flash-preview';
        
        // Use the existing AI config for field filling (text only, no PDF)
        const aiConfig = await getAIConfig();
        
        // Smart truncation to prevent MAX_TOKENS in Phase 2 response
        let textForFilling = extracted.rawText;
        const MAX_INPUT_CHARS = 200_000; // ~50k tokens para entrada

        if (textForFilling.length > MAX_INPUT_CHARS) {
          console.warn(`[processar-autos] Text too long (${textForFilling.length} chars), applying smart truncation`);
          
          // Preservar início (dados do processo, petição) e fim (quesitos)
          const headChars = Math.floor(MAX_INPUT_CHARS * 0.6); // 60% início
          const tailChars = Math.floor(MAX_INPUT_CHARS * 0.35); // 35% fim
          const separator = '\n\n[... conteúdo intermediário omitido para processamento - seções detectadas preservadas ...]\n\n';
          
          textForFilling = textForFilling.substring(0, headChars) + 
                           separator + 
                           textForFilling.substring(textForFilling.length - tailChars);
          
          console.log(`[processar-autos] Truncated to ${textForFilling.length} chars (head: ${headChars}, tail: ${tailChars})`);
        }
        
        // Call AI with the extracted raw text (no binary PDF!)
        // Use high maxOutputTokens to prevent JSON truncation
        const fillResult = await callAI(
          { ...aiConfig, provider: fillProvider, model: fillModel },
          systemPrompt,
          `Analise o seguinte texto extraído de um documento de processo trabalhista e retorne o JSON estruturado:\n\n${textForFilling}`,
          { promptType: 'two_phase_fill', userId, maxOutputTokens: 65536, jsonMode: true }
        );

        modelUsed = `${fillProvider}/${fillModel}`;

        // Parse the structured response
        let parsedResult = tryFixTruncatedJson(fillResult.text);
        if (!parsedResult) {
          // LOG DETALHADO para diagnóstico
          console.error('[processar-autos] Phase 2 JSON parsing failed');
          console.error('[processar-autos] Raw text length:', fillResult.text?.length);
          console.error('[processar-autos] Raw text preview (first 500):', fillResult.text?.substring(0, 500));
          console.error('[processar-autos] Raw text ending (last 500):', fillResult.text?.slice(-500));
          
          // Salvar texto bruto para análise posterior no backend_logs
          await logError('processar-autos', 'Phase 2 JSON parse failed', jobId, {
            textLength: fillResult.text?.length,
            textPreview: fillResult.text?.substring(0, 1000),
            textEnding: fillResult.text?.slice(-500)
          });
          
          throw new Error('Fase 2 falhou na estruturação');
        }

        extractedData = ensureValidStructure(parsedResult);

        // Add extracted content path to result for regeneration
        if (extractedContentPath) {
          (extractedData as any).extracted_content_path = extractedContentPath;
        }

        // Create a mock visionResult for compatibility with downstream code
        visionResult = {
          provider: fillProvider,
          model: fillModel,
          finishReason: 'STOP',
          text: fillResult.text,
          usedFallback: false
        };

        console.log('[processar-autos] Two-phase extraction completed successfully');

      } catch (twoPhaseError) {
        // FALLBACK: If two-phase fails, use single pass
        console.warn('[processar-autos] Two-phase extraction failed, falling back to single pass:', twoPhaseError);
        
        await logWarn('processar-autos', `Duas fases falhou, usando passagem única: ${twoPhaseError instanceof Error ? twoPhaseError.message : 'Erro'}`, jobId);
        
        // Reset timing
        timings.pdfExtraction.start = Date.now();
        
        await supabaseAdmin.from('import_jobs').update({ 
          progress: 10, 
          current_step: 'Extraindo dados do PDF com IA (modo único)...', 
          step_id: 'extraction',
          updated_at: new Date().toISOString()
        }).eq('id', jobId);
        
        visionResult = await callPDFProvider(pdfBase64, systemPrompt, {
          promptType: 'pdf_extraction',
          userId: userId
        });
        
        timings.pdfExtraction.end = Date.now();
        modelUsed = `${visionResult.provider}/${visionResult.model}`;
        
        const parsed = tryFixTruncatedJson(visionResult.text);
        if (!parsed) {
          throw new Error("Não foi possível processar a resposta da IA");
        }
        extractedData = ensureValidStructure(parsed);
      }

    } else {
      // === SINGLE PASS EXTRACTION (Original flow) ===
      console.log('[processar-autos] Using SINGLE-PASS extraction...');

      await supabaseAdmin
        .from('import_jobs')
        .update({ 
          progress: 10, 
          current_step: 'Extraindo dados do PDF com IA...',
          step_id: 'extraction',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      timings.pdfExtraction.start = Date.now();
      
      visionResult = await callPDFProvider(pdfBase64, systemPrompt, {
        promptType: 'pdf_extraction',
        userId: userId
      });
      
      timings.pdfExtraction.end = Date.now();
      modelUsed = `${visionResult.provider}/${visionResult.model}`;
      
      console.log(`[processar-autos] PDF provider response - Provider: ${visionResult.provider}, Model: ${visionResult.model}`);

      if (!visionResult.text) {
        throw new Error("Resposta inválida da IA - nenhum conteúdo extraído");
      }

      await supabaseAdmin
        .from('import_jobs')
        .update({ 
          progress: 40, 
          current_step: 'Processando dados extraídos...',
          step_id: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      const parsed = tryFixTruncatedJson(visionResult.text);
      if (!parsed) {
        console.error("[processar-autos] Failed to parse response as JSON:", visionResult.text.substring(0, 500));
        throw new Error("Não foi possível processar a resposta da IA");
      }

      extractedData = ensureValidStructure(parsed);
    }

    if (visionResult?.finishReason === "MAX_TOKENS") {
      console.warn("[processar-autos] Response was truncated due to max tokens limit");
    }
    console.log("[processar-autos] Successfully extracted data from PDF");

    // Generate AI summaries with progress updates
    console.log("[processar-autos] Starting AI summary generation...");
    
    // Start summaries timing
    timings.summaries.start = Date.now();
    
    const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId);
    
    // End summaries timing
    timings.summaries.end = Date.now();
    
    console.log("[processar-autos] AI summaries generated successfully");

    // Add resumos to extracted data
    (extractedData as any).resumos_ia = resumosResult.resumos;

    // Update progress: Finalizing
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        progress: 95, 
        current_step: 'Finalizando processamento...',
        step_id: 'finalizing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // End total timing
    timings.total.end = Date.now();

    // Calculate durations
    const pdfExtractionDuration = timings.pdfExtraction.end - timings.pdfExtraction.start;
    const summariesDuration = timings.summaries.end - timings.summaries.start;
    const totalDuration = timings.total.end - timings.total.start;

    console.log(`[processar-autos] Timing - PDF Extraction: ${pdfExtractionDuration}ms, Summaries: ${summariesDuration}ms, Total: ${totalDuration}ms`);

    // Build result with detailed AI usage info
    const result = {
      success: true,
      data: extractedData,
      extracted_content_path: extractedContentPath, // For regeneration
      // NEW: Inform frontend about partial failures
      partialFailures: resumosResult.aiInfo.summariesFailed.length > 0 ? {
        failedSummaries: resumosResult.aiInfo.summariesFailed,
        errors: resumosResult.aiInfo.errors
      } : null,
      aiUsage: {
        pdfExtraction: {
          provider: visionResult?.provider || 'unknown',
          model: modelUsed,
          durationMs: pdfExtractionDuration,
          usedFallback: visionResult?.usedFallback || false,
          originalProvider: visionResult?.originalProvider,
          fallbackReason: visionResult?.fallbackReason,
          strategy: usesTwoPhase ? 'two_phase' : 'single_pass'
        },
        summaries: {
          provider: resumosResult.aiInfo.provider,
          model: resumosResult.aiInfo.model,
          count: resumosResult.aiInfo.summariesGenerated,
          durationMs: summariesDuration,
          failedSummaries: resumosResult.aiInfo.summariesFailed
        },
        totalDurationMs: totalDuration
      },
      truncated: visionResult?.finishReason === "MAX_TOKENS"
    };

    // Update attempt record with success
    if (attemptId) {
      await supabaseAdmin
        .from('import_attempts')
        .update({
          status: 'completed',
          result: {
            summariesCount: resumosResult.aiInfo.summariesGenerated,
            truncated: visionResult.finishReason === "MAX_TOKENS",
            model: modelUsed,
            totalDurationMs: totalDuration
          },
          completed_at: new Date().toISOString()
        })
        .eq('id', attemptId);
    }

    // Save result as completed
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        status: 'completed',
        progress: 100, 
        current_step: 'Processamento concluído!',
        step_id: 'completed',
        result: result,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[processar-autos] Job ${jobId} completed successfully with model: ${modelUsed}`);

    // Log success to backend_logs
    await logInfo('processar-autos', `Job concluído com sucesso`, jobId, {
      model: modelUsed,
      totalDurationMs: totalDuration,
      pdfExtractionDurationMs: pdfExtractionDuration,
      summariesDurationMs: summariesDuration,
      summariesGenerated: resumosResult.aiInfo.summariesGenerated
    });

  } catch (error) {
    console.error(`[processar-autos] Job ${jobId} failed:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido no processamento';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log error to backend_logs for visibility in DevPanel
    await logError('processar-autos', `Job falhou: ${errorMessage}`, jobId, {
      errorMessage,
      errorStack,
      modelUsed
    });
    
    // Update attempt record with failure
    if (attemptId) {
      await supabaseAdmin
        .from('import_attempts')
        .update({
          status: 'failed',
          error: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', attemptId);
    }
    
    // Save error
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        status: 'failed',
        error: errorMessage,
        current_step: 'Erro no processamento',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName, filePath, retryFilePath } = await req.json();

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse JWT payload to extract user ID (safe because Supabase validates signature upstream)
    function parseJwtPayload(token: string): { sub?: string; exp?: number } | null {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = parts[1];
        // Base64url decode
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    }

    // Get user_id from auth token by decoding JWT
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const claims = parseJwtPayload(token);
      
      if (claims?.sub) {
        // Optionally check if token is expired
        const now = Math.floor(Date.now() / 1000);
        if (claims.exp && claims.exp < now) {
          console.warn('[processar-autos] Token expired');
        } else {
          userId = claims.sub;
          console.log('[processar-autos] User authenticated via JWT decode:', userId);
        }
      } else {
        console.warn('[processar-autos] Failed to parse JWT claims');
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a retry request
    const isRetry = !!retryFilePath && !pdfBase64;
    let finalPdfBase64 = pdfBase64;
    let finalFilePath = filePath || retryFilePath;

    if (isRetry) {
      console.log('[processar-autos] Retry mode - fetching PDF from storage:', retryFilePath);
      
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('processos-pdf')
        .download(retryFilePath);
      
      if (downloadError || !fileData) {
        console.error('[processar-autos] Error downloading PDF for retry:', downloadError);
        return new Response(
          JSON.stringify({ error: "Falha ao recuperar PDF do armazenamento" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Convert to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      finalPdfBase64 = btoa(binary);
      console.log(`[processar-autos] Retry: PDF loaded from storage, size: ${finalPdfBase64.length} chars`);
    } else if (!pdfBase64 || !fileName) {
      return new Response(
        JSON.stringify({ error: "pdfBase64 e fileName são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create job record with file_path for retry capability
    const { data: job, error: jobError } = await supabaseAdmin
      .from('import_jobs')
      .insert({
        user_id: userId,
        status: 'processing',
        progress: 0,
        current_step: isRetry ? 'Reprocessando documento...' : 'Iniciando processamento...',
        file_path: finalFilePath || null
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error("[processar-autos] Error creating job:", jobError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar job de processamento" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobId = job.id;
    console.log(`[processar-autos] Created job ${jobId} for user ${userId}${isRetry ? ' (RETRY)' : ''}`);

    // Start background processing using EdgeRuntime.waitUntil
    // @ts-ignore - EdgeRuntime exists in Supabase Edge Functions
    EdgeRuntime.waitUntil(processarPDFBackground(jobId, finalPdfBase64, fileName, supabaseAdmin, isRetry, userId));

    // Return immediately with jobId
    return new Response(
      JSON.stringify({ 
        jobId,
        message: isRetry 
          ? "Reprocessamento iniciado. Use o endpoint check-import-status para acompanhar."
          : "Processamento iniciado. Use o endpoint check-import-status para acompanhar." 
      }),
      { 
        status: 202, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error("[processar-autos] Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
