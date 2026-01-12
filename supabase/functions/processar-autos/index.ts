import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI, callGeminiVision } from "../_shared/ai-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
10. RESUMO: Síntese breve do caso (máximo 300 caracteres)`;

// Helper to try to fix truncated JSON
function tryFixTruncatedJson(jsonStr: string): object | null {
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to fix common truncation issues
  }

  let fixed = jsonStr.trim();
  fixed = fixed.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;

  if (fixed.match(/"[^"]*$/)) {
    fixed += '"';
  }

  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    fixed += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    fixed += '}';
  }

  try {
    return JSON.parse(fixed);
  } catch {
    console.error('Could not fix truncated JSON');
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
`
  };

  return prompts[tipo] || '';
}

const summarySystemPrompt = 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.';

// Generate AI summaries using configured AI provider
async function gerarResumosIA(extractedData: any, supabaseAdmin: any, jobId: string): Promise<{
  resumos: {
    resumo_peticao: string;
    resumo_contestacao: string;
    descricao_doencas: string;
    nexo_causal: string;
    incapacidade: string;
  };
  aiInfo: {
    provider: string;
    model: string;
    summariesGenerated: number;
  };
}> {
  const results = {
    resumo_peticao: '',
    resumo_contestacao: '',
    descricao_doencas: '',
    nexo_causal: '',
    incapacidade: ''
  };

  // Buscar configuração de IA
  const aiConfig = await getAIConfig();
  console.log(`[gerarResumosIA] Using AI Config - Provider: ${aiConfig.provider}, Model: ${aiConfig.model}`);

  if (!aiConfig.apiKey) {
    console.warn('[gerarResumosIA] No API key configured, skipping AI summaries');
    return {
      resumos: results,
      aiInfo: { provider: 'none', model: 'none', summariesGenerated: 0 }
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
    { tipo: 'resumo_peticao', shouldGenerate: !!contexto.peticaoInicial, step: 'Gerando resumo da petição inicial...', progress: 50 },
    { tipo: 'resumo_contestacao', shouldGenerate: !!contexto.contestacao, step: 'Gerando resumo da contestação...', progress: 60 },
    // descricao_doencas: gerar se tiver CIDs, ou se tiver histórico ou dados médicos relevantes
    { tipo: 'descricao_doencas', shouldGenerate: !!contexto.cids || hasHistoryContext || hasMedicalContext, step: 'Gerando descrição técnica das doenças...', progress: 70 },
    // nexo_causal: gerar se tiver qualquer contexto relevante
    { tipo: 'nexo_causal', shouldGenerate: !!contexto.cids || hasHistoryContext || hasMedicalContext, step: 'Analisando nexo causal...', progress: 80 },
    // incapacidade: gerar se tiver CIDs, exames, histórico ou dados médicos
    { tipo: 'incapacidade', shouldGenerate: !!contexto.cids || !!contexto.examesComplementares || hasHistoryContext || hasMedicalContext, step: 'Analisando incapacidade laboral...', progress: 90 }
  ];

  // Log which summaries will be generated vs skipped
  for (const { tipo, shouldGenerate } of summariesToGenerate) {
    if (!shouldGenerate) {
      console.log(`[gerarResumosIA] Pulando ${tipo} - dados insuficientes`);
    }
  }

  let summariesGenerated = 0;

  // Generate summaries sequentially with progress updates
  for (const { tipo, shouldGenerate, step, progress } of summariesToGenerate) {
    if (!shouldGenerate) continue;

    try {
      // Update progress
      await supabaseAdmin
        .from('import_jobs')
        .update({ 
          progress, 
          current_step: step,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      console.log(`[gerarResumosIA] Generating: ${tipo} with ${aiConfig.provider}/${aiConfig.model}`);
      
      const prompt = getPromptForType(tipo, contexto);
      const result = await callAI(aiConfig, summarySystemPrompt, prompt, {
        promptType: tipo
      });
      
      console.log(`[gerarResumosIA] Successfully generated ${tipo}`);
      
      if (tipo in results) {
        (results as any)[tipo] = result.text;
        summariesGenerated++;
      }
    } catch (error) {
      console.error(`[gerarResumosIA] Error generating ${tipo}:`, error);
    }
  }

  return {
    resumos: results,
    aiInfo: {
      provider: aiConfig.provider,
      model: aiConfig.model,
      summariesGenerated
    }
  };
}

// Background processing function
async function processarPDFBackground(
  jobId: string,
  pdfBase64: string,
  fileName: string,
  supabaseAdmin: any
) {
  let modelUsed = 'unknown';
  
  // Timing tracking
  const timings = {
    total: { start: Date.now(), end: 0 },
    pdfExtraction: { start: 0, end: 0 },
    summaries: { start: 0, end: 0 }
  };
  
  try {
    // Update progress: Starting
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        progress: 5, 
        current_step: 'Enviando PDF para análise...',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[processar-autos] Processing PDF: ${fileName}, size: ${pdfBase64.length} chars`);

    // Update progress: Calling AI for PDF extraction
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        progress: 10, 
        current_step: 'Extraindo dados do PDF com IA...',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Use the shared Gemini Vision function that respects DevPanel config
    console.log(`[processar-autos] Calling Gemini Vision for PDF extraction...`);
    
    // Start PDF extraction timing
    timings.pdfExtraction.start = Date.now();
    
    const visionResult = await callGeminiVision(pdfBase64, systemPrompt, {
      promptType: 'pdf_extraction'
    });
    
    // End PDF extraction timing
    timings.pdfExtraction.end = Date.now();
    modelUsed = visionResult.model;
    
    console.log(`[processar-autos] Gemini Vision response - Model: ${modelUsed}, FinishReason: ${visionResult.finishReason}`);

    if (visionResult.finishReason === "MAX_TOKENS") {
      console.warn("[processar-autos] Response was truncated due to max tokens limit");
    }

    if (!visionResult.text) {
      throw new Error("Resposta inválida da IA - nenhum conteúdo extraído");
    }

    console.log(`[processar-autos] Raw response length: ${visionResult.text.length}`);

    // Update progress: Processing response
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        progress: 40, 
        current_step: 'Processando dados extraídos...',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Parse JSON
    let extractedData = tryFixTruncatedJson(visionResult.text);
    if (!extractedData) {
      console.error("[processar-autos] Failed to parse response as JSON:", visionResult.text.substring(0, 500));
      throw new Error("Não foi possível processar a resposta da IA");
    }

    extractedData = ensureValidStructure(extractedData);
    console.log("[processar-autos] Successfully extracted data from PDF");

    // Generate AI summaries with progress updates
    console.log("[processar-autos] Starting AI summary generation...");
    
    // Start summaries timing
    timings.summaries.start = Date.now();
    
    const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId);
    
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
      aiUsage: {
        pdfExtraction: {
          provider: 'gemini',
          model: modelUsed,
          note: 'Gemini Vision é obrigatório para processar PDFs nativamente',
          durationMs: pdfExtractionDuration
        },
        summaries: {
          provider: resumosResult.aiInfo.provider,
          model: resumosResult.aiInfo.model,
          count: resumosResult.aiInfo.summariesGenerated,
          durationMs: summariesDuration
        },
        totalDurationMs: totalDuration
      },
      truncated: visionResult.finishReason === "MAX_TOKENS"
    };

    // Save result as completed
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        status: 'completed',
        progress: 100, 
        current_step: 'Processamento concluído!',
        result: result,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[processar-autos] Job ${jobId} completed successfully with model: ${modelUsed}`);

  } catch (error) {
    console.error(`[processar-autos] Job ${jobId} failed:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido no processamento';
    
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

    // Get user_id from auth token
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader) {
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user } } = await supabaseClient.auth.getUser();
      userId = user?.id || null;
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
    EdgeRuntime.waitUntil(processarPDFBackground(jobId, finalPdfBase64, fileName, supabaseAdmin));

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
