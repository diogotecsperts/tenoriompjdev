import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getAIConfig, callAI, callPDFProvider } from "../_shared/ai-config.ts";
import { logToBackend, logError, logWarn, logInfo } from "../_shared/backend-logger.ts";
import { extractVisualContent, storeExtractedContent, ExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk } from "../_shared/smart-chunker.ts";
import { splitPDF, needsSplit } from "../_shared/pdf-splitter.ts";
import { extractWithMistralOCR, getMistralAPIKey } from "../_shared/mistral-ocr.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";
import { buildModularImportPrompt, isValidSystemPrompt } from "../_shared/build-import-prompt.ts";
import { notifyPdfErrorFireAndForget } from "../_shared/notify-pdf-error.ts";
import { resolveOcrFallback, resolveSizeExceededFallback } from "../_shared/ocr-fallback.ts";
import { getOcrRouterConfig, runOcrWithConfiguredProvider } from "../_shared/ocr-router.ts";
import { MINIMAX_CLIENT_RASTERIZE_ERROR } from "../_shared/minimax-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout for individual summary generation (aligned to inner callAI + tolerance for slow providers)
const SUMMARY_TIMEOUT_MS = 180_000; // 3 min
const SUMMARY_INNER_TIMEOUT_MS = 170_000; // callAI internal (< outer race)
const SUMMARY_RETRY_TIMEOUT_MS = 300_000; // 5 min on retry

// Post-OCR structuring (chunked path fase 2) — big JSON payloads on MiniMax/GLM chat can exceed default 75s
const STRUCTURING_TIMEOUT_MS = 6 * 60 * 1000; // 6 min hard ceiling
const STRUCTURING_HEARTBEAT_MS = 15_000; // ping updated_at every 15s so watchdog doesn't false-kill

// Constants for PDF processing limits
const GEMINI_PROCESSING_LIMIT = 45_000_000; // 45MB - max size for single Gemini call
const MAX_SPLIT_PARTS = 4; // Maximum parts for split PDFs (~180MB total)
const SPLIT_TARGET_SIZE = 40_000_000; // 40MB per part target
const GLM_CHUNK_PART_TIMEOUT_MS = 5 * 60 * 1000; // fail a browser-split GLM part clearly after 5 min

// O system prompt principal foi movido para uma constante para servir como fallback
// O prompt real é buscado via prompt-manager para permitir edição via DevPanel
const defaultSystemPrompt = `Você é um perito médico especialista em medicina do trabalho com vasta experiência em elaboração de laudos periciais. Analise os autos do processo e extraia TODAS as informações disponíveis com MÁXIMO DETALHAMENTO para preencher um laudo pericial completo.

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
4. NORMAL: Textos brutos completos (petição e contestação)

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

=== INSTRUÇÕES ESPECÍFICAS POR SEÇÃO ===

1. VÍTIMA:
   Extraia todos os dados pessoais do periciando/reclamante.
   ATENÇÃO: "dominancia" é a MÃO DOMINANTE (destro, canhoto ou ambidestro), NÃO é gênero/sexo.

2. PROCESSO:
   Número completo do processo, vara, nomes das partes exatamente como aparecem nos autos.

3. ACIDENTE - EXTRAÇÃO DETALHADA OBRIGATÓRIA:
   - data: Data exata do evento traumático (YYYY-MM-DD)
   - descricao: TRANSCREVA INTEGRALMENTE a descrição do acidente/evento.
     Inclua TODOS os detalhes: circunstâncias, local exato, horário aproximado, 
     mecanismo da lesão, posição do trabalhador, testemunhas se mencionadas, 
     atendimento inicial recebido, consequências imediatas.
     MÍNIMO 2 parágrafos. NÃO RESUMA. Se houver descrição de CAT, copie-a integralmente.
   - local: Local completo onde ocorreu (setor, área, empresa)

4. DOCUMENTOS:
   Marque true para cada tipo de documento mencionado ou anexado aos autos.

5. HISTÓRICO - SEÇÃO CRÍTICA, EXTRAIR COM MÁXIMO DETALHAMENTO:

   5.1. historia_atual (Queixas Atuais / Anamnese):
        Extraia TODAS as queixas relatadas pelo periciando com riqueza de detalhes:
        - Sintomas atuais, intensidade (escala de dor se mencionada)
        - Localização e irradiação da dor
        - Fatores de melhora e piora
        - Periodicidade e frequência dos sintomas
        - Impacto nas atividades diárias e laborais
        - Uso atual de medicamentos (nomes, doses)
        - Qualidade do sono e humor
        - Limitações funcionais específicas (não consegue fazer X, dificuldade para Y)
        MÍNIMO 3 parágrafos. NÃO OMITA nenhuma queixa mencionada pelo reclamante.

   5.2. historico_ocupacional:
        Liste CRONOLOGICAMENTE todos os empregos anteriores com detalhes:
        - Nome da empresa, período de trabalho (início e término)
        - Cargo/função exercida em cada emprego
        - Atividades desenvolvidas em cada função
        - Exposição a riscos ocupacionais (ruído, vibração, produtos químicos, esforço físico)
        - Motivo da saída de cada emprego
        - Tempo total de exposição ocupacional
        MÍNIMO 2 parágrafos ou lista cronológica completa. Busque em CTPS, PPP, depoimentos.

   5.3. antecedentes_patologicos:
        Liste TODAS as condições de saúde prévias, mesmo que não relacionadas:
        - Doenças crônicas (diabetes, hipertensão, cardiopatias, etc.)
        - Cirurgias anteriores (data, tipo, local, resultado)
        - Internações hospitalares prévias (motivo, duração)
        - Uso de medicamentos crônicos (lista completa)
        - Histórico familiar relevante (doenças hereditárias)
        - Hábitos de vida (tabagismo, etilismo, sedentarismo)
        - Acidentes ou lesões anteriores
        NÃO deixe vazio se houver QUALQUER menção a saúde prévia no documento.

   5.4. tratamentos_realizados:
        Liste TODOS os tratamentos realizados em formato estruturado:
        - Medicamentos utilizados (nome comercial/genérico, dose, período de uso, resposta)
        - Fisioterapia (quantidade de sessões, período, resultado)
        - Cirurgias realizadas (data, tipo, hospital, resultado pós-operatório)
        - Internações (período, motivo, hospital)
        - Acompanhamento especializado (especialidade, frequência, conduta)
        - Procedimentos invasivos (infiltrações, bloqueios, etc.)
        - Uso de órteses ou próteses
        Separe cada tratamento com uma quebra de linha. Seja específico com datas e resultados.

   5.5. afastamentos:
        Liste TODOS os períodos de afastamento do trabalho com precisão:
        - Data de início e término de CADA afastamento
        - CID do afastamento (obrigatório se disponível)
        - Tipo de benefício recebido (auxílio-doença B31, auxílio-acidentário B91, aposentadoria por invalidez, etc.)
        - Duração de cada afastamento
        - Tempo total acumulado afastado do trabalho
        - Se houve alta médica ou retorno ao trabalho
        EXTRAIA DATAS EXATAS quando disponíveis. Liste cronologicamente.

6. EXAME CLÍNICO - EXTRAÇÃO COMPLETA E ESTRUTURADA:

   6.1. laudos_medicos:
        Extraia de CADA laudo/parecer médico presente nos autos:
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
         Limitações: descrever

   6.2. exames_complementares:
        Liste CADA exame separadamente com estrutura:
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
        NÃO RESUMA. Liste todos os achados de cada exame.

   6.3. lesoes_descritas:
        Todas as lesões mencionadas em documentos médicos, CAT, laudos.
        Liste anatomicamente: região, tipo de lesão, gravidade.

   6.4. exame_fisico:
        Se houver descrição de exame físico realizado (em laudos médicos, perícias anteriores), extraia:
        - Estado geral do periciando
        - Inspeção (deformidades, atrofias, edemas, cicatrizes)
        - Palpação (pontos dolorosos, contraturas, massas)
        - Testes especiais realizados (Lasègue, Phalen, Tinel, Finkelstein, etc.) e resultados
        - Amplitude de movimentos (ADM) de cada articulação avaliada
        - Força muscular (grau de força por grupamento)
        - Reflexos e sensibilidade
        - Marcha e postura
        Deixe vazio APENAS se não houver NENHUM exame físico descrito nos autos.

7. INFORMAÇÕES MÉDICAS - PRIORIDADE MÁXIMA:

   7.1. cids_mencionados:
        EXTRAIA ABSOLUTAMENTE TODOS os códigos CID-10 mencionados no documento.
        Procure em: laudos médicos, atestados, receitas, CAT, decisões do INSS, perícias anteriores.
        Formato: ["J15.9", "M54.2", "G56.0", "S62.3"]
        NÃO DEIXE ESTE CAMPO VAZIO se houver qualquer código CID nos autos.

   7.2. incapacidade_alegada:
        Descreva detalhadamente o tipo de incapacidade mencionada nos autos.
        Inclua: grau (total/parcial), duração (temporária/permanente), limitações específicas alegadas.

   7.3. nexo_sugerido:
        Retorne baseado nas evidências documentais:
        - "direto" → se CAT foi emitida e aceita, ou se há nexo claramente estabelecido
        - "concausa" → se há fatores ocupacionais E pessoais contribuintes
        - "agravamento" → se doença pré-existente foi agravada pelo trabalho
        - "" → se não há elementos suficientes para determinar

   7.4. tipo_incapacidade:
        Retorne baseado nas evidências:
        - "total_permanente" → aposentadoria por invalidez concedida ou incapacidade total sem possibilidade de recuperação
        - "total_temporaria" → afastamento total do trabalho com expectativa de recuperação
        - "parcial_permanente" → sequelas permanentes com capacidade laboral residual
        - "parcial_temporaria" → limitações temporárias com melhora esperada
        - "ausencia" → laudos indicam capacidade laboral preservada
        - "" → se não há informação suficiente para classificar

8. QUESITOS - EXTRAÇÃO INTEGRAL OBRIGATÓRIA:

   Os quesitos são perguntas técnicas formuladas pelo Juízo e pelas partes para serem respondidas pelo perito.
   É ABSOLUTAMENTE ESSENCIAL extrair TODOS os quesitos INTEGRALMENTE, pois são a base do laudo pericial.

   8.1. juizo (Quesitos do Juízo):
        Extraia TODOS os quesitos formulados pelo Juiz/Juízo, geralmente encontrados em despachos ou 
        decisões judiciais. Copie EXATAMENTE como aparecem, mantendo:
        - Numeração original (1, 2, 3... ou I, II, III... ou a, b, c...)
        - Texto integral de CADA quesito sem alterações
        - Ordem original dos quesitos
        - Todos os sub-quesitos se houver (Ex: 1.1, 1.2, 2.a, 2.b)
        Busque por: "O(A) perito(a) deverá responder...", "Quesitos do MM. Juízo", "Deverá o expert informar..."
        NÃO RESUMA. Copie LITERALMENTE cada quesito. NÃO invente quesitos.

   8.2. reclamante (Quesitos do Reclamante/Autor):
        Extraia TODOS os quesitos formulados pelo advogado do reclamante, geralmente na petição inicial 
        ou em petição específica de quesitos. Copie EXATAMENTE como aparecem, mantendo:
        - Numeração original
        - Texto integral de cada quesito sem alterações
        - Ordem original
        - Todos os sub-quesitos
        Busque por: "Quesitos do reclamante", "Quesitos do autor", assinatura do advogado do autor.
        NÃO RESUMA. Copie literalmente. NÃO invente quesitos.

   8.3. reclamada (Quesitos da Reclamada/Ré):
        Extraia TODOS os quesitos formulados pelo advogado da reclamada, geralmente na contestação 
        ou em petição específica. Copie EXATAMENTE como aparecem, mantendo:
        - Numeração original
        - Texto integral de cada quesito sem alterações
        - Ordem original
        - Todos os sub-quesitos
        Busque por: "Quesitos da reclamada", "Quesitos da ré", assinatura do advogado da empresa.
        NÃO RESUMA. Copie literalmente. NÃO invente quesitos.

   ATENÇÃO: Os quesitos podem estar em anexos separados ou no corpo das petições.
   Busque em TODO o documento. NÃO invente quesitos - extraia APENAS os que existem.

9. TEXTOS BRUTOS - MUITO IMPORTANTE:
   - peticao_inicial: Copie o TEXTO COMPLETO da petição inicial (a íntegra ou o máximo possível)
   - contestacao: Copie o TEXTO COMPLETO da contestação (a íntegra ou o máximo possível)
   Esses textos são a fonte primária para geração de resumos técnicos posteriormente.

10. POSTO DE TRABALHO - CRÍTICO PARA ANÁLISE DO NEXO CAUSAL:

    10.1. cargo_funcao:
          Cargo exato exercido pelo reclamante (ex: Operador de Máquinas, Auxiliar de Produção, Motorista de Caminhão)

    10.2. data_admissao: Data de admissão na empresa (YYYY-MM-DD)

    10.3. data_afastamento: Data de afastamento ou desligamento (YYYY-MM-DD)

    10.4. ambiente_e_atividades - CAMPO UNIFICADO - DETALHAR AO MÁXIMO:

          AMBIENTE DE TRABALHO:
          - Ambiente físico (interno/externo, coberto/descoberto, climatizado/não)
          - Dimensões aproximadas do local de trabalho
          - Equipamentos e máquinas utilizados (listar todos)
          - Mobiliário (mesa, cadeira, altura, regulagem)
          - Condições ergonômicas do posto
          - Exposição a riscos físicos (ruído, vibração, temperatura, radiação)
          - Exposição a riscos químicos (poeiras, fumos, névoas, vapores)
          - Exposição a riscos biológicos
          - Condições de iluminação e ventilação
          - Uso de EPIs (quais, frequência de uso)

          ATIVIDADES LABORAIS:
          - Descrição completa das tarefas diárias executadas
          - Movimentos repetitivos (quais, frequência, duração)
          - Esforço físico exigido (peso carregado, frequência de levantamento)
          - Posturas predominantes (sentado, em pé, agachado, curvado)
          - Tempo em cada postura
          - Jornada de trabalho (horário, horas extras)
          - Pausas durante o trabalho (frequência, duração)
          - Ritmo de trabalho e metas de produção
          - Uso de ferramentas manuais
          - Exposições específicas da função

          MÍNIMO 3 parágrafos. Busque em PPP, PPRA, PCMSO, laudos ergonômicos, depoimentos.

11. RESUMO:
    Síntese breve do caso para identificação rápida (máximo 300 caracteres).

=== FORMATO DE RESPOSTA OBRIGATÓRIO ===
- Retorne APENAS o objeto JSON, sem markdown, sem \`\`\`, sem explicações.
- Comece diretamente com { e termine com }
- NÃO use blocos de código. Apenas JSON puro.`;

// Variável para cache do system prompt (carregado uma vez por request)
let cachedSystemPrompt: string | null = null;

/**
 * Busca o system prompt modular (via prompts individuais) ou fallback para monolítico
 * Usa cache para evitar múltiplas queries dentro do mesmo request
 */
async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt;
  }
  
  try {
    // Tentar montar o prompt modular (prompts individuais do banco)
    console.log('[processar-autos] Attempting to build modular system prompt...');
    const modularPrompt = await buildModularImportPrompt();
    
    if (isValidSystemPrompt(modularPrompt)) {
      console.log('[processar-autos] ✓ Using modular system prompt from database prompts');
      cachedSystemPrompt = modularPrompt;
      return cachedSystemPrompt;
    }
    
    console.warn('[processar-autos] Modular prompt validation failed, using fallback');
  } catch (error) {
    console.error('[processar-autos] Error building modular prompt, using fallback:', error);
  }
  
  // Fallback: usar o prompt monolítico antigo
  console.log('[processar-autos] Using default monolithic system prompt (fallback)');
  cachedSystemPrompt = defaultSystemPrompt;
  
  return cachedSystemPrompt;
}

// Alias para retrocompatibilidade - será substituído por await getSystemPrompt() onde possível
const systemPrompt = defaultSystemPrompt;
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
  
  // PASSO 2.5: Extrair primeiro objeto JSON completo (ignora lixo no final)
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let endPos = -1;
    
    for (let i = firstBrace; i < cleaned.length; i++) {
      const char = cleaned[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endPos = i + 1;
            break;
          }
        }
      }
    }
    
    if (endPos > firstBrace) {
      const extracted = cleaned.substring(firstBrace, endPos);
      console.log(`[tryFixTruncatedJson] Extracted first JSON object: ${firstBrace} to ${endPos} (${endPos - firstBrace} chars)`);
      
      // Tentar parsear o objeto extraído
      try {
        return JSON.parse(extracted);
      } catch {
        // Continuar com o fluxo normal para limpeza adicional
        cleaned = extracted;
        console.log('[tryFixTruncatedJson] Extracted JSON still invalid, continuing with repairs...');
      }
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

// Sanitize OCR accent errors in short fields extracted via JSON
function sanitizeOcrAccents(text: string | undefined): string {
  if (!text) return '';
  const dict: Record<string, string> = {
    // 1. Termos Médicos, Anatômicos e Clínicos
    'medico': 'médico', 'medica': 'médica', 'medicos': 'médicos',
    'clinico': 'clínico', 'clinica': 'clínica',
    'fisico': 'físico', 'fisica': 'física',
    'ortopedico': 'ortopédico', 'ortopedica': 'ortopédica',
    'neurologico': 'neurológico', 'neurologica': 'neurológica',
    'psiquiatrico': 'psiquiátrico', 'psiquiatrica': 'psiquiátrica',
    'cardiaco': 'cardíaco', 'cardiaca': 'cardíaca',
    'sindrome': 'síndrome', 'sindromes': 'síndromes',
    'diagnostico': 'diagnóstico', 'prognostico': 'prognóstico',
    'terapeutico': 'terapêutico',
    'anatomico': 'anatômico', 'fisiologico': 'fisiológico',
    'patologico': 'patológico', 'patologica': 'patológica',
    'cranio': 'crânio', 'encefalico': 'encefálico',
    'ciatica': 'ciática',
    'vertebra': 'vértebra', 'vertebras': 'vértebras',
    'toracico': 'torácico', 'torax': 'tórax',
    'femur': 'fêmur', 'tibia': 'tíbia', 'umero': 'úmero',
    'osseo': 'ósseo', 'ossea': 'óssea',
    'tendinea': 'tendínea',
    'musculo': 'músculo', 'musculos': 'músculos',
    'articulacao': 'articulação', 'articulacoes': 'articulações',
    'lesao': 'lesão', 'lesoes': 'lesões',
    'inflamacao': 'inflamação', 'infeccao': 'infecção',
    'cirurgico': 'cirúrgico', 'cirurgica': 'cirúrgica',
    'pos-operatorio': 'pós-operatório', 'pre-operatorio': 'pré-operatório',
    'cronico': 'crônico', 'cronica': 'crônica',
    'sistemico': 'sistêmico',
    'pressao': 'pressão', 'frequencia': 'frequência',
    'respiratoria': 'respiratória', 'cardiologica': 'cardiológica',
    'pulmao': 'pulmão', 'orgao': 'órgão', 'orgaos': 'órgãos',
    'arteria': 'artéria', 'estomago': 'estômago',
    'ortostatica': 'ortostática',

    // 2. Termos Periciais, Jurídicos e Ocupacionais
    'juizo': 'juízo', 'pericia': 'perícia',
    'acidentario': 'acidentário',
    'previdenciario': 'previdenciário', 'previdencia': 'previdência',
    'beneficio': 'benefício', 'honorarios': 'honorários',
    'audiencia': 'audiência',
    'acao': 'ação', 'acoes': 'ações',
    'peticao': 'petição', 'declaracao': 'declaração',
    'documentario': 'documentário',
    'juridico': 'jurídico',
    'criterio': 'critério', 'criterios': 'critérios',
    'evidencia': 'evidência', 'evidencias': 'evidências',
    'consequencia': 'consequência', 'consequencias': 'consequências',
    'ocorrencia': 'ocorrência',
    'auxilio': 'auxílio', 'estetico': 'estético', 'estetica': 'estética',
    'temporario': 'temporário', 'temporaria': 'temporária',
    'reabilitacao': 'reabilitação', 'readaptacao': 'readaptação',
    'indenizacao': 'indenização',
    'profissao': 'profissão', 'funcao': 'função', 'funcoes': 'funções',
    'veiculo': 'veículo', 'transito': 'trânsito',
    'salario': 'salário', 'remuneracao': 'remuneração',
    'pos-hospitalar': 'pós-hospitalar',

    // 3. Substantivos e Ações Comuns (-ção, -ções, -cia)
    'nao': 'não', 'sao': 'são',
    'analise': 'análise',
    'conclusao': 'conclusão', 'avaliacao': 'avaliação', 'avaliacoes': 'avaliações',
    'reducao': 'redução', 'limitacao': 'limitação', 'limitacoes': 'limitações',
    'evolucao': 'evolução', 'realizacao': 'realização',
    'restricao': 'restrição', 'restricoes': 'restrições',
    'exposicao': 'exposição', 'concessao': 'concessão',
    'condicao': 'condição', 'condicoes': 'condições',
    'alteracao': 'alteração', 'alteracoes': 'alterações',
    'comprovacao': 'comprovação',
    'medicacao': 'medicação', 'medicacoes': 'medicações',
    'prescricao': 'prescrição',
    'internacao': 'internação', 'recuperacao': 'recuperação',
    'observacao': 'observação', 'constatacao': 'constatação',
    'operacao': 'operação',
    'producao': 'produção', 'relacao': 'relação',
    'necessario': 'necessário', 'necessaria': 'necessária',
    'proprio': 'próprio', 'propria': 'própria',
    'maximo': 'máximo', 'minimo': 'mínimo', 'media': 'média',
    'periodo': 'período', 'historico': 'histórico',
    'prontuario': 'prontuário', 'calcados': 'calçados',
  };

  let sanitized = text;
  for (const [key, value] of Object.entries(dict)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    sanitized = sanitized.replace(regex, (match) => {
      return match.charAt(0) === match.charAt(0).toUpperCase()
        ? value.charAt(0).toUpperCase() + value.slice(1)
        : value;
    });
  }
  return sanitized;
}

// Helper to create a valid structure with defaults
function ensureValidStructure(data: any): object {
  const defaultStructure = {
    vitima: { nome: "", cpf: "", data_nascimento: "", profissao: "", escolaridade: "", dominancia: "" },
    processo: { numero: "", vara: "", reclamante: "", reclamada: "" },
    acidente: { data: "", descricao: "", local: "" },
    documentos_checklist: { cat: false, prontuario: false, receitas: false, exames: false, laudos_anteriores: false, atestados: false, outros: [] },
    historico: { historia_atual: "", historico_ocupacional: "", antecedentes_patologicos: "", tratamentos_realizados: "", afastamentos: "" },
    posto_trabalho: { cargo_funcao: "", data_admissao: "", data_afastamento: "", descricao_ambiente: "", descricao_atividades: "" },
    exame_clinico: { laudos_medicos: "", exames_complementares: "", lesoes_descritas: "", exame_fisico: "" },
    informacoes_medicas: { cids_mencionados: [], incapacidade_alegada: "", nexo_sugerido: "", tipo_incapacidade: "" },
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
    posto_trabalho: { ...defaultStructure.posto_trabalho, ...(data.posto_trabalho || {}) },
    exame_clinico: { ...defaultStructure.exame_clinico, ...(data.exame_clinico || {}) },
    informacoes_medicas: { ...defaultStructure.informacoes_medicas, ...(data.informacoes_medicas || {}) },
    quesitos: { ...defaultStructure.quesitos, ...(data.quesitos || {}) },
    textos_brutos: { ...defaultStructure.textos_brutos, ...(data.textos_brutos || {}) },
    resumo: data.resumo || ""
  };
}

// ============================================
// PROMPT SYSTEM - UNIFIED WITH DATABASE
// ============================================

// Mapeamento de tipos de resumo para IDs de prompt no banco de dados
const PROMPT_ID_MAPPING: Record<string, string> = {
  resumo_peticao: 'prompt_gen_resumo_peticao',
  resumo_contestacao: 'prompt_gen_resumo_contestacao',
  descricao_doencas: 'prompt_gen_descricao_doencas',
  nexo_causal: 'prompt_gen_nexo_causal',
  incapacidade: 'prompt_gen_incapacidade',
  conclusao: 'prompt_gen_conclusao',
  destino_sugerido: 'prompt_gen_destino_sugerido',
  referencias_bibliograficas: 'prompt_gen_referencias',
  quesitos_juizo: 'prompt_regen_quesitosJuizo',
  quesitos_reclamante: 'prompt_regen_quesitosReclamante',
  quesitos_reclamada: 'prompt_regen_quesitosReclamada'
};

// Prompts padrão hardcoded como fallback (caso o banco não tenha ou falhe)
const DEFAULT_PROMPTS: Record<string, string> = {
  resumo_peticao: `Você é um perito médico especialista em medicina do trabalho.
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
- Mencione os pedidos principais`,

  resumo_contestacao: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da contestação para um laudo pericial médico trabalhista.

Texto da Contestação:
\${contestacao}

Instruções:
- Resuma os pontos principais alegados pela reclamada
- Destaque os argumentos contrários ao nexo causal
- Identifique documentos ou evidências mencionadas
- Mencione os pedidos de improcedência
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`,

  descricao_doencas: `Você é um médico enciclopedista. Para o(s) CID(s) inserido(s), forneça uma descrição técnica completa.

CÓDIGOS CID A DESCREVER:
\${cids}

CONTEXTO OCUPACIONAL (se disponível):
- Atividades laborais: \${atividadesLaborais}
- Histórico ocupacional: \${historicoOcupacional}

PARA CADA CID, FORNEÇA:

1. NOME COMPLETO E CID-10
Exemplo: TENDINITE DO SUPRAESPINHOSO (CID-10: M75.1)

2. DEFINIÇÃO TÉCNICA
Descreva tecnicamente o que é a patologia, localização anatômica e características principais.

3. ETIOLOGIA
Origem da doença - causas possíveis incluindo fatores ocupacionais.

4. SINTOMATOLOGIA CLÁSSICA
Sintomas típicos da condição.

5. RELAÇÃO OCUPACIONAL TÍPICA
Se é uma DORT/LER comum em certas funções, ou outros vínculos ocupacionais conhecidos.

FORMATAÇÃO:
- Use CAIXA ALTA para títulos (não use markdown com asteriscos)
- Retorne apenas o texto técnico para ser anexado ao campo
- Linguagem formal e científica
- Mínimo 2 parágrafos por CID`,

  nexo_causal: `Você é médico-perito judicial. Gere a análise de NEXO CAUSAL / CONCAUSALIDADE em linguagem técnica absoluta.

DADOS DO CASO:
- CIDs: \${cids}
- Atividades Laborais: \${atividadesLaborais}
- História do Acidente/Doença: \${historiaAcidente}
- Exame Físico: \${exameFisico}
- Exames Complementares: \${examesComplementares}
- Antecedentes: \${antecedentes}
- Laudos Médicos: \${laudosMedicos}

CRITÉRIOS OBRIGATÓRIOS DE ANÁLISE:

1. CLASSIFICAÇÃO DE SCHILLING:
Enquadre obrigatoriamente no Grupo I, II ou III:
- Grupo I: Trabalho é causa necessária (doenças profissionais típicas)
- Grupo II: Trabalho é fator contributivo (doenças do trabalho)
- Grupo III: Trabalho é provocador de distúrbio latente
Justifique com os dados de atividades laborais e história.

2. CRITÉRIOS DE SIMONIN:
Analise a coerência entre:
- Topografia da lesão
- Cronologia dos fatos
- Mecanismo de trauma/exposição

3. CRITÉRIOS DE BRADFORD-HILL:
Avalie e declare se cada critério é atendido (SIM/NÃO/PARCIAL):
- Plausibilidade biológica
- Temporalidade
- Consistência

4. ANÁLISE ANAMT:
Se houver ASO/PCMSO nos laudos médicos, comente se a documentação ocupacional é suficiente para a análise.

REGRA: Se faltar dado essencial, declare "informação insuficiente nos autos".

CONCLUSÃO OBRIGATÓRIA:
Finalize com: "NEXO CAUSAL: [PRESENTE/AUSENTE/INCONCLUSIVO]" seguido de justificativa técnica em 2-3 linhas.`,

  incapacidade: `Redija a análise de incapacidade laboral fundamentada tecnicamente.

DADOS DO CASO:
- CIDs: \${cids}
- Atividades Laborais: \${atividadesLaborais}
- Exame Físico: \${exameFisico}
- Exames Complementares: \${examesComplementares}
- Antecedentes: \${antecedentes}
- Nexo Causal: \${nexoCausal}

ESTRUTURA OBRIGATÓRIA DE RESPOSTA:

1. DEMANDAS CRÍTICAS DO CARGO:
Resuma 3-6 demandas físicas/cognitivas do cargo baseadas nas atividades laborais informadas.

2. ACHADOS OBJETIVOS:
Correlacione os achados do exame físico e exames complementares com o(s) diagnóstico(s).

3. LIMITAÇÕES FUNCIONAIS:
Liste objetivamente o que o periciando NÃO consegue realizar.
Exemplos:
- "Incapaz de elevação do membro superior acima de 90°"
- "Incapaz de permanecer em pé por mais de 30 minutos"
- "Incapaz de manipular cargas acima de 5kg"

4. CLASSIFICAÇÃO DA INCAPACIDADE:
- GRAU: Parcial ou Total
- DURAÇÃO: Temporária ou Permanente
- EXTENSÃO: Para a função habitual ou para toda atividade laborativa

NOTA TÉCNICA: Utilize os critérios de Schilling e Simonin para fundamentar o peso do trabalho na incapacidade atual, se aplicável.`,

  referencias_bibliograficas: `Gere as referências bibliográficas pertinentes ao laudo pericial.

DADOS DO CASO:
- CIDs: \${cids}
- Atividades Laborais: \${atividadesLaborais}
- Laudos Médicos: \${laudosMedicos}

REFERÊNCIAS OBRIGATÓRIAS (SEMPRE INCLUIR):

1. SCHILLING, R. S. F. More effective prevention in occupational health practice? Journal of the Society of Occupational Medicine, v. 39, p. 71-79, 1989.

2. BRADFORD HILL, A. The environment and disease: association or causation? Proceedings of the Royal Society of Medicine, v. 58, p. 295-300, 1965.

3. SIMONIN, C. Medicina Legal Judicial. 2. ed. Barcelona: Editorial JIMS, 1962.

REFERÊNCIA CONDICIONAL:
Inclua a referência da ANAMT (Associação Nacional de Medicina do Trabalho) APENAS se houver menção a ASO, PCMSO ou documentação ocupacional nos laudos médicos.

REFERÊNCIAS DINÂMICAS:
Adicione 2 a 4 referências científicas reais e pertinentes aos CIDs específicos do caso. Busque artigos, diretrizes ou livros-texto reconhecidos.

FORMATO OBRIGATÓRIO: ABNT (NBR 6023)
Exemplo:
SOBRENOME, Nome. Título da obra. Edição. Cidade: Editora, Ano.`

  ,quesitos_juizo: `TEXTO INTEGRAL DO PROCESSO:
\${textoProcesso}

DADOS DO CASO PARA FUNDAMENTAR AS RESPOSTAS:
- CIDs diagnosticados: \${cids}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}
- Exames complementares: \${examesComplementares}
- Atividades laborais: \${atividadesLaborais}
- Nexo causal: \${nexoCausal}
- Incapacidade: \${incapacidade}

TAREFA: Leia o documento acima na íntegra. Localize e extraia todas as perguntas (quesitos) formuladas EXCLUSIVAMENTE pelo Juízo. Abaixo de cada pergunta extraída, gere a resposta técnica correspondente agindo como perito médico.

FORMATO DE SAÍDA:
QUESITO 1: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

QUESITO 2: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

REGRA DE INEXISTÊNCIA: Se e somente se o documento realmente não contiver perguntas do Juízo, retorne unicamente: 'Quesitos do Juízo não identificados nos autos.'`,

  quesitos_reclamante: `TEXTO INTEGRAL DO PROCESSO:
\${textoProcesso}

DADOS DO CASO PARA FUNDAMENTAR AS RESPOSTAS:
- CIDs diagnosticados: \${cids}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}
- Exames complementares: \${examesComplementares}
- Atividades laborais: \${atividadesLaborais}
- Nexo causal: \${nexoCausal}
- Incapacidade: \${incapacidade}

TAREFA: Leia o documento acima na íntegra. Localize e extraia todas as perguntas (quesitos) formuladas EXCLUSIVAMENTE pelo Reclamante. Abaixo de cada pergunta extraída, gere a resposta técnica correspondente agindo como perito médico.

FORMATO DE SAÍDA:
QUESITO 1: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

QUESITO 2: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

REGRA DE INEXISTÊNCIA: Se e somente se o documento realmente não contiver perguntas do Reclamante, retorne unicamente: 'Quesitos do Reclamante não identificados nos autos.'`,

  quesitos_reclamada: `TEXTO INTEGRAL DO PROCESSO:
\${textoProcesso}

DADOS DO CASO PARA FUNDAMENTAR AS RESPOSTAS:
- CIDs diagnosticados: \${cids}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}
- Exames complementares: \${examesComplementares}
- Atividades laborais: \${atividadesLaborais}
- Nexo causal: \${nexoCausal}
- Incapacidade: \${incapacidade}

TAREFA: Leia o documento acima na íntegra. Localize e extraia todas as perguntas (quesitos) formuladas EXCLUSIVAMENTE pela Reclamada. Abaixo de cada pergunta extraída, gere a resposta técnica correspondente agindo como perito médico.

FORMATO DE SAÍDA:
QUESITO 1: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

QUESITO 2: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

REGRA DE INEXISTÊNCIA: Se e somente se o documento realmente não contiver perguntas da Reclamada, retorne unicamente: 'Quesitos da Reclamada não identificados nos autos.'`,

  conclusao: `Você é um perito médico do trabalho. Com base nos dados do caso, elabore a análise conclusiva do laudo pericial.

DADOS DO CASO:
- CIDs: \${cids}
- Nexo causal: \${nexoCausal}
- Incapacidade: \${incapacidade}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}

Elabore uma conclusão técnica fundamentada que sintetize:
1. O diagnóstico confirmado e os CIDs pertinentes
2. A relação causal com a atividade laboral (nexo)
3. O grau e tipo de incapacidade constatada
4. Prognóstico e recomendações

Seja objetivo e imparcial. Máximo 4 parágrafos.`,

  destino_sugerido: `Você é um perito médico do trabalho. Com base na análise do caso, indique o destino/encaminhamento sugerido para o periciando.

DADOS DO CASO:
- CIDs: \${cids}
- Incapacidade: \${incapacidade}
- Nexo causal: \${nexoCausal}

Indique de forma direta e objetiva o destino sugerido. Exemplos: "Retorno ao trabalho sem restrições", "Reabilitação profissional", "Aposentadoria por invalidez", "Manutenção do benefício por incapacidade temporária".

Responda em no máximo 2 frases.`
};

/**
 * Busca o prompt do banco de dados via prompt-manager com fallback hardcoded.
 * Unifica o comportamento entre importação inicial e "Buscar novamente".
 * 
 * @param tipo - Tipo do resumo (ex: 'referencias_bibliograficas')
 * @param ctx - Contexto com variáveis para interpolação
 * @returns Prompt pronto para uso (já interpolado)
 */
async function getPromptForType(tipo: string, ctx: any): Promise<string> {
  const promptId = PROMPT_ID_MAPPING[tipo];
  const defaultPrompt = DEFAULT_PROMPTS[tipo];
  
  if (!promptId || !defaultPrompt) {
    console.warn(`[getPromptForType] Tipo desconhecido: ${tipo}`);
    return '';
  }
  
  // Contexto de interpolação com todas as variáveis possíveis
  const interpolationContext = {
    // Petição e contestação
    peticaoInicial: ctx.peticaoInicial || 'Não informado',
    contestacao: ctx.contestacao || 'Não informado',
    
    // Diagnósticos e CIDs
    cids: ctx.cids || 'Não informado',
    
    // Posto de trabalho
    postoTrabalho: ctx.postoTrabalho || ctx.cargoFuncao || 'Não informado',
    atividadesLaborais: ctx.atividadesLaborais || 'Não informado',
    historicoOcupacional: ctx.historicoOcupacional || 'Não informado',
    
    // História clínica
    historiaAcidente: ctx.historiaAcidente || 'Não informado',
    historiaAtual: ctx.historiaAtual || 'Não informado',
    antecedentes: ctx.antecedentes || 'Não informado',
    
    // Exames e laudos
    exameFisico: ctx.exameFisico || 'Não informado',
    examesComplementares: ctx.examesComplementares || 'Não informado',
    laudosMedicos: ctx.laudosMedicos || 'Não informado',
    lesoesDescritas: ctx.lesoesDescritas || 'Não informado',
    
    // Tratamentos
    tratamentos: ctx.tratamentos || 'Não informado',
    
    // Nexo causal (para análise de incapacidade)
    nexoCausal: ctx.nexoCausal || ctx.nexoCausalGerado || 'Não informado',
    
    // Incapacidade (para quesitos)
    incapacidade: ctx.incapacidade || ctx.incapacidadeGerada || 'Não informado',
    
    // Quesitos (texto bruto para sub-rotina automática)
    quesitosTexto: ctx.quesitosTexto || ctx.quesitosJuizo || ctx.quesitosReclamante || ctx.quesitosReclamada || '',
    
    // Outros campos que podem ser usados em prompts futuros
    metodologia: ctx.metodologia || 'Não informado',
    conclusao: ctx.conclusao || 'Não informado',
    destinoSugerido: ctx.destinoSugerido || '',
    
    // Texto bruto integral do processo para quesitos
    textoProcesso: ctx.textoProcesso || '',
  };
  
  try {
    // Buscar prompt do banco via prompt-manager (com cache de 5 min)
    const prompt = await getPrompt(
      promptId,
      defaultPrompt,
      interpolationContext,
      { autoRegister: true }
    );
    
    console.log(`[getPromptForType] Prompt '${tipo}' carregado (promptId: ${promptId})`);
    return prompt;
  } catch (error) {
    // Se falhar, usar o fallback local com interpolação manual
    console.warn(`[getPromptForType] Fallback para prompt hardcoded: ${tipo}`, error);
    
    // Interpolação manual do fallback
    let prompt = defaultPrompt;
    for (const [key, value] of Object.entries(interpolationContext)) {
      prompt = prompt.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(value));
    }
    
    return prompt;
  }
}

const summarySystemPrompt = `Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.

REGRA DE FORMATAÇÃO ESTRITA: Use APENAS texto plano. NUNCA use Markdown (asteriscos, negritos, bullets, headings). Separe parágrafos com quebras de linha duplas.

REGRA DE IDIOMA: Todo o texto DEVE ser redigido em Português Brasileiro correto e formal, com TODOS os acentos, cedilhas e diacríticos adequados (á, é, í, ó, ú, â, ê, ô, ã, õ, ç). Texto sem acentuação será REJEITADO.

REGRA DE CONDUTA: É ESTRITAMENTE PROIBIDO:
- Inserir metatextos como "Nota Técnica do Perito:", "Observação:", "Ressalva:" no corpo do laudo.
- Dialogar com o usuário ("Como você não forneceu...", "Aqui está o resumo...").
- Inventar dados, casos fictícios ou modelos padrão quando a informação não estiver disponível.
- Se uma variável estiver vazia ou contiver "Não informado", NÃO mencione essa ausência. Baseie a análise exclusivamente nos dados disponíveis.`;

/**
 * Process a large PDF (>45MB) by splitting into smaller parts and extracting each
 * Uses pdf-lib for safe splitting that preserves all PDF references
 * Falls back to Mistral OCR if Gemini fails
 */
async function processLargePDFWithSplit(
  pdfBytes: Uint8Array,
  model: string,
  jobId: string,
  supabaseAdmin: any,
  userId: string
): Promise<{ rawText: string; pageCount: number; provider: string; partsCount: number }> {
  const sizeMB = (pdfBytes.byteLength / 1024 / 1024).toFixed(2);
  console.log(`[processar-autos] PDF exceeds limit (${sizeMB}MB), starting split process...`);
  
  // Update job status
  await supabaseAdmin.from('import_jobs').update({ 
    current_step: 'Dividindo PDF grande em partes...',
    progress: 8,
    updated_at: new Date().toISOString()
  }).eq('id', jobId);
  
  // Split PDF into parts
  const { parts, pageRanges, totalPages } = await splitPDF(pdfBytes, {
    maxSizeBytes: SPLIT_TARGET_SIZE,
    maxParts: MAX_SPLIT_PARTS
  });
  
  console.log(`[processar-autos] Split into ${parts.length} parts, ${totalPages} total pages`);
  
  const extractedTexts: string[] = [];
  let totalPageCount = 0;
  let lastError: Error | null = null;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const range = pageRanges[i];
    
    await supabaseAdmin.from('import_jobs').update({ 
      current_step: `Processando parte ${i + 1}/${parts.length} (págs ${range.start}-${range.end})...`,
      progress: Math.round(10 + (i / parts.length) * 30),
      updated_at: new Date().toISOString()
    }).eq('id', jobId);
    
    console.log(`[processar-autos] Processing part ${i + 1}/${parts.length} (${(part.byteLength / 1024 / 1024).toFixed(2)}MB)...`);
    
    try {
      // Try Gemini Vision first
      const extracted = await extractVisualContent(part, { 
        useFilesAPI: true, 
        model
      });
      
      extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) ===\n${extracted.rawText}`);
      totalPageCount += extracted.pageCount;
      
      console.log(`[processar-autos] Part ${i + 1} complete (Gemini): ${extracted.rawText.length} chars`);
    } catch (geminiError) {
      lastError = geminiError instanceof Error ? geminiError : new Error(String(geminiError));

      // Fallback só ocorre se explicitamente configurado no DevPanel
      // (system_config.ocr_fallback_*). Defaults: propaga o erro.
      const decision = await resolveOcrFallback("gemini", geminiError, {
        restrictTo: ["mistral"],
        logPrefix: "[processar-autos/split-part]",
      });
      if (decision.action === "propagate") {
        console.warn(`[processar-autos] Gemini falhou parte ${i + 1} e fallback não configurado — propagando.`);
        throw lastError;
      }

      // decision.provider === "mistral" (único aceito neste caminho)
      console.warn(`[processar-autos] Gemini falhou parte ${i + 1}, usando fallback configurado: ${decision.provider}`);
      const mistralKey = await getMistralAPIKey();
      if (!mistralKey) {
        throw new Error(`Fallback '${decision.provider}' configurado mas MISTRAL_API_KEY ausente.`);
      }
      try {
        const mistralResult = await extractWithMistralOCR(part, mistralKey);
        extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) [Mistral OCR fallback] ===\n${mistralResult.text}`);
        totalPageCount += mistralResult.pageCount;
        console.log(`[processar-autos] Part ${i + 1} complete (Mistral OCR fallback): ${mistralResult.text.length} chars`);
      } catch (mistralError) {
        console.error(`[processar-autos] Fallback Mistral também falhou parte ${i + 1}:`, mistralError);
        throw new Error(`Falha ao processar parte ${i + 1}: primário Gemini e fallback Mistral falharam`);
      }
    }
    
    // Free memory for this part
    parts[i] = null as any;
  }
  
  await logInfo('processar-autos', `PDF split processing completed: ${parts.length} parts, ${totalPageCount} pages`, jobId);
  
  return {
    rawText: extractedTexts.join('\n\n'),
    pageCount: totalPageCount,
    provider: `gemini-split-${parts.length}`,
    partsCount: parts.length
  };
}

// Generate AI summaries using configured AI provider
async function gerarResumosIA(
  extractedData: any, 
  supabaseAdmin: any, 
  jobId: string,
  userId: string,
  functionStartTime?: number
): Promise<{
  resumos: {
    resumo_peticao: string;
    resumo_contestacao: string;
    descricao_doencas: string;
    nexo_causal: string;
    incapacidade: string;
    referencias_bibliograficas: string;
    quesitos_juizo: string;
    quesitos_reclamante: string;
    quesitos_reclamada: string;
  };
  aiInfo: {
    provider: string;
    model: string;
    summariesGenerated: number;
    summariesFailed: string[];
    errors: Record<string, string>;
  };
}> {
const results: Record<string, string> = {
    resumo_peticao: '',
    resumo_contestacao: '',
    descricao_doencas: '',
    nexo_causal: '',
    incapacidade: '',
    conclusao: '',
    destino_sugerido: '',
    referencias_bibliograficas: '',
    quesitos_juizo: '',
    quesitos_reclamante: '',
    quesitos_reclamada: ''
  };

  // Helper: limpa strings contaminadas com "não identificados" para evitar LLM anchoring
  const sanitizeQuesitos = (text: string | undefined): string => {
    if (!text) return '';
    if (text.toLowerCase().includes('não identificados') || 
        text.toLowerCase().includes('nao identificados')) return '';
    return text;
  };

  // Buscar configuração de IA
  const aiConfig = await getAIConfig();
  console.log(`[gerarResumosIA] Using AI Config - Provider: ${aiConfig.provider}, Model: ${aiConfig.model}`);

  if (!aiConfig.apiKey) {
    console.warn('[gerarResumosIA] No API key configured, skipping AI summaries');
    return {
      resumos: results as any,
      aiInfo: { provider: 'none', model: 'none', summariesGenerated: 0, summariesFailed: [], errors: {} }
    };
  }

  const contexto: Record<string, string> = {
    peticaoInicial: extractedData.textos_brutos?.peticao_inicial || '',
    contestacao: extractedData.textos_brutos?.contestacao || '',
    cids: Array.isArray(extractedData.informacoes_medicas?.cids_mencionados) && extractedData.informacoes_medicas.cids_mencionados.length > 0
      ? extractedData.informacoes_medicas.cids_mencionados.join(', ') 
      : '',
    postoTrabalho: extractedData.posto_trabalho?.ambiente_e_atividades || extractedData.posto_trabalho?.descricao_ambiente || '',
    atividadesLaborais: extractedData.posto_trabalho?.ambiente_e_atividades || extractedData.posto_trabalho?.descricao_atividades || '',
    cargoFuncao: extractedData.posto_trabalho?.cargo_funcao || '',
    historicoOcupacional: extractedData.historico?.historico_ocupacional || '',
    exameFisico: extractedData.exame_clinico?.exame_fisico || '',
    examesComplementares: extractedData.exame_clinico?.exames_complementares || '',
    antecedentes: extractedData.historico?.antecedentes_patologicos || '',
    tratamentos: extractedData.historico?.tratamentos_realizados || '',
    historiaAcidente: extractedData.acidente?.descricao || '',
    historiaAtual: extractedData.historico?.historia_atual || '',
    laudosMedicos: extractedData.exame_clinico?.laudos_medicos || '',
    lesoesDescritas: extractedData.exame_clinico?.lesoes_descritas || '',
    // Quesitos brutos para a sub-rotina automática
    quesitosJuizo: sanitizeQuesitos(extractedData.quesitos?.juizo),
    quesitosReclamante: sanitizeQuesitos(extractedData.quesitos?.reclamante),
    quesitosReclamada: sanitizeQuesitos(extractedData.quesitos?.reclamada),
    // Serão preenchidos dinamicamente após gerar nexo_causal e incapacidade
    nexoCausalGerado: '',
    incapacidadeGerada: '',
    // Texto bruto do processo (head+tail) para busca agressiva de quesitos
    textoProcesso: (extractedData as any)._rawTextTail || ''
  };

  // Fallback robusto: se _rawTextTail se perdeu na memória, reconstruir a partir dos campos já extraídos
  if (!contexto.textoProcesso || contexto.textoProcesso.length < 500) {
    const fallbackProcesso = [
      extractedData.textos_brutos?.peticao_inicial || '',
      extractedData.textos_brutos?.contestacao || '',
      extractedData.resumo_peticao_inicial || '',
      // Quesitos removidos do fallback (podem conter "não identificados" contaminando o contexto)
    ].filter(Boolean).join('\n\n');
    
    if (fallbackProcesso.length > 100) {
      contexto.textoProcesso = fallbackProcesso;
      console.log(`[gerarResumosIA] FALLBACK textoProcesso reconstruido: ${fallbackProcesso.length} chars`);
    } else {
      console.warn('[gerarResumosIA] ALERTA: textoProcesso vazio E fallback insuficiente');
    }
  }

  // Helper: validate if text has enough substance (not just "não informado" or too short)
  const isContentSufficient = (text: string): boolean => {
    if (!text || text.trim().length < 50) return false;
    const lower = text.toLowerCase().trim();
    if (lower === 'não informado' || lower === 'nao informado') return false;
    return true;
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
    tratamentos: contexto.tratamentos ? `${contexto.tratamentos.length} chars` : 'VAZIO',
    quesitosJuizo: contexto.quesitosJuizo ? `${contexto.quesitosJuizo.length} chars` : 'VAZIO',
    quesitosReclamante: contexto.quesitosReclamante ? `${contexto.quesitosReclamante.length} chars` : 'VAZIO',
    quesitosReclamada: contexto.quesitosReclamada ? `${contexto.quesitosReclamada.length} chars` : 'VAZIO',
    textoProcesso: contexto.textoProcesso ? `${contexto.textoProcesso.length} chars` : 'VAZIO'
  });

  // More flexible conditions - generate summaries if we have ANY relevant context
  const hasHistoryContext = !!contexto.historiaAtual || !!contexto.historiaAcidente || !!contexto.historicoOcupacional;
  const hasMedicalContext = !!contexto.cids || !!contexto.examesComplementares || !!contexto.laudosMedicos || !!contexto.lesoesDescritas;

  // PRIORITY ORDER: Most critical summaries first, least critical last
  // If the function crashes mid-way, the most important summaries are already saved
  const summariesToGenerate: Array<{ tipo: string; shouldGenerate: boolean; step: string; progress: number }> = [
    // ANTI-BIAS POLICY: Os 4 campos clínicos críticos (CIDs/doenças, nexo, incapacidade, conclusão/destino)
    // NÃO são mais gerados na importação. O médico decide manualmente na UI e usa a edge function
    // gerar-justificativa-medica para redigir o texto sob demanda. Mantidos com shouldGenerate:false
    // por compatibilidade do pipeline e telemetria.
    { tipo: 'descricao_doencas', shouldGenerate: false, step: 'Descrição de doenças (geração sob demanda pelo médico)', progress: 50 },
    { tipo: 'nexo_causal', shouldGenerate: false, step: 'Nexo causal (geração sob demanda pelo médico)', progress: 58 },
    { tipo: 'incapacidade', shouldGenerate: false, step: 'Incapacidade (geração sob demanda pelo médico)', progress: 66 },
    { tipo: 'conclusao', shouldGenerate: false, step: 'Conclusão (geração sob demanda pelo médico)', progress: 72 },
    { tipo: 'destino_sugerido', shouldGenerate: false, step: 'Destino (geração sob demanda pelo médico)', progress: 74 },
    // PRIORITY 2: Case summaries (only if content is substantial — prevents hallucination)
    { tipo: 'resumo_peticao', shouldGenerate: isContentSufficient(contexto.peticaoInicial), step: 'Gerando resumo da petição inicial...', progress: 78 },
    { tipo: 'resumo_contestacao', shouldGenerate: isContentSufficient(contexto.contestacao), step: 'Gerando resumo da contestação...', progress: 82 },
    // PRIORITY 2.5: Quesitos — respostas automáticas (Zero-Touch)
    { tipo: 'quesitos_juizo', shouldGenerate: false, step: 'Respondendo quesitos do Juízo...', progress: 86 },
    { tipo: 'quesitos_reclamante', shouldGenerate: false, step: 'Respondendo quesitos do Reclamante...', progress: 88 },
    { tipo: 'quesitos_reclamada', shouldGenerate: false, step: 'Respondendo quesitos da Reclamada...', progress: 90 },
    // PRIORITY 3: Referências bibliográficas — geração sob demanda pelo médico (anti-bias)
    { tipo: 'referencias_bibliograficas', shouldGenerate: false, step: 'Referências (geração sob demanda pelo médico)', progress: 92 }
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

    // Check remaining time budget (600s wall_clock_limit)
    if (functionStartTime) {
      const WALL_CLOCK_LIMIT_MS = 600_000;
      const SAFETY_MARGIN_MS = 30_000; // 30s margin to finalize
      const elapsed = Date.now() - functionStartTime;
      const remaining = WALL_CLOCK_LIMIT_MS - elapsed;

      if (remaining < SAFETY_MARGIN_MS) {
        console.warn(`[gerarResumosIA] Time budget exhausted (${Math.round(elapsed/1000)}s elapsed). Skipping remaining summaries.`);
        await logWarn('processar-autos', 
          `Orcamento de tempo esgotado apos ${Math.round(elapsed/1000)}s. Resumos restantes pulados.`, 
          jobId, { skipped: tipo, elapsed: Math.round(elapsed/1000) }
        );
        summaryErrors.push(`${tipo}: Tempo limite da funcao atingido`);
        break;
      }
    }

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
      
      // Debug log para quesitos - rastrear tamanho das variáveis injetadas
      if (tipo.startsWith('quesitos_')) {
        console.log(`[gerarResumosIA] DEBUG QUESITOS ${tipo}:`, {
          quesitosTexto: contexto.quesitosTexto?.length || 0,
          textoProcesso: contexto.textoProcesso?.length || 0,
          nexoCausal: contexto.nexoCausalGerado?.length || 0,
          incapacidade: contexto.incapacidadeGerada?.length || 0
        });
      }
      
      // Set quesitosTexto dynamically before prompt generation for each quesito type
      if (tipo === 'quesitos_juizo') contexto.quesitosTexto = contexto.quesitosJuizo;
      else if (tipo === 'quesitos_reclamante') contexto.quesitosTexto = contexto.quesitosReclamante;
      else if (tipo === 'quesitos_reclamada') contexto.quesitosTexto = contexto.quesitosReclamada;
      
      const prompt = await getPromptForType(tipo, contexto);
      
      // Injetar regra de idioma no final do user prompt para reforçar redundância
      const REGRA_IDIOMA_INLINE = '\n\nREGRA FINAL INQUEBRÁVEL: Todo o texto acima DEVE ser redigido em Português Brasileiro correto e formal, com TODOS os acentos e diacríticos (á, é, í, ó, ú, â, ê, ô, ã, õ, ç). Palavras como "infeccao", "nao", "orgao", "funcoes" são ERROS GRAVES — o correto é "infecção", "não", "órgão", "funções". NUNCA omita acentos.';
      const promptComRegra = prompt + REGRA_IDIOMA_INLINE;
      
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout após ${SUMMARY_TIMEOUT_MS/1000}s aguardando resposta da IA`)), SUMMARY_TIMEOUT_MS);
      });
      
      // Race between AI call and timeout
      // The inner callAI timeout must be < outer race timeout so the outer message wins
      // and the retry path can pick it up as an explicit "Timeout".
      const result = await Promise.race([
        callAI(aiConfig, summarySystemPrompt, promptComRegra, {
          promptType: tipo,
          userId: userId,
          requestTimeoutMs: SUMMARY_INNER_TIMEOUT_MS,
        }),
        timeoutPromise
      ]);
      
      console.log(`[gerarResumosIA] Successfully generated ${tipo}`);
      
      if (tipo in results) {
        (results as any)[tipo] = result.text;
        summariesGenerated++;
        
        // Dynamic context update: after generating nexo_causal or incapacidade,
        // update contexto so quesitos can reference them
        if (tipo === 'nexo_causal') {
          contexto.nexoCausalGerado = result.text;
          contexto.nexoCausal = result.text;
        } else if (tipo === 'incapacidade') {
          contexto.incapacidadeGerada = result.text;
          contexto.incapacidade = result.text;
        } else if (tipo === 'conclusao') {
          contexto.conclusao = result.text;
        } else if (tipo === 'quesitos_juizo') {
          contexto.quesitosTexto = contexto.quesitosJuizo;
        } else if (tipo === 'quesitos_reclamante') {
          contexto.quesitosTexto = contexto.quesitosReclamante;
        } else if (tipo === 'quesitos_reclamada') {
          contexto.quesitosTexto = contexto.quesitosReclamada;
        }
        
        // PROGRESSIVE SAVE: Persist partial results after each successful summary
        // If the function crashes on the next summary, these results are preserved
        try {
          await supabaseAdmin
            .from('import_jobs')
            .update({ 
              result: { 
                partial: true, 
                resumos_parciais: { ...results },
                summariesGenerated,
                lastCompletedSummary: tipo,
                updatedAt: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', jobId);
          console.log(`[gerarResumosIA] Progressive save: ${summariesGenerated} summaries saved after ${tipo}`);
        } catch (saveError) {
          console.warn(`[gerarResumosIA] Failed to save partial results:`, saveError);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      const isTimeout = errorMsg.includes('Timeout');
      
      // Retry once with extended timeout for timeout errors (covers slow providers like GLM-5)
      if (isTimeout) {
        console.warn(`[gerarResumosIA] Timeout on ${tipo}, retrying with extended timeout (${Math.round(SUMMARY_RETRY_TIMEOUT_MS/1000)}s)...`);
        await supabaseAdmin
          .from('import_jobs')
          .update({ 
            current_step: `Tentando novamente ${tipo} (timeout)...`,
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId);
        
        try {
          const retryPrompt = await getPromptForType(tipo, contexto);
          const retryPromptComRegra = retryPrompt + '\n\nREGRA FINAL INQUEBRÁVEL: Todo o texto acima DEVE ser redigido em Português Brasileiro correto e formal, com TODOS os acentos e diacríticos (á, é, í, ó, ú, â, ê, ô, ã, õ, ç). Palavras como "infeccao", "nao", "orgao", "funcoes" são ERROS GRAVES — o correto é "infecção", "não", "órgão", "funções". NUNCA omita acentos.';
          const retryTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Retry timeout após ${Math.round(SUMMARY_RETRY_TIMEOUT_MS/1000)}s`)), SUMMARY_RETRY_TIMEOUT_MS);
          });
          const retryResult = await Promise.race([
            callAI(aiConfig, summarySystemPrompt, retryPromptComRegra, {
              promptType: tipo, userId,
              requestTimeoutMs: SUMMARY_RETRY_TIMEOUT_MS - 5_000,
            }),
            retryTimeout
          ]);
          
          console.log(`[gerarResumosIA] Retry succeeded for ${tipo}`);
          if (tipo in results) {
            (results as any)[tipo] = retryResult.text;
            summariesGenerated++;
            // Progressive save after retry success
            try {
              await supabaseAdmin.from('import_jobs').update({ 
                result: { partial: true, resumos_parciais: { ...results }, summariesGenerated, lastCompletedSummary: tipo, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              console.log(`[gerarResumosIA] Progressive save after retry: ${summariesGenerated} summaries saved after ${tipo}`);
            } catch {}
          }
        } catch (retryError) {
          const retryMsg = retryError instanceof Error ? retryError.message : 'Erro no retry';
          console.error(`[gerarResumosIA] Retry also failed for ${tipo}:`, retryMsg);
          summaryErrors.push(`${tipo}: ${errorMsg} (retry: ${retryMsg})`);
          await logError('processar-autos', `Falha ao gerar ${tipo}: ${errorMsg} (retry falhou)`, jobId, { tipo, provider: aiConfig.provider, model: aiConfig.model });
        }
      } else {
        console.error(`[gerarResumosIA] Error generating ${tipo}:`, error);
        summaryErrors.push(`${tipo}: ${errorMsg}`);
        await logError('processar-autos', `Falha ao gerar ${tipo}: ${errorMsg}`, jobId, { tipo, provider: aiConfig.provider, model: aiConfig.model });
      }
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
    resumos: {
      resumo_peticao: results.resumo_peticao ?? '',
      resumo_contestacao: results.resumo_contestacao ?? '',
      descricao_doencas: results.descricao_doencas ?? '',
      nexo_causal: results.nexo_causal ?? '',
      incapacidade: results.incapacidade ?? '',
      referencias_bibliograficas: results.referencias_bibliograficas ?? '',
      quesitos_juizo: results.quesitos_juizo ?? '',
      quesitos_reclamante: results.quesitos_reclamante ?? '',
      quesitos_reclamada: results.quesitos_reclamada ?? '',
    },
    aiInfo: {
      provider: aiConfig.provider,
      model: aiConfig.model,
      summariesGenerated,
      summariesFailed: failedTypes,
      errors: errorsMap
    }
  };
}

/**
 * Cascata de mitigação para a chamada única de estruturação pós-OCR.
 *
 * A M3 (e outros modelos de chat com contexto longo) frequentemente responde
 * 504/gateway timeout quando recebe ~200k chars de input pedindo JSON de 65k
 * tokens — o `fetchWithRetry` re-tenta 3× com o mesmo payload e falha exatamente
 * no mesmo ponto, queimando ~80s (foi essa a assinatura vista no diagnóstico do
 * Trabalhista). Aqui reduzimos progressivamente `input chars` e `max_tokens`
 * a cada tentativa e, na última, caímos para o gateway Lovable como fallback
 * de provider — sem alterar a configuração global do usuário.
 */
interface StructuringCascadeOpts {
  supabaseAdmin: any;
  jobId: string;
  userId?: string;
  systemPrompt: string;
  userPromptBuilder: (text: string) => string;
  fullText: string;
  promptType: string;
  requestTimeoutMs: number;
}

interface StructuringCascadeResult {
  fillResult: { text: string; provider: string; model: string; usedFallback: boolean };
  attemptsLog: Array<{ attempt: number; inputChars: number; maxTokens: number; provider: string; model: string; durationMs: number; ok: boolean; errorCode?: string }>;
  provider: string;
  model: string;
  cascadeUsed: boolean;
}

function truncateForStructuring(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = Math.floor(maxChars * 0.35);
  const separator = '\n\n[... conteúdo intermediário omitido para processamento ...]\n\n';
  return text.substring(0, headChars) + separator + text.substring(text.length - tailChars);
}

async function runStructuringWithCascade(
  primaryConfig: { provider: string; model: string; endpoint: string; apiKey: string; displayModel?: string },
  opts: StructuringCascadeOpts
): Promise<StructuringCascadeResult> {
  // Escalonamento de payloads (input chars × max_tokens).
  // Tentativa 1 = payload atual. Tentativas 2-3 reduzem input/output.
  // Tentativa 4 = fallback de provider para Lovable Gateway.
  const rungs: Array<{ maxChars: number; maxTokens: number; label: string; useLovableFallback?: boolean }> = [
    { maxChars: 200_000, maxTokens: 65_536, label: 'attempt_1_full' },
    { maxChars: 140_000, maxTokens: 32_768, label: 'attempt_2_shrink' },
    { maxChars: 90_000,  maxTokens: 24_576, label: 'attempt_3_smaller' },
    { maxChars: 90_000,  maxTokens: 24_576, label: 'attempt_4_lovable_fallback', useLovableFallback: true },
  ];

  const attemptsLog: StructuringCascadeResult['attemptsLog'] = [];
  let lastError: any = null;

  const retryableCodes = new Set(['provider_timeout', 'provider_unavailable', 'response_truncated', 'rate_limited']);

  for (let i = 0; i < rungs.length; i++) {
    const rung = rungs[i];
    const attempt = i + 1;

    let configForAttempt = primaryConfig;
    if (rung.useLovableFallback) {
      // Só tenta o fallback do Gateway se a LOVABLE_API_KEY existir no ambiente.
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableKey) {
        console.warn('[structuring-cascade] Attempt 4 pulado: LOVABLE_API_KEY ausente.');
        break;
      }
      // Não sobrescreve config global — construção pontual para esta tentativa.
      configForAttempt = {
        provider: 'lovable',
        model: 'google/gemini-2.5-flash',
        endpoint: 'https://ai.gateway.lovable.dev/v1/chat/completions',
        apiKey: lovableKey,
        displayModel: 'google/gemini-2.5-flash',
      };
    }

    const truncated = truncateForStructuring(opts.fullText, rung.maxChars);
    const userPrompt = opts.userPromptBuilder(truncated);

    try {
      await opts.supabaseAdmin.from('import_jobs').update({
        current_step: `Estruturação pós-OCR · tentativa ${attempt}/${rungs.length} · ${configForAttempt.provider}/${configForAttempt.model} (${truncated.length} chars, max_tokens=${rung.maxTokens})`,
        step_id: 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', opts.jobId);
    } catch (_e) { /* ignore */ }

    console.log(`[structuring-cascade] ${rung.label}: provider=${configForAttempt.provider} model=${configForAttempt.model} inputChars=${truncated.length} maxTokens=${rung.maxTokens}`);
    const started = Date.now();
    try {
      const fillResult = await callAI(
        configForAttempt as any,
        opts.systemPrompt,
        userPrompt,
        {
          promptType: opts.promptType,
          userId: opts.userId,
          maxOutputTokens: rung.maxTokens,
          jsonMode: true,
          requestTimeoutMs: opts.requestTimeoutMs,
          // A cascata é o "retry" agora — não re-tentar o mesmo payload no fetch layer.
          retryOnServerError: false,
        }
      );
      const durationMs = Date.now() - started;
      attemptsLog.push({ attempt, inputChars: truncated.length, maxTokens: rung.maxTokens, provider: configForAttempt.provider, model: configForAttempt.model, durationMs, ok: true });
      console.log(`[structuring-cascade] ✅ ${rung.label} success in ${durationMs}ms`);
      return {
        fillResult,
        attemptsLog,
        provider: configForAttempt.provider,
        model: configForAttempt.model,
        cascadeUsed: attempt > 1,
      };
    } catch (err: any) {
      const durationMs = Date.now() - started;
      const code = err?.code || err?.name || 'unknown';
      const errMsg = err?.message || String(err);
      attemptsLog.push({ attempt, inputChars: truncated.length, maxTokens: rung.maxTokens, provider: configForAttempt.provider, model: configForAttempt.model, durationMs, ok: false, errorCode: code });
      console.warn(`[structuring-cascade] ❌ ${rung.label} failed in ${durationMs}ms: [${code}] ${errMsg.slice(0, 200)}`);
      lastError = err;

      // Só desce a cascata para erros de timeout/truncamento/504/429.
      // Erros terminais (401/402/400) abortam imediatamente.
      const isRetryable = retryableCodes.has(code) ||
        /timeout|timed out|504|502|503|gateway|truncat|max_tokens|too large|context length/i.test(errMsg);
      if (!isRetryable) {
        console.error(`[structuring-cascade] Erro não-recuperável — abortando cascata.`);
        throw err;
      }
    }
  }

  throw lastError || new Error('Estruturação pós-OCR falhou em todas as tentativas da cascata.');
}

/**
 * Process chunked PDF upload (client-side split)
 * Each part is already < 20MB and uploaded to storage
 * This processes each part with OCR, combines results, then structures with AI
 */
async function processarChunkedPDFBackground(
  jobId: string,
  fileParts: string[],
  pageRanges: Array<{ start: number; end: number }>,
  totalPages: number,
  fileName: string,
  supabaseAdmin: any,
  userId: string,
  preExtractedText?: string,
  preExtractedProvider?: string,
  preExtractedModel?: string,
  preExtractedPageCount?: number,
) {
  let attemptId: string | null = null;
  let modelUsed = 'unknown';
  let chunkedOcrProvider = 'unknown';
  // Track current phase so the catch handler can attribute the failure to the correct
  // pipeline stage (OCR vs post-OCR structuring vs summaries) — the UI relies on this
  // to avoid marking a completed OCR as failed when the AI structuring times out.
  let currentPhase: 'extraction' | 'structuring' | 'summaries' | 'finalizing' = 'extraction';
  
  // Heartbeat interval for long-running operations
  let heartbeatInterval: number | null = null;
  
  const startHeartbeat = async (stepDescription: string) => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        await supabaseAdmin.from('import_jobs').update({ 
          updated_at: new Date().toISOString()
        }).eq('id', jobId);
        console.log(`[processar-autos-chunked] Heartbeat: ${stepDescription}`);
      } catch (e) {
        console.warn('[processar-autos-chunked] Heartbeat update failed:', e);
      }
    }, 12000) as unknown as number;
  };
  
  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };
  
  // Timing tracking
  const timings = {
    total: { start: Date.now(), end: 0 },
    pdfExtraction: { start: 0, end: 0 },
    summaries: { start: 0, end: 0 }
  };
  const partCountForDisplay = Math.max(fileParts.length, preExtractedText?.trim() ? 1 : 0);
  
  try {
    console.log(`[processar-autos-chunked] Starting chunked processing for job ${jobId}: ${partCountForDisplay} parts, ${totalPages} pages`);

    // Marca rota (PDF grande → chunked) já no início do result para diagnóstico
    await supabaseAdmin.from('import_jobs').update({
      result: { route: 'chunked_large', partsCount: partCountForDisplay, totalPages, startedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    await logInfo('processar-autos', `Iniciando processamento chunked: ${partCountForDisplay} partes, ${totalPages} páginas`, jobId, {
      partsCount: partCountForDisplay,
      totalPages,
      fileName,
      route: 'chunked_large',
    });

    // Create attempt record
    const { data: attemptData, error: attemptError } = await supabaseAdmin
      .from('import_attempts')
      .insert({
        job_id: jobId,
        attempt_number: 1,
        status: 'processing'
      })
      .select('id')
      .single();

    if (!attemptError && attemptData) {
      attemptId = attemptData.id;
      console.log(`[processar-autos-chunked] Created attempt (${attemptId}) for job ${jobId}`);
    }

    // Start PDF extraction timing
    timings.pdfExtraction.start = Date.now();
    
    // Start heartbeat for long-running OCR operations
    await startHeartbeat('Chunked OCR extraction');
    
    // OCR provider vem do DevPanel (system_config.phase1_ocr_provider) — nada de hardcode.
    const ocrConfig = await getOcrRouterConfig();
    chunkedOcrProvider = ocrConfig.provider;
    const isGlmChunked = ocrConfig.provider === 'glm';
    let ocrProviderUsed = ocrConfig.provider;
    let ocrModelUsed = ocrConfig.geminiModel;

    await supabaseAdmin.from('import_jobs').update({
      current_step: isGlmChunked
        ? `GLM-OCR: preparando processamento de ${partCountForDisplay} parte(s)...`
        : `Preparando OCR (${ocrConfig.provider}) para ${partCountForDisplay} parte(s)...`,
      progress: 4,
      step_id: 'extraction',
      result: { route: 'chunked_large', partsCount: partCountForDisplay, totalPages, ocrProvider: ocrConfig.provider, startedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Process each part with OCR
    const extractedTexts: string[] = [];
    let processedPageCount = 0;

    const failGlmPart = async (
      partIndex: number,
      range: { start: number; end: number },
      message: string,
      startedAt: number,
    ) => {
      const durationMs = Date.now() - startedAt;
      const richMessage =
        `GLM-OCR travou na parte ${partIndex + 1}/${fileParts.length} ` +
        `(págs ${range.start}-${range.end}) após ${Math.round(durationMs / 1000)}s: ${message}`;

      await logError('processar-autos', richMessage, jobId, {
        provider: 'glm',
        part: partIndex + 1,
        totalParts: fileParts.length,
        startPage: range.start,
        endPage: range.end,
        durationMs,
        timeoutMs: GLM_CHUNK_PART_TIMEOUT_MS,
      });

      if (attemptId) {
        await supabaseAdmin
          .from('import_attempts')
          .update({
            status: 'failed',
            error: richMessage,
            completed_at: new Date().toISOString(),
          })
          .eq('id', attemptId);
      }

      await supabaseAdmin
        .from('import_jobs')
        .update({
          status: 'failed',
          error: richMessage,
          current_step: richMessage.slice(0, 220),
          step_id: 'extraction',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return richMessage;
    };

    if (preExtractedText && preExtractedText.trim().length > 0) {
      // OCR client-side / funções curtas já entregou o texto pronto. Pula fase 1.
      ocrProviderUsed = preExtractedProvider || ocrProviderUsed;
      ocrModelUsed = preExtractedModel || ocrModelUsed;
      console.log(`[processar-autos-chunked] preExtractedText recebido (${preExtractedText.length} chars, provider=${ocrProviderUsed}) — pulando fase 1 OCR`);
      await supabaseAdmin.from('import_jobs').update({
        current_step: `Texto OCR já extraído (${preExtractedText.length} chars) — estruturando dados`,
        progress: 40,
        step_id: 'extraction',
        result: { route: 'chunked_large', partsCount: partCountForDisplay, totalPages, ocrProvider: ocrProviderUsed, startedAt: new Date().toISOString(), preExtracted: true },
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      extractedTexts.push(preExtractedText);
      processedPageCount = preExtractedPageCount || totalPages;
    } else {
      for (let i = 0; i < fileParts.length; i++) {
        const partPath = fileParts[i];
        const range = pageRanges[i];

        await supabaseAdmin.from('import_jobs').update({
          current_step: isGlmChunked
            ? `GLM-OCR: preparando parte ${i + 1}/${fileParts.length} (págs ${range.start}-${range.end})...`
            : `Extraindo parte ${i + 1}/${fileParts.length} (págs ${range.start}-${range.end})...`,
          progress: Math.round(5 + (i / fileParts.length) * 35),
          step_id: 'extraction',
          updated_at: new Date().toISOString()
        }).eq('id', jobId);

        console.log(`[processar-autos-chunked] Downloading part ${i + 1}/${fileParts.length}: ${partPath}`);

        // Download part from storage
        const { data: partData, error: downloadError } = await supabaseAdmin.storage
          .from('processos-pdf')
          .download(partPath);

        if (downloadError || !partData) {
          throw new Error(`Falha ao baixar parte ${i + 1}: ${downloadError?.message || 'Dados vazios'}`);
        }

        const partBytes = new Uint8Array(await partData.arrayBuffer());
        const partSizeMB = (partBytes.byteLength / 1024 / 1024).toFixed(2);
        console.log(`[processar-autos-chunked] Part ${i + 1} downloaded: ${partSizeMB}MB`);
        await logInfo('processar-autos', `${isGlmChunked ? 'GLM-OCR' : ocrConfig.provider}: iniciando OCR da parte ${i + 1}/${fileParts.length}`, jobId, {
          provider: ocrConfig.provider,
          part: i + 1,
          totalParts: fileParts.length,
          startPage: range.start,
          endPage: range.end,
          partSizeMB,
          timeoutMs: isGlmChunked ? GLM_CHUNK_PART_TIMEOUT_MS : null,
        });

        // OCR via router — respeita o provider escolhido no DevPanel.
        try {
          if (isGlmChunked) {
            await supabaseAdmin.from('import_jobs').update({
              current_step: `GLM-OCR: aguardando resposta da parte ${i + 1}/${fileParts.length} (págs ${range.start}-${range.end})`,
              progress: Math.round(5 + (i / Math.max(1, fileParts.length)) * 35),
              step_id: 'extraction',
              updated_at: new Date().toISOString(),
            }).eq('id', jobId);
          }

          const partStartedAt = Date.now();
          let timeoutId: number | null = null;
          let partTimedOut = false;
          let ocrResult: Awaited<ReturnType<typeof runOcrWithConfiguredProvider>>;
          try {
            const ocrPromise = runOcrWithConfiguredProvider(partBytes, {
              logPrefix: `[processar-autos-chunked/part-${i + 1}]`,
              pageCount: range.end - range.start + 1,
              onHeartbeat: async (stage, providerProgress) => {
                if (partTimedOut) return;
                const normalizedProgress = Math.max(0, Math.min(100, Number(providerProgress) || 0));
                const overallProgress = Math.round(5 + ((i + normalizedProgress / 100) / Math.max(1, fileParts.length)) * 35);
                const stageLabel = typeof stage === 'string' && stage.startsWith('GLM-OCR')
                  ? stage
                  : `${isGlmChunked ? 'GLM-OCR' : ocrConfig.provider}: ${stage}`;
                await supabaseAdmin.from('import_jobs').update({
                  current_step: `${stageLabel} · parte ${i + 1}/${fileParts.length} (págs ${range.start}-${range.end})`,
                  progress: overallProgress,
                  step_id: 'extraction',
                  updated_at: new Date().toISOString(),
                }).eq('id', jobId);
              },
            });

            ocrResult = isGlmChunked
              ? await Promise.race([
                  ocrPromise,
                  new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(async () => {
                      try {
                      partTimedOut = true;
                        const persisted = await failGlmPart(
                          i,
                          range,
                          `timeout operacional de ${Math.round(GLM_CHUNK_PART_TIMEOUT_MS / 60000)} min sem conclusão`,
                          partStartedAt,
                        );
                        reject(new Error(persisted));
                      } catch (timeoutError) {
                        reject(timeoutError instanceof Error ? timeoutError : new Error(String(timeoutError)));
                      }
                    }, GLM_CHUNK_PART_TIMEOUT_MS) as unknown as number;
                  }),
                ])
              : await ocrPromise;
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }

          ocrProviderUsed = ocrResult.provider;
          ocrModelUsed = ocrResult.model;
          const pageCount = range.end - range.start + 1;
          extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) [${ocrResult.provider}] ===\n${ocrResult.text}`);
          processedPageCount += pageCount;
          console.log(`[processar-autos-chunked] Part ${i + 1} OCR complete (${ocrResult.provider}): ${ocrResult.text.length} chars, ${pageCount} pages`);
          await logInfo('processar-autos', `${ocrResult.provider}: parte ${i + 1}/${fileParts.length} concluída`, jobId, {
            provider: ocrResult.provider,
            model: ocrResult.model,
            part: i + 1,
            totalParts: fileParts.length,
            chars: ocrResult.text.length,
            pageCount,
          });
        } catch (ocrError) {
          console.error(`[processar-autos-chunked] OCR failed for part ${i + 1}:`, ocrError);
          await logError('processar-autos', `${isGlmChunked ? 'GLM-OCR' : ocrConfig.provider}: falha no OCR da parte ${i + 1}/${fileParts.length}`, jobId, {
            provider: ocrConfig.provider,
            part: i + 1,
            totalParts: fileParts.length,
            error: ocrError instanceof Error ? ocrError.message : String(ocrError),
          });
          throw new Error(`Falha no OCR da parte ${i + 1}: ${ocrError instanceof Error ? ocrError.message : 'Erro desconhecido'}`);
        }
      }
    }
    
    timings.pdfExtraction.end = Date.now();
    stopHeartbeat();
    
    // Combine all extracted texts
    const combinedText = extractedTexts.join('\n\n');
    console.log(`[processar-autos-chunked] All parts processed: ${combinedText.length} chars total, ${processedPageCount} pages`);
    
    await logInfo('processar-autos', `OCR chunked concluído: ${partCountForDisplay} partes processadas`, jobId, {
      totalChars: combinedText.length,
      processedPages: processedPageCount,
      extractionTimeMs: timings.pdfExtraction.end - timings.pdfExtraction.start
    });

    // PHASE 2: Structure the combined text with AI
    currentPhase = 'structuring';
    await supabaseAdmin.from('import_jobs').update({ 
      progress: 42, 
      current_step: 'Estruturando dados com IA...', 
      step_id: 'processing',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);

    console.log('[processar-autos-chunked] Starting structured field filling...');
    
    // Get AI config
    const aiConfig = await getAIConfig();

    // Structuring uses a cascade of shrinking payloads + provider fallback.
    // See `runStructuringWithCascade` for the rationale — this replaces the
    // former single-shot 200k/65k call that was 504'ing on MiniMax M3 for
    // large processes and eating ~1m20s on blind fetch-layer retries.
    const structuringStartedAt = Date.now();
    await startHeartbeat('AI structuring (chunked phase 2)');
    let fillResult: Awaited<ReturnType<typeof callAI>>;
    let structuringProviderUsed = `${aiConfig.provider}/${aiConfig.model}`;
    let structuringAttempts: any[] = [];
    try {
      // Periodic progress ping in current_step so the UI shows the elapsed time.
      const structuringProgressInterval = setInterval(async () => {
        try {
          const elapsedSec = Math.round((Date.now() - structuringStartedAt) / 1000);
          await supabaseAdmin.from('import_jobs').update({
            current_step: `Estruturando dados com IA · ${elapsedSec}s (provider ${aiConfig.provider}/${aiConfig.model})`,
            step_id: 'processing',
            updated_at: new Date().toISOString(),
          }).eq('id', jobId);
        } catch (_e) { /* ignore */ }
      }, STRUCTURING_HEARTBEAT_MS) as unknown as number;
      try {
        const cascade = await runStructuringWithCascade(aiConfig, {
          supabaseAdmin,
          jobId,
          userId,
          systemPrompt,
          userPromptBuilder: (text) =>
            `Analise o seguinte texto extraído de ${partCountForDisplay} partes de um documento de processo trabalhista (${totalPages} páginas) e retorne o JSON estruturado:\n\n${text}`,
          fullText: combinedText,
          promptType: 'chunked_import',
          requestTimeoutMs: STRUCTURING_TIMEOUT_MS,
        });
        fillResult = cascade.fillResult;
        structuringProviderUsed = `${cascade.provider}/${cascade.model}`;
        structuringAttempts = cascade.attemptsLog;
        if (cascade.cascadeUsed) {
          await logInfo('processar-autos', `Estruturação salva por cascata (${cascade.attemptsLog.length} tentativas)`, jobId, {
            attempts: cascade.attemptsLog,
            finalProvider: cascade.provider,
            finalModel: cascade.model,
          });
        }
      } finally {
        clearInterval(structuringProgressInterval);
      }
    } finally {
      stopHeartbeat();
    }

    // Bind textForFilling for the downstream _rawTextTail preservation logic below.
    let textForFilling: string | null = truncateForStructuring(combinedText, 200_000);
    modelUsed = structuringProviderUsed;


    // Parse the structured response
    let parsedResult = tryFixTruncatedJson(fillResult.text);
    if (!parsedResult) {
      console.error('[processar-autos-chunked] JSON parsing failed');
      await logError('processar-autos', 'Chunked JSON parse failed', jobId, {
        textLength: fillResult.text?.length,
        textPreview: fillResult.text?.substring(0, 1000),
        textEnding: fillResult.text?.slice(-500)
      });
      throw new Error('Falha na estruturação dos dados');
    }

    let extractedData = ensureValidStructure(parsedResult);
    console.log('[processar-autos-chunked] Data structured successfully');

    // Detecta estruturação vazia (MiniMax/GLM truncou o JSON e devolveu esqueleto).
    // Sintoma real: textos_brutos.peticao_inicial e .contestacao vazios após 190k chars de input.
    // Sem esse fail-fast o job termina "completed" com aiUsage.summaries.count=0 e o usuário
    // vê "Extração parcial" enganosa sem entender que o problema é da estruturação, não do OCR.
    {
      const anyData = extractedData as any;
      const peticao = String(anyData?.textos_brutos?.peticao_inicial || '').trim();
      const contestacao = String(anyData?.textos_brutos?.contestacao || '').trim();
      const sourceLen = combinedText.length;
      const structuringLooksEmpty =
        peticao.length < 50 && contestacao.length < 50 && sourceLen > 20_000;
      const responseLen = fillResult.text?.length || 0;
      const structuringLikelyTruncated = responseLen > 60_000; // 65536 max tokens hit
      if (structuringLooksEmpty) {
        const detail = structuringLikelyTruncated
          ? `A resposta da IA foi truncada em ~${responseLen} caracteres (limite de tokens de saída atingido).`
          : `A IA retornou JSON com campos essenciais vazios apesar de ${sourceLen} caracteres de texto extraído.`;
        const msg = `Estruturação falhou: ${detail} Provider: ${aiConfig.provider}/${aiConfig.model}.`;
        console.error(`[processar-autos-chunked] EMPTY STRUCTURING DETECTED: ${msg}`);
        await logError('processar-autos', msg, jobId, {
          phase: 'structuring',
          provider: aiConfig.provider,
          model: aiConfig.model,
          sourceLen,
          responseLen,
          peticaoLen: peticao.length,
          contestacaoLen: contestacao.length,
          truncated: structuringLikelyTruncated,
        });
        throw new Error(msg);
      }
    }

    // Preservar texto integral para busca de quesitos (sem fatiamento)
    if (textForFilling && textForFilling.length > 0) {
      (extractedData as any)._rawTextTail = textForFilling;
      console.log(`[processar-autos-chunked] Preserved full text for quesitos: ${textForFilling.length} chars`);
    }

    // MEMORY: Free large objects no longer needed for summary generation
    // @ts-ignore - intentional null assignment for memory relief
    textForFilling = null;
    // @ts-ignore
    parsedResult = null;
    console.log('[processar-autos-chunked] MEMORY: Freed extraction text before summaries');

    // PHASE 3: Generate AI summaries
    currentPhase = 'summaries';
    timings.summaries.start = Date.now();
    
    await supabaseAdmin.from('import_jobs').update({ 
      progress: 45, 
      current_step: 'Gerando resumos com IA...', 
      step_id: 'resumo_peticao',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);

    startHeartbeat('AI summary generation (chunked)');
    const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId, timings.total.start);
    stopHeartbeat();
    currentPhase = 'finalizing';
    
    timings.summaries.end = Date.now();
    
    console.log('[processar-autos-chunked] AI summaries generated');

    // Fail-fast: 0 resumos gerados E 0 falhas reais → estruturação devolveu contexto vazio.
    // Sem isso o job termina "completed" com "0 de 2 resumos" e o usuário fica sem diagnóstico.
    if (resumosResult.aiInfo.summariesGenerated === 0 && resumosResult.aiInfo.summariesFailed.length === 0) {
      const msg = `Nenhum resumo pôde ser gerado — a estruturação anterior não produziu texto suficiente (petição/contestação vazias). Provider de estruturação: ${aiConfig.provider}/${aiConfig.model}.`;
      console.error(`[processar-autos-chunked] ${msg}`);
      await logError('processar-autos', msg, jobId, {
        phase: 'summaries',
        provider: aiConfig.provider,
        model: aiConfig.model,
      });
      throw new Error(msg);
    }

    // Add resumos to extracted data
    (extractedData as any).resumos_ia = resumosResult.resumos;

    // Finalize
    await supabaseAdmin.from('import_jobs').update({ 
      progress: 95, 
      current_step: 'Finalizando processamento...',
      step_id: 'finalizing',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);

    timings.total.end = Date.now();

    // Calculate durations
    const pdfExtractionDuration = timings.pdfExtraction.end - timings.pdfExtraction.start;
    const summariesDuration = timings.summaries.end - timings.summaries.start;
    const totalDuration = timings.total.end - timings.total.start;

    console.log(`[processar-autos-chunked] Timing - OCR: ${pdfExtractionDuration}ms, Summaries: ${summariesDuration}ms, Total: ${totalDuration}ms`);

    // Build result
    const result = {
      success: true,
      data: extractedData,
      partialFailures: resumosResult.aiInfo.summariesFailed.length > 0 ? {
        failedSummaries: resumosResult.aiInfo.summariesFailed,
        errors: resumosResult.aiInfo.errors
      } : null,
      aiUsage: {
        pdfExtraction: {
          provider: ocrProviderUsed,
          model: ocrModelUsed,
          durationMs: pdfExtractionDuration,
          usedFallback: false,
          strategy: 'client_side_split',
          partsProcessed: partCountForDisplay,
          totalPages: totalPages
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
      chunkedInfo: {
        partsCount: partCountForDisplay,
        totalPages,
        originalFileName: fileName,
        ocrProvider: ocrProviderUsed,
        ocrModel: ocrModelUsed
      }
    };

    // Update attempt record with success
    if (attemptId) {
      await supabaseAdmin
        .from('import_attempts')
        .update({
          status: 'completed',
          result: {
            summariesCount: resumosResult.aiInfo.summariesGenerated,
            partsProcessed: partCountForDisplay,
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

    console.log(`[processar-autos-chunked] Job ${jobId} completed successfully`);

    await logInfo('processar-autos', `Job chunked concluído com sucesso`, jobId, {
      partsProcessed: partCountForDisplay,
      totalPages,
      totalDurationMs: totalDuration,
      summariesGenerated: resumosResult.aiInfo.summariesGenerated
    });

  } catch (error) {
    console.error(`[processar-autos-chunked] Job ${jobId} failed:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido no processamento chunked';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    await logError('processar-autos', `Job chunked falhou: ${errorMessage}`, jobId, {
      errorMessage,
      errorStack,
      partsCount: partCountForDisplay,
      phase: currentPhase,
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
    
    // Attribute the failure to the correct pipeline phase so the UI does not
    // mark a completed OCR as errored when the post-OCR AI structuring times out.
    // Only prefix with "GLM-OCR:" if we actually failed inside the OCR phase.
    let failureStepLabel: string;
    let failureStepId: string;
    if (currentPhase === 'extraction') {
      failureStepLabel = chunkedOcrProvider === 'glm'
        ? `GLM-OCR: ${errorMessage.slice(0, 180)}`
        : `Erro no OCR: ${errorMessage.slice(0, 180)}`;
      failureStepId = 'extraction';
    } else if (currentPhase === 'structuring') {
      failureStepLabel = `Estruturação pós-OCR falhou: ${errorMessage.slice(0, 180)}`;
      failureStepId = 'processing';
    } else if (currentPhase === 'summaries') {
      failureStepLabel = `Geração de resumos falhou: ${errorMessage.slice(0, 180)}`;
      failureStepId = 'resumo_peticao';
    } else {
      failureStepLabel = `Erro ao finalizar: ${errorMessage.slice(0, 180)}`;
      failureStepId = 'finalizing';
    }

    // Save error
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        status: 'failed',
        error: errorMessage,
        current_step: failureStepLabel,
        step_id: failureStepId,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  } finally {
    stopHeartbeat();
  }
}

// Background processing function
// MEMORY OPTIMIZATION: Download in background + prefer bytes/Files API to avoid base64 duplication
async function processarPDFBackground(
  jobId: string,
  filePath: string,
  fileName: string,
  supabaseAdmin: any,
  isRetry: boolean = false,
  userId: string
) {
  let pdfBytes: Uint8Array | null = null;
  let pdfStream: ReadableStream<Uint8Array> | null = null;
  let pdfSizeBytes = 0;
  const base64FromBytes = (): string => {
    if (!pdfBytes) throw new Error('PDF bytes not available');
    const buf = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    return encode(buf);
  };
  
  let modelUsed = 'unknown';
  let attemptId: string | null = null;
  
  // Heartbeat interval for long-running operations
  let heartbeatInterval: number | null = null;
  
  const startHeartbeat = async (stepDescription: string) => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        await supabaseAdmin.from('import_jobs').update({ 
          updated_at: new Date().toISOString()
        }).eq('id', jobId);
        console.log(`[processar-autos] Heartbeat: ${stepDescription}`);
      } catch (e) {
        console.warn('[processar-autos] Heartbeat update failed:', e);
      }
    }, 12000) as unknown as number; // Every 12 seconds
  };
  
  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };
  
  // Timing tracking
  const timings = {
    total: { start: Date.now(), end: 0 },
    pdfExtraction: { start: 0, end: 0 },
    summaries: { start: 0, end: 0 }
  };
  
  try {
    // Marca rota (PDF pequeno → fast path direto) para diagnóstico
    await supabaseAdmin.from('import_jobs').update({
      result: { route: 'fast_small', fileName, startedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Log job start
    await logInfo('processar-autos', `Iniciando processamento de PDF: ${fileName}`, jobId, {
      isRetry,
      filePath,
      route: 'fast_small',
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
        current_step: isRetry ? 'Reprocessando: baixando PDF...' : 'Baixando PDF...',
        step_id: 'upload',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Download PDF from storage
    // For large files (>20MB), we'll use streaming to avoid memory issues
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('processos-pdf')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error('Falha ao recuperar PDF do armazenamento');
    }

    // Get file size without loading into memory
    pdfSizeBytes = fileData.size;
    console.log(`[processar-autos] Downloaded PDF: ${fileName}, size: ${(pdfSizeBytes / (1024 * 1024)).toFixed(2)}MB`);

    // STREAMING THRESHOLD: Use streaming for files > 20MB to avoid WORKER_LIMIT errors
    const STREAMING_THRESHOLD = 20_000_000; // 20MB
    const useStreaming = pdfSizeBytes > STREAMING_THRESHOLD;
    
    // Only load bytes for small files (FIX: removed duplicate let declaration)
    if (useStreaming) {
      console.log(`[processar-autos] Large PDF detected (${(pdfSizeBytes / 1024 / 1024).toFixed(2)}MB), using STREAMING mode`);
      pdfStream = fileData.stream();
    } else {
      const arrayBuffer = await fileData.arrayBuffer();
      pdfBytes = new Uint8Array(arrayBuffer);
      console.log(`[processar-autos] Small PDF, loaded ${pdfBytes.byteLength} bytes into memory`);
    }

    // Fetch phase-2 configuration and unified OCR config
    // NOTA: `import_strategy` foi removido do DevPanel — o pipeline agora é
    // sempre two-phase (OCR do DevPanel + preenchimento pelo Provider Inventory).
    const { data: strategyData } = await supabaseAdmin
      .from('system_config')
      .select('id, value')
      .in('id', ['text_fill_provider', 'text_fill_model', 'store_extracted_text', 'phase1_gemini_model', 'phase1_ocr_provider']);

    const strategyMap: Record<string, any> = {};
    strategyData?.forEach((item: { id: string; value: any }) => { strategyMap[item.id] = item.value; });

    const usesTwoPhase = true; // Hardcoded: single-pass foi descontinuado
    console.log(`[processar-autos] Import strategy: two_phase (forçado)`);

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

      // Determine OCR provider from config
      const ocrProvider = strategyMap.phase1_ocr_provider || 'gemini';
      console.log(`[processar-autos] Phase 1 OCR provider: ${ocrProvider}`);

      // Determine extraction method: streaming > bytes with Files API > bytes inline
      const useFilesAPI = pdfSizeBytes > 50_000_000;
      console.log(`[processar-autos] PDF size: ${(pdfSizeBytes / (1024 * 1024)).toFixed(2)}MB, useFilesAPI: ${useFilesAPI}, streaming: ${!!pdfStream}`);

      // Get Phase 1 model from config (synchronized with Provider Inventory)
      const phase1Model = strategyMap.phase1_gemini_model || 'gemini-2.5-flash';
      console.log(`[processar-autos] Phase 1 using model: ${phase1Model}`);

      try {
        let extracted: ExtractedContent;
        
        // Check if Mistral OCR is configured
        if (ocrProvider === 'mistral') {
          console.log('[processar-autos] Using MISTRAL OCR for Phase 1...');
          
          const mistralKey = await getMistralAPIKey();
          if (!mistralKey) {
            throw new Error('MISTRAL_API_KEY não configurada. Configure nas secrets do Supabase.');
          }
          
          // For Mistral, we need bytes (not stream)
          let bytesForMistral: Uint8Array;
          
          if (pdfStream) {
            // Convert stream to bytes for Mistral
            const chunks: Uint8Array[] = [];
            const reader = pdfStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            pdfStream = null;
            
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            bytesForMistral = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              bytesForMistral.set(chunk, offset);
              offset += chunk.length;
            }
          } else if (pdfBytes) {
            bytesForMistral = pdfBytes;
          } else {
            throw new Error('No PDF input available for Mistral OCR');
          }
          
          // Check if split is needed for Mistral (limit: 50MB per file)
          if (needsSplit(bytesForMistral.byteLength)) {
            console.log('[processar-autos] PDF needs split for Mistral processing...');
            
            await supabaseAdmin.from('import_jobs').update({ 
              current_step: 'Dividindo PDF grande em partes...', 
              updated_at: new Date().toISOString()
            }).eq('id', jobId);
            
            const { parts, pageRanges, totalPages } = await splitPDF(bytesForMistral, { maxSizeBytes: SPLIT_TARGET_SIZE });
            const extractedTexts: string[] = [];
            let totalPageCount = 0;
            
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              const range = pageRanges[i];
              
              await supabaseAdmin.from('import_jobs').update({ 
                current_step: `Processando parte ${i + 1}/${parts.length} (págs ${range.start}-${range.end})...`,
                progress: Math.round(10 + (i / parts.length) * 30),
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              
              const partResult = await extractWithMistralOCR(part, mistralKey);
              extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) ===\n${partResult.text}`);
              totalPageCount += partResult.pageCount;
              
              // Free memory
              parts[i] = null!;
            }
            
            extracted = {
              rawText: extractedTexts.join('\n\n'),
              pageCount: totalPageCount,
              estimatedSections: ['split-extraction'],
              extractedAt: new Date().toISOString(),
              provider: 'mistral-ocr',
              model: 'mistral-ocr-latest'
            };
          } else {
            // Process directly with Mistral
            const mistralResult = await extractWithMistralOCR(bytesForMistral, mistralKey);
            extracted = {
              rawText: mistralResult.text,
              pageCount: mistralResult.pageCount,
              estimatedSections: ['mistral-ocr-extraction'],
              extractedAt: new Date().toISOString(),
              provider: mistralResult.provider,
              model: mistralResult.model
            };
          }
          
          // Clear bytes after Mistral processing
          pdfBytes = null;
          
        } else {
          // Provedor de OCR configurado no DevPanel (gemini | glm | mistral já tratado
          // acima). Antes: else caía em Gemini hardcoded, ignorando GLM silenciosamente
          // (viola mem://architecture/devpanel-ai-config-global-scope). Agora roteia via
          // ocr-router, que respeita phase1_ocr_provider e streama Gemini >30MB sem OOM.
          console.log(`[processar-autos] Two-phase OCR via router (provider=${ocrProvider}, phase1Model=${phase1Model})...`);
          try {
            let routerResult;
            if (pdfStream) {
              // Router aceita { blob, size } — encapsula o stream num Blob leve
              // para preservar o caminho de streaming direto ao Files API do Gemini.
              const blob = await new Response(pdfStream).blob();
              pdfStream = null;
              routerResult = await runOcrWithConfiguredProvider(
                { blob, size: pdfSizeBytes },
                { logPrefix: '[processar-autos/two-phase]' },
              );
            } else if (pdfBytes) {
              routerResult = await runOcrWithConfiguredProvider(pdfBytes, {
                logPrefix: '[processar-autos/two-phase]',
              });
              pdfBytes = null;
            } else {
              throw new Error('No PDF input available (bytes or stream)');
            }
            extracted = {
              rawText: routerResult.text,
              pageCount: routerResult.pageCount,
              estimatedSections: ['ocr-router'],
              extractedAt: new Date().toISOString(),
              provider: routerResult.provider,
              model: routerResult.model,
            };
          } catch (routerErr) {
            const msg = routerErr instanceof Error ? routerErr.message : String(routerErr);
            if (msg.includes(MINIMAX_CLIENT_RASTERIZE_ERROR)) {
              // MiniMax exige rasterização client-side; no fluxo two-phase da edge
              // não temos como orquestrar isso — propaga p/ o outer catch fazer o
              // fallback single-pass (que trata o mesmo erro via callPDFProvider legado).
              throw routerErr;
            }
            throw routerErr;
          }
        }

        
        console.log('[processar-autos] MEMORY: Cleared PDF input after Phase 1 extraction');
        
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

        // Preservar texto integral para busca de quesitos (sem fatiamento)
        if (textForFilling && textForFilling.length > 0) {
          (extractedData as any)._rawTextTail = textForFilling;
          console.log(`[processar-autos] Preserved full text for quesitos (two-phase): ${textForFilling.length} chars`);
        }

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
        
        // If we were in streaming mode, we can't fallback (stream is consumed)
        if (!pdfBytes && !pdfStream) {
          console.error('[processar-autos] Cannot fallback - PDF input already consumed (streaming mode)');
          throw new Error('Fase 1 falhou e fallback não disponível (modo streaming)');
        }
        
        // Reset timing
        timings.pdfExtraction.start = Date.now();
        
        await supabaseAdmin.from('import_jobs').update({ 
          progress: 10, 
          current_step: 'Extraindo dados do PDF com IA (modo único)...', 
          step_id: 'extraction',
          updated_at: new Date().toISOString()
        }).eq('id', jobId);
        
        // Fallback: OCR via router (respeita DevPanel) + IA generalista.
        try {
          const ocrResult = await runOcrWithConfiguredProvider(pdfBytes!, {
            logPrefix: '[processar-autos/two-phase-fallback]',
          });
          pdfBytes = null;
          const fillResult = await callAI(
            await getAIConfig(),
            systemPrompt,
            `Analise o seguinte texto extraído de um PDF de processo trabalhista e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${ocrResult.text}`,
            { promptType: 'pdf_extraction', userId, maxOutputTokens: 65536, jsonMode: true }
          );
          visionResult = {
            provider: ocrResult.provider,
            model: ocrResult.model,
            text: fillResult.text,
            finishReason: 'STOP',
            usedFallback: false,
          };
        } catch (routerError) {
          const msg = routerError instanceof Error ? routerError.message : String(routerError);
          if (msg.includes(MINIMAX_CLIENT_RASTERIZE_ERROR)) {
            await logWarn('processar-autos', `MiniMax OCR não suportado no fallback single-pass; usando callPDFProvider legado.`, jobId);
            const pdfBase64 = base64FromBytes();
            pdfBytes = null;
            visionResult = await callPDFProvider(pdfBase64, systemPrompt, {
              promptType: 'pdf_extraction',
              userId: userId,
            });
          } else {
            throw routerError;
          }
        }
        
        timings.pdfExtraction.end = Date.now();
        modelUsed = `${visionResult.provider}/${visionResult.model}`;
        
        const parsed = tryFixTruncatedJson(visionResult.text);
        if (!parsed) {
          throw new Error("Não foi possível processar a resposta da IA");
        }
        extractedData = ensureValidStructure(parsed);
      }

    }
    // Ramo single-pass removido: pipeline agora é sempre two-phase.

    if (visionResult?.finishReason === "MAX_TOKENS") {
      console.warn("[processar-autos] Response was truncated due to max tokens limit");
    }
    console.log("[processar-autos] Successfully extracted data from PDF");

    // Save all visionResult metadata before freeing memory
    const visionFinishReason = visionResult?.finishReason || 'STOP';
    const visionProvider = visionResult?.provider || 'unknown';
    const visionUsedFallback = visionResult?.usedFallback || false;
    const visionOriginalProvider = visionResult?.originalProvider;
    const visionFallbackReason = visionResult?.fallbackReason;
    // Fallback: se _rawTextTail não foi definido por nenhum sub-caminho, montar a partir de extractedData
    if (!(extractedData as any)._rawTextTail) {
      const fallbackParts = [
        extractedData.textos_brutos?.peticao_inicial || '',
        extractedData.textos_brutos?.contestacao || '',
        extractedData.quesitos?.juizo || '',
        extractedData.quesitos?.reclamante || '',
        extractedData.quesitos?.reclamada || ''
      ].filter(Boolean).join('\n\n');
      if (fallbackParts.length > 500) {
        (extractedData as any)._rawTextTail = fallbackParts;
        console.log(`[processar-autos] Fallback _rawTextTail from extractedData fields: ${fallbackParts.length} chars`);
      } else {
        console.warn('[processar-autos] No rawTextTail available and fallback too short');
      }
    }

    // MEMORY: Free large objects no longer needed for summary generation
    // visionResult holds the full OCR/extraction text - can be very large
    // @ts-ignore - intentional null assignment for memory relief
    visionResult = null;
    console.log('[processar-autos] MEMORY: Freed visionResult before summaries');

    // Sanitize accent-prone short fields before summary generation
    if (extractedData.historico) {
      extractedData.historico.historia_atual = sanitizeOcrAccents(extractedData.historico.historia_atual);
      extractedData.historico.antecedentes_patologicos = sanitizeOcrAccents(extractedData.historico.antecedentes_patologicos);
      extractedData.historico.tratamentos_realizados = sanitizeOcrAccents(extractedData.historico.tratamentos_realizados);
    }
    if (extractedData.exame_clinico) {
      extractedData.exame_clinico.exame_fisico = sanitizeOcrAccents(extractedData.exame_clinico.exame_fisico);
      extractedData.exame_clinico.laudos_medicos = sanitizeOcrAccents(extractedData.exame_clinico.laudos_medicos);
    }
    console.log('[processar-autos] sanitizeOcrAccents applied to extractedData fields');

    // Generate AI summaries with progress updates
    console.log("[processar-autos] Starting AI summary generation...");
    
    // Start summaries timing
    timings.summaries.start = Date.now();
    
    startHeartbeat('AI summary generation');
    const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId, timings.total.start);
    stopHeartbeat();
    
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
          provider: visionProvider,
          model: modelUsed,
          durationMs: pdfExtractionDuration,
          usedFallback: visionUsedFallback,
          originalProvider: visionOriginalProvider,
          fallbackReason: visionFallbackReason,
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
      truncated: visionFinishReason === "MAX_TOKENS"
    };

    // Update attempt record with success
    if (attemptId) {
      await supabaseAdmin
        .from('import_attempts')
        .update({
          status: 'completed',
          result: {
            summariesCount: resumosResult.aiInfo.summariesGenerated,
            truncated: visionFinishReason === "MAX_TOKENS",
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

    // Enriquecer contexto do alerta buscando dados do job
    let jobFileName = "";
    try {
      const { data: jobRow } = await supabaseAdmin
        .from('import_jobs')
        .select('file_path')
        .eq('id', jobId)
        .maybeSingle();
      const fp = (jobRow as any)?.file_path as string | undefined;
      if (fp) jobFileName = fp.split('/').pop() ?? fp;
    } catch { /* ignora */ }

    notifyPdfErrorFireAndForget({
      modulo: "Trabalhista",
      errorMessage,
      userId,
      periciadoNome: jobFileName || `Job ${jobId.slice(0, 8)}`,
      processo: jobId,
      stage: "processamento",
    });

    
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
  } finally {
    // Always stop heartbeat when done
    stopHeartbeat();
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileName, filePath, retryFilePath, fileParts, pageRanges, totalPages, isChunkedUpload, preExtractedText, preExtractedProvider, preExtractedModel, preExtractedPageCount } = await req.json();

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

    // Validate required fields
    const isRetry = !!retryFilePath;
    const hasPreOcr = typeof preExtractedText === 'string' && preExtractedText.trim().length > 0;
    const normalizedFileParts = Array.isArray(fileParts) ? fileParts : [];
    const normalizedPageRanges = Array.isArray(pageRanges) ? pageRanges : [];
    const isChunked = (isChunkedUpload && normalizedFileParts.length > 0) || hasPreOcr;
    const finalFilePath = filePath || retryFilePath || (normalizedFileParts[0] ?? null);
    const partsLabel = normalizedFileParts.length > 0 ? `${normalizedFileParts.length} partes` : 'texto pré-extraído';

    if (!fileName) {
      return new Response(
        JSON.stringify({ error: "fileName é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!hasPreOcr && !finalFilePath) {
      return new Response(
        JSON.stringify({ error: "filePath ou preExtractedText são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[processar-autos] ${isRetry ? 'Retry' : isChunked ? 'Chunked' : 'New'} request - scheduling background processing for: ${finalFilePath || 'preExtractedText'}${isChunked ? ` (${partsLabel})` : ''}`);

    // Create job record with file_path for retry capability
    const { data: job, error: jobError } = await supabaseAdmin
      .from('import_jobs')
      .insert({
        user_id: userId,
        status: 'processing',
        progress: 0,
        current_step: isRetry ? 'Reprocessando documento...' : isChunked ? `Processando ${partsLabel}...` : 'Iniciando processamento...',
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
    console.log(`[processar-autos] Created job ${jobId} for user ${userId}${isRetry ? ' (RETRY)' : isChunked ? ' (CHUNKED)' : ''}`);

    // Start background processing using EdgeRuntime.waitUntil
    if (isChunked) {
      // For chunked uploads or preExtractedText (MiniMax client-side OCR),
      // pass the parts info to background processor
      const effectiveFileParts = normalizedFileParts;
      const effectivePageRanges = normalizedPageRanges;
      const effectiveTotalPages = totalPages ?? 0;
      // @ts-ignore - EdgeRuntime exists in Supabase Edge Functions
      EdgeRuntime.waitUntil(processarChunkedPDFBackground(
        jobId,
        effectiveFileParts,
        effectivePageRanges,
        effectiveTotalPages,
        fileName,
        supabaseAdmin,
        userId,
        hasPreOcr ? preExtractedText : undefined,
        hasPreOcr ? preExtractedProvider : undefined,
        hasPreOcr ? preExtractedModel : undefined,
        hasPreOcr ? preExtractedPageCount : undefined,
      ));
    } else {
      // @ts-ignore - EdgeRuntime exists in Supabase Edge Functions
      EdgeRuntime.waitUntil(processarPDFBackground(jobId, finalFilePath, fileName, supabaseAdmin, isRetry, userId));
    }

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
