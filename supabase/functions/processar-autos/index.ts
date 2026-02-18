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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout for individual summary generation (2 minutes)
const SUMMARY_TIMEOUT_MS = 120000;

// Constants for PDF processing limits
const GEMINI_PROCESSING_LIMIT = 45_000_000; // 45MB - max size for single Gemini call
const MAX_SPLIT_PARTS = 4; // Maximum parts for split PDFs (~180MB total)
const SPLIT_TARGET_SIZE = 40_000_000; // 40MB per part target

// O system prompt principal foi movido para uma constante para servir como fallback
// O prompt real é buscado via prompt-manager para permitir edição via DevPanel
const defaultSystemPrompt = `Você é um perito médico especialista em medicina do trabalho com vasta experiência em elaboração de laudos periciais. Analise os autos do processo e extraia TODAS as informações disponíveis com MÁXIMO DETALHAMENTO para preencher um laudo pericial completo.

=== REGRAS GERAIS DE EXTRAÇÃO - LEIA COM ATENÇÃO ===

1. NÃO RESUMA. Extraia o MÁXIMO de detalhes disponíveis no documento.
2. Campos de texto descritivo devem ter NO MÍNIMO 3 parágrafos quando a informação existir.
3. Use linguagem técnica MÉDICO-LEGAL apropriada para laudos periciais trabalhistas.
4. Estruture as informações em tópicos/listas quando apropriado para maior clareza.
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
        ESTRUTURE em lista quando possível. Seja específico com datas e resultados.

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
        ESTRUTURE por documento. Liste cada laudo separadamente.
        Exemplo de formato esperado:
        "**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**
        - Diagnósticos: [listar com CIDs]
        - Conclusões: [descrever]
        - Recomendações: [descrever]
        - Limitações: [listar]"

   6.2. exames_complementares:
        Liste CADA exame separadamente com estrutura:
        - Tipo de exame (Radiografia, Ressonância Magnética, Tomografia, EMG, Laboratoriais, etc.)
        - Data de realização
        - Região/área examinada
        - Resultados e achados principais
        - Conclusão do laudo do exame
        Exemplo: "**RNM Coluna Lombar (15/03/2023):** Protrusão discal L4-L5, abaulamento discal L5-S1, estenose foraminal à direita."
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

7.5. AVALIAÇÃO DE SEQUELAS - PARA LAUDOS COM SEQUELAS PERMANENTES:

   7.5.1. tabela_susep (Tabela SUSEP/DPVAT):
          Busque nos autos informações sobre grau de invalidez ou sequelas permanentes:
          - Percentual de invalidez mencionado em laudos médicos ou perícias anteriores
          - Referências à Tabela SUSEP/DPVAT ou outras tabelas de invalidez
          - Item específico da tabela aplicável à lesão/sequela
          - Grau de comprometimento funcional documentado
          - Laudo do INSS sobre invalidez (se B91 ou aposentadoria por invalidez)
          - Perícias anteriores que quantificaram sequelas
          ESTRUTURE: "[X%] de invalidez permanente conforme item [Y] da Tabela SUSEP - [descrição da sequela]"
          Se não houver menção a percentuais de invalidez, deixe vazio.

   7.5.2. dano_estetico:
          Extraia informações sobre danos estéticos documentados:
          - Cicatrizes visíveis (localização anatômica, tamanho, características)
          - Deformidades permanentes (tipo, gravidade, visibilidade)
          - Amputações ou perdas anatômicas
          - Alterações de marcha ou postura permanentes e visíveis
          - Grau do dano estético se mencionado (leve, moderado, grave, gravíssimo)
          - Impacto psicológico do dano estético
          Busque em: laudos médicos, perícias, fotos anexadas aos autos.
          Se não houver menção a dano estético, deixe vazio.

   7.5.3. auxilio_terceiros:
          Extraia informações sobre necessidade de auxílio de terceiros:
          - Se o periciando necessita de ajuda para AVDs (alimentar-se, vestir-se, higiene pessoal)
          - Se necessita de ajuda para locomoção dentro e fora de casa
          - Se necessita de cuidador permanente ou intermitente
          - Tipo de auxílio necessário e frequência (24 horas, apenas para certas atividades)
          - Laudo médico, de assistente social ou perícia que ateste a necessidade
          Busque em: laudos médicos, laudos de assistente social, perícias anteriores.
          Se não houver menção a necessidade de auxílio, deixe vazio.

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
    avaliacao_sequelas: { tabela_susep: "", dano_estetico: "", auxilio_terceiros: "" },
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
    avaliacao_sequelas: { ...defaultStructure.avaliacao_sequelas, ...(data.avaliacao_sequelas || {}) },
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
  resumo_peticao: 'prompt_regen_resumoPeticaoInicial',
  resumo_contestacao: 'prompt_regen_resumoContestacao',
  descricao_doencas: 'prompt_gen_descricao_doencas',
  nexo_causal: 'prompt_gen_nexo_causal',
  incapacidade: 'prompt_gen_incapacidade',
  referencias_bibliograficas: 'prompt_gen_referencias'
};

// Prompts padrão hardcoded como fallback (caso o banco não tenha ou falhe)
const DEFAULT_PROMPTS: Record<string, string> = {
  resumo_peticao: `Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial médico trabalhista.

Texto da Petição Inicial:
\${peticaoInicial}

Instruções:
- Resuma os pontos principais alegados pelo reclamante
- Destaque as doenças/lesões mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos`,

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
    nexoCausal: ctx.nexoCausal || 'Não informado',
    
    // Outros campos que podem ser usados em prompts futuros
    metodologia: ctx.metodologia || 'Não informado',
    conclusao: ctx.conclusao || 'Não informado'
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

const summarySystemPrompt = 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.';

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
      console.warn(`[processar-autos] Gemini failed for part ${i + 1}, trying Mistral OCR fallback...`, geminiError);
      lastError = geminiError instanceof Error ? geminiError : new Error(String(geminiError));
      
      // Try Mistral OCR as fallback
      const mistralKey = getMistralAPIKey();
      if (mistralKey) {
        try {
          const mistralResult = await extractWithMistralOCR(part, mistralKey);
          extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) [Mistral OCR] ===\n${mistralResult.text}`);
          totalPageCount += mistralResult.pageCount;
          console.log(`[processar-autos] Part ${i + 1} complete (Mistral OCR): ${mistralResult.text.length} chars`);
        } catch (mistralError) {
          console.error(`[processar-autos] Both Gemini and Mistral failed for part ${i + 1}:`, mistralError);
          throw new Error(`Falha ao processar parte ${i + 1}: ambos Gemini e Mistral falharam`);
        }
      } else {
        console.error(`[processar-autos] Gemini failed and Mistral API key not configured`);
        throw new Error(`Falha ao processar parte ${i + 1}: Gemini falhou e Mistral não está configurado`);
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
    postoTrabalho: extractedData.posto_trabalho?.descricao_ambiente || '',
    atividadesLaborais: extractedData.posto_trabalho?.descricao_atividades || '',
    cargoFuncao: extractedData.posto_trabalho?.cargo_funcao || '',
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
      
      const prompt = await getPromptForType(tipo, contexto);
      
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
  userId: string
) {
  let attemptId: string | null = null;
  let modelUsed = 'unknown';
  
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
  
  try {
    console.log(`[processar-autos-chunked] Starting chunked processing for job ${jobId}: ${fileParts.length} parts, ${totalPages} pages`);
    
    await logInfo('processar-autos', `Iniciando processamento chunked: ${fileParts.length} partes, ${totalPages} páginas`, jobId, {
      partsCount: fileParts.length,
      totalPages,
      fileName
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
    
    // Get Mistral API key for OCR
    const mistralKey = getMistralAPIKey();
    if (!mistralKey) {
      throw new Error('MISTRAL_API_KEY não configurada para processamento chunked');
    }
    
    // Process each part with OCR
    const extractedTexts: string[] = [];
    let processedPageCount = 0;
    
    for (let i = 0; i < fileParts.length; i++) {
      const partPath = fileParts[i];
      const range = pageRanges[i];
      
      await supabaseAdmin.from('import_jobs').update({ 
        current_step: `Extraindo parte ${i + 1}/${fileParts.length} (págs ${range.start}-${range.end})...`,
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
      
      // Process with Mistral OCR
      try {
        const mistralResult = await extractWithMistralOCR(partBytes, mistralKey);
        const pageCount = range.end - range.start + 1;
        
        extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) ===\n${mistralResult.text}`);
        processedPageCount += pageCount;
        
        console.log(`[processar-autos-chunked] Part ${i + 1} OCR complete: ${mistralResult.text.length} chars, ${pageCount} pages`);
      } catch (ocrError) {
        console.error(`[processar-autos-chunked] OCR failed for part ${i + 1}:`, ocrError);
        throw new Error(`Falha no OCR da parte ${i + 1}: ${ocrError instanceof Error ? ocrError.message : 'Erro desconhecido'}`);
      }
    }
    
    timings.pdfExtraction.end = Date.now();
    stopHeartbeat();
    
    // Combine all extracted texts
    const combinedText = extractedTexts.join('\n\n');
    console.log(`[processar-autos-chunked] All parts processed: ${combinedText.length} chars total, ${processedPageCount} pages`);
    
    await logInfo('processar-autos', `OCR chunked concluído: ${fileParts.length} partes processadas`, jobId, {
      totalChars: combinedText.length,
      processedPages: processedPageCount,
      extractionTimeMs: timings.pdfExtraction.end - timings.pdfExtraction.start
    });

    // PHASE 2: Structure the combined text with AI
    await supabaseAdmin.from('import_jobs').update({ 
      progress: 42, 
      current_step: 'Estruturando dados com IA...', 
      step_id: 'processing',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);

    console.log('[processar-autos-chunked] Starting structured field filling...');
    
    // Get AI config
    const aiConfig = await getAIConfig();
    
    // Smart truncation to prevent MAX_TOKENS
    let textForFilling = combinedText;
    const MAX_INPUT_CHARS = 200_000;

    if (textForFilling.length > MAX_INPUT_CHARS) {
      console.warn(`[processar-autos-chunked] Text too long (${textForFilling.length} chars), applying smart truncation`);
      
      const headChars = Math.floor(MAX_INPUT_CHARS * 0.6);
      const tailChars = Math.floor(MAX_INPUT_CHARS * 0.35);
      const separator = '\n\n[... conteúdo intermediário omitido para processamento ...]\n\n';
      
      textForFilling = textForFilling.substring(0, headChars) + 
                       separator + 
                       textForFilling.substring(textForFilling.length - tailChars);
      
      console.log(`[processar-autos-chunked] Truncated to ${textForFilling.length} chars`);
    }
    
    // Call AI with the combined text
    const fillResult = await callAI(
      aiConfig,
      systemPrompt,
      `Analise o seguinte texto extraído de ${fileParts.length} partes de um documento de processo trabalhista (${totalPages} páginas) e retorne o JSON estruturado:\n\n${textForFilling}`,
      { promptType: 'chunked_import', userId, maxOutputTokens: 65536, jsonMode: true }
    );

    modelUsed = `${aiConfig.provider}/${aiConfig.model}`;

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

    // PHASE 3: Generate AI summaries
    timings.summaries.start = Date.now();
    
    await supabaseAdmin.from('import_jobs').update({ 
      progress: 45, 
      current_step: 'Gerando resumos com IA...', 
      step_id: 'resumo_peticao',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);

    const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId);
    
    timings.summaries.end = Date.now();
    
    console.log('[processar-autos-chunked] AI summaries generated');

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
          provider: 'mistral',
          model: 'mistral-ocr-latest',
          durationMs: pdfExtractionDuration,
          usedFallback: false,
          strategy: 'client_side_split',
          partsProcessed: fileParts.length,
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
        partsCount: fileParts.length,
        totalPages,
        originalFileName: fileName
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
            partsProcessed: fileParts.length,
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
      partsProcessed: fileParts.length,
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
      partsCount: fileParts.length
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
    // Log job start
    await logInfo('processar-autos', `Iniciando processamento de PDF: ${fileName}`, jobId, {
      isRetry,
      filePath
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

    // Fetch import strategy configuration
    const { data: strategyData } = await supabaseAdmin
      .from('system_config')
      .select('id, value')
      .in('id', ['import_strategy', 'text_fill_provider', 'text_fill_model', 'store_extracted_text', 'phase1_gemini_model', 'phase1_ocr_provider']);

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
          
          const mistralKey = getMistralAPIKey();
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
          // Use Gemini (default)
          if (pdfStream) {
            // STREAMING MODE: For large files, stream directly to Files API
            console.log('[processar-autos] Using STREAMING mode for Phase 1...');
            extracted = await extractVisualContent(
              { stream: pdfStream, size: pdfSizeBytes }, 
              { model: phase1Model }
            );
            pdfStream = null; // Stream is consumed
          } else if (pdfBytes) {
            // BYTES MODE: Use existing logic
            extracted = await extractVisualContent(pdfBytes, { 
              useFilesAPI,
              model: phase1Model 
            });
            // MEMORY OPTIMIZATION: Clear PDF bytes after Phase 1 extraction
            pdfBytes = null;
          } else {
            throw new Error('No PDF input available (bytes or stream)');
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
        
        // Fallback requires base64 (only works if we still have bytes)
        const pdfBase64 = base64FromBytes();

        visionResult = await callPDFProvider(pdfBase64, systemPrompt, {
          promptType: 'pdf_extraction',
          userId: userId
        });
        // Clear PDF after use
        pdfBytes = null;
        
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
      
      // Fetch PDF provider configuration for single-pass
      const { data: pdfProviderConfig } = await supabaseAdmin
        .from('system_config')
        .select('id, value')
        .in('id', ['pdf_ai_provider', 'pdf_fallback_provider']);
      
      const pdfProviderMap: Record<string, string> = {};
      pdfProviderConfig?.forEach((item: { id: string; value: unknown }) => {
        pdfProviderMap[item.id] = typeof item.value === 'string' ? item.value : String(item.value);
      });
      
      const pdfProvider = pdfProviderMap['pdf_ai_provider'] || 'gemini';
      const pdfFallbackProvider = pdfProviderMap['pdf_fallback_provider'] || 'gemini';
      
      console.log(`[processar-autos] Single-pass config - Primary: ${pdfProvider}, Fallback: ${pdfFallbackProvider}`);
      
      // Check if Mistral OCR is configured as primary provider
      // NEW: Skip Mistral for large PDFs (>45MB) - converting stream to bytes would cause OOM
      const SAFE_MEMORY_MISTRAL_LIMIT = 45_000_000; // 45MB
      const shouldSkipMistral = pdfProvider === 'mistral-ocr' && pdfSizeBytes > SAFE_MEMORY_MISTRAL_LIMIT;
      
      if (shouldSkipMistral) {
        console.log(`[processar-autos] PDF (${(pdfSizeBytes / 1024 / 1024).toFixed(2)}MB) too large for Mistral OCR (limit: 45MB), using Gemini streaming...`);
        await logInfo('processar-autos', `Mistral OCR pulado - PDF muito grande (${(pdfSizeBytes / 1024 / 1024).toFixed(0)}MB), usando Gemini streaming`, jobId);
        
        await supabaseAdmin.from('import_jobs').update({ 
          current_step: 'PDF grande detectado, usando Gemini streaming...',
          updated_at: new Date().toISOString()
        }).eq('id', jobId);
        
        // Start heartbeat for long operation
        startHeartbeat('Gemini streaming upload');
        
        // Fall through to original flow which handles streaming correctly
      } else if (pdfProvider === 'mistral-ocr') {
        console.log('[processar-autos] Using MISTRAL OCR for single-pass extraction...');
        
        const mistralKey = getMistralAPIKey();
        if (!mistralKey) {
          console.warn('[processar-autos] Mistral key not found, falling back to Gemini');
          await logWarn('processar-autos', 'MISTRAL_API_KEY não configurada, usando Gemini como fallback', jobId);
        } else {
          try {
            await supabaseAdmin.from('import_jobs').update({ 
              current_step: 'Extraindo texto com Mistral OCR (Elite)...',
              updated_at: new Date().toISOString()
            }).eq('id', jobId);
            
            // Ensure we have bytes for Mistral processing
            let bytesForMistral: Uint8Array;
            if (pdfStream) {
              console.log('[processar-autos] Converting stream to bytes for Mistral OCR...');
              const chunks: Uint8Array[] = [];
              const reader = pdfStream.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
              }
              pdfStream = null;
              
              const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
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

            // Preserve bytes reference so Gemini fallback has data if Mistral fails
            const pdfBytesBackup = bytesForMistral;
            
            let mistralRawText = '';
            let mistralPageCount = 0;
            
            // Check if file exceeds Mistral limit (50MB)
            const MISTRAL_SIZE_LIMIT = 50_000_000;
            // NEW: Max size we can safely split in memory (~45MB)
            const SAFE_SPLIT_LIMIT = 45_000_000;
            // Max file size for Gemini Files API fallback
            const GEMINI_MAX_FILE_SIZE = 200_000_000;
            
            if (bytesForMistral.byteLength > MISTRAL_SIZE_LIMIT) {
              // If file is too large for memory-safe splitting (>45MB), use Gemini Files API instead
              if (bytesForMistral.byteLength > SAFE_SPLIT_LIMIT) {
                console.log(`[processar-autos] PDF (${(bytesForMistral.byteLength / 1024 / 1024).toFixed(2)}MB) too large for splitting, using Gemini Files API...`);
                
                if (bytesForMistral.byteLength > GEMINI_MAX_FILE_SIZE) {
                  throw new Error(`PDF muito grande (${(bytesForMistral.byteLength / 1024 / 1024).toFixed(0)}MB). Limite máximo: 200MB. Por favor, divida o arquivo manualmente.`);
                }
                
                await supabaseAdmin.from('import_jobs').update({ 
                  current_step: 'Enviando PDF grande para Gemini Files API...',
                  updated_at: new Date().toISOString()
                }).eq('id', jobId);
                
                // Use Gemini Files API directly (supports up to 2GB, no splitting needed)
                const extracted = await extractVisualContent(bytesForMistral, { 
                  useFilesAPI: true, 
                  model: 'gemini-2.5-flash'
                });
                
                mistralRawText = extracted.rawText;
                mistralPageCount = extracted.pageCount;
                
                // Update model info to reflect the fallback
                await logInfo('processar-autos', `Mistral OCR pulado - PDF muito grande, usando Gemini Files API`, jobId, {
                  sizeMB: (bytesForMistral.byteLength / 1024 / 1024).toFixed(2),
                  pageCount: mistralPageCount
                });
                
                // Clear bytes after processing
                pdfBytes = null;
              } else {
                // File is between 45-50MB, can safely split
                console.log(`[processar-autos] PDF (${(bytesForMistral.byteLength / 1024 / 1024).toFixed(2)}MB) exceeds Mistral limit, splitting...`);
                
                await supabaseAdmin.from('import_jobs').update({ 
                  current_step: 'Dividindo PDF grande para Mistral OCR...',
                  updated_at: new Date().toISOString()
                }).eq('id', jobId);
                
                const { parts, pageRanges } = await splitPDF(bytesForMistral, { maxSizeBytes: 40_000_000 });
                
                console.log(`[processar-autos] Split into ${parts.length} parts for Mistral OCR`);
                
                const partResults: string[] = [];
                for (let i = 0; i < parts.length; i++) {
                  await supabaseAdmin.from('import_jobs').update({ 
                    current_step: `Processando parte ${i + 1}/${parts.length} com Mistral OCR...`,
                    progress: 10 + Math.floor((i / parts.length) * 25),
                    updated_at: new Date().toISOString()
                  }).eq('id', jobId);
                  
                  const partResult = await extractWithMistralOCR(parts[i], mistralKey);
                  partResults.push(partResult.text);
                  mistralPageCount += partResult.pageCount;
                }
                
                mistralRawText = partResults.join('\n\n--- PARTE DIVIDIDA ---\n\n');
              }
            } else {
              // Process directly with Mistral OCR
              const mistralResult = await extractWithMistralOCR(bytesForMistral, mistralKey);
              mistralRawText = mistralResult.text;
              mistralPageCount = mistralResult.pageCount;
            }
            
            // Clear bytes after Mistral processing
            pdfBytes = null;
            console.log(`[processar-autos] Mistral OCR complete: ${mistralPageCount} pages, ${mistralRawText.length} chars`);
            
            // Now use AI to structure the extracted text
            await supabaseAdmin.from('import_jobs').update({ 
              current_step: 'Estruturando dados extraídos...',
              progress: 40,
              updated_at: new Date().toISOString()
            }).eq('id', jobId);
            
            const fillResult = await callAI(
              await getAIConfig(),
              systemPrompt,
              `Analise o seguinte texto extraído de um PDF de processo trabalhista (via Mistral OCR) e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${mistralRawText}`,
              { promptType: 'single_pass_mistral_ocr', userId, maxOutputTokens: 65536, jsonMode: true }
            );
            
            visionResult = {
              provider: 'mistral-ocr',
              model: 'mistral-ocr-latest',
              text: fillResult.text,
              finishReason: 'STOP',
              usedFallback: false
            };
            
            timings.pdfExtraction.end = Date.now();
            modelUsed = 'mistral-ocr/mistral-ocr-latest';
            
            const parsed = tryFixTruncatedJson(visionResult.text);
            if (!parsed) {
              console.error("[processar-autos] Failed to parse Mistral OCR response as JSON");
              throw new Error("Mistral OCR: Não foi possível processar a resposta da IA");
            }
            
            extractedData = ensureValidStructure(parsed);
            
            // Skip the rest of the single-pass flow since we're done
            console.log('[processar-autos] Mistral OCR single-pass completed successfully');
            
          } catch (mistralError) {
            console.error('[processar-autos] Mistral OCR failed:', mistralError);
            await logWarn('processar-autos', `Mistral OCR falhou: ${mistralError instanceof Error ? mistralError.message : 'Erro'}`, jobId);

            // Restore bytes so Gemini fallback has data to work with
            if (!pdfBytes && pdfBytesBackup) {
              pdfBytes = pdfBytesBackup;
              console.log('[processar-autos] PDF bytes restored for Gemini fallback');
            }

            // Check if fallback is also Mistral - if so, fall through to Gemini
            if (pdfFallbackProvider === 'mistral-ocr') {
              console.log('[processar-autos] Fallback is also Mistral OCR, falling through to Gemini...');
            } else {
              console.log('[processar-autos] Falling through to Gemini fallback flow...');
            }
            // Fall through to original flow (if !extractedData block below)
          }
        }
      }
      
      // Original flow (for non-Mistral providers or as fallback)
      if (!extractedData) {
        // NEW: Max size we can safely split in memory (~45MB to avoid WORKER_LIMIT)
        const SAFE_MEMORY_SPLIT_LIMIT = 45_000_000;
        // Max file size we'll accept (Gemini Files API supports up to 2GB, we limit to 200MB for practicality)
        const MAX_ACCEPTED_FILE_SIZE = 200_000_000;
        
        // Check if file is too large for memory operations
        if (pdfSizeBytes > SAFE_MEMORY_SPLIT_LIMIT) {
          console.log(`[processar-autos] PDF (${(pdfSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds safe memory limit (${SAFE_MEMORY_SPLIT_LIMIT / 1024 / 1024}MB)`);
          
          // Reject files that are too large even for Gemini Files API
          if (pdfSizeBytes > MAX_ACCEPTED_FILE_SIZE) {
            throw new Error(`PDF muito grande (${(pdfSizeBytes / 1024 / 1024).toFixed(0)}MB). Limite máximo: 200MB. Por favor, divida o arquivo manualmente antes do upload.`);
          }
          
          // For files 45-200MB: Use Gemini Files API STREAMING (no memory loading, no splitting)
          // This avoids the WORKER_LIMIT memory crash from pdf-splitter
          console.log(`[processar-autos] Using Gemini Files API STREAMING for large PDF (no splitting to avoid OOM)...`);
          
          await supabaseAdmin.from('import_jobs').update({ 
            current_step: 'Enviando PDF grande via streaming para Gemini...',
            progress: 12,
            updated_at: new Date().toISOString()
          }).eq('id', jobId);
          
          // Use stream if available, otherwise use bytes
          // WRAPPED IN TRY/CATCH: If Gemini fails for large PDFs (token limit/INVALID_ARGUMENT),
          // fallback to Mistral OCR with PDF splitting
          let geminiExtractionSucceeded = false;
          
          try {
            if (pdfStream) {
              const extracted = await extractVisualContent(
                { stream: pdfStream, size: pdfSizeBytes },
                { model: 'gemini-2.5-flash' }
              );
              pdfStream = null; // Stream consumed
              
              console.log(`[processar-autos] Streaming extraction complete: ${extracted.rawText.length} chars`);
              
              // Continue with structured extraction
              await supabaseAdmin.from('import_jobs').update({ 
                current_step: 'Estruturando dados extraídos...',
                progress: 45,
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              
              const fillResult = await callAI(
                await getAIConfig(),
                systemPrompt,
                `Analise o seguinte texto extraído de um PDF de processo trabalhista e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${extracted.rawText}`,
                { promptType: 'single_pass_large_streaming', userId, maxOutputTokens: 65536, jsonMode: true }
              );
              
              visionResult = {
                provider: 'gemini-streaming',
                model: extracted.model,
                text: fillResult.text,
                finishReason: 'STOP',
                usedFallback: false
              };
              
              geminiExtractionSucceeded = true;
              
            } else if (pdfBytes) {
              // We have bytes - use Files API upload directly (no splitting)
              const extracted = await extractVisualContent(pdfBytes, { 
                useFilesAPI: true, 
                model: 'gemini-2.5-flash'
              });
              pdfBytes = null; // Free memory
              
              console.log(`[processar-autos] Bytes extraction complete: ${extracted.rawText.length} chars`);
              
              await supabaseAdmin.from('import_jobs').update({ 
                current_step: 'Estruturando dados extraídos...',
                progress: 45,
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              
              const fillResult = await callAI(
                await getAIConfig(),
                systemPrompt,
                `Analise o seguinte texto extraído de um PDF de processo trabalhista e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${extracted.rawText}`,
                { promptType: 'single_pass_large_bytes', userId, maxOutputTokens: 65536, jsonMode: true }
              );
              
              visionResult = {
                provider: 'gemini-files-api',
                model: extracted.model,
                text: fillResult.text,
                finishReason: 'STOP',
                usedFallback: false
              };
              
              geminiExtractionSucceeded = true;
              
            } else {
              throw new Error('No PDF input available for large file processing');
            }
          } catch (geminiError) {
            const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
            
            // Check if this is a capacity/limit error that can be recovered with Mistral fallback
            const isCapacityError = 
              errorMsg.includes('INVALID_ARGUMENT') || 
              errorMsg.includes('exceeds') || 
              errorMsg.includes('All attempts failed') ||
              errorMsg.includes('token') ||
              errorMsg.includes('maximum');
            
            if (isCapacityError) {
              console.log(`[processar-autos] Gemini failed with capacity error, falling back to Mistral OCR with splitting...`);
              await logWarn('processar-autos', `Gemini falhou por limite, iniciando fallback Mistral OCR`, jobId, { errorMsg });
              
              // Check if Mistral key is available
              const mistralKey = getMistralAPIKey();
              if (!mistralKey) {
                throw new Error('PDF muito grande para Gemini e Mistral OCR não disponível. Divida o arquivo manualmente (<45MB).');
              }
              
              // Download PDF bytes from storage for splitting
              await supabaseAdmin.from('import_jobs').update({ 
                current_step: 'Fallback: Baixando PDF para divisão...',
                progress: 15,
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              
              const { data: pdfData, error: dlError } = await supabaseAdmin.storage
                .from('processos-pdf')
                .download(filePath);
              
              if (dlError || !pdfData) {
                throw new Error(`Falha ao baixar PDF para fallback Mistral: ${dlError?.message || 'Dados não disponíveis'}`);
              }
              
              const fallbackPdfBytes = new Uint8Array(await pdfData.arrayBuffer());
              console.log(`[processar-autos] Fallback: PDF downloaded, ${(fallbackPdfBytes.byteLength / 1024 / 1024).toFixed(2)}MB`);
              
              // Split PDF into ~40MB parts
              await supabaseAdmin.from('import_jobs').update({ 
                current_step: 'Fallback: Dividindo PDF em partes...',
                progress: 20,
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              
              const { parts, pageRanges, totalPages } = await splitPDF(fallbackPdfBytes, { maxSizeBytes: 40_000_000 });
              console.log(`[processar-autos] Fallback: Split into ${parts.length} parts (${totalPages} total pages)`);
              
              // Process each part with Mistral OCR
              const partResults: string[] = [];
              let processedPages = 0;
              
              for (let i = 0; i < parts.length; i++) {
                await supabaseAdmin.from('import_jobs').update({ 
                  current_step: `Fallback: Mistral OCR parte ${i + 1}/${parts.length}...`,
                  progress: 25 + Math.floor((i / parts.length) * 20),
                  updated_at: new Date().toISOString()
                }).eq('id', jobId);
                
                const partResult = await extractWithMistralOCR(parts[i], mistralKey);
                partResults.push(partResult.text);
                processedPages += partResult.pageCount;
                
                console.log(`[processar-autos] Fallback: Part ${i + 1}/${parts.length} complete, ${partResult.pageCount} pages`);
              }
              
              const combinedText = partResults.join('\n\n--- PARTE DIVIDIDA ---\n\n');
              console.log(`[processar-autos] Fallback Mistral OCR complete: ${processedPages} pages, ${combinedText.length} chars`);
              
              // Structure the extracted data
              await supabaseAdmin.from('import_jobs').update({ 
                current_step: 'Fallback: Estruturando dados extraídos...',
                progress: 50,
                updated_at: new Date().toISOString()
              }).eq('id', jobId);
              
              const fillResult = await callAI(
                await getAIConfig(),
                systemPrompt,
                `Analise o seguinte texto extraído de um PDF de processo trabalhista (via fallback Mistral OCR após falha do Gemini) e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${combinedText}`,
                { promptType: 'fallback_mistral_split', userId, maxOutputTokens: 65536, jsonMode: true }
              );
              
              visionResult = {
                provider: 'mistral-ocr-fallback',
                model: 'mistral-ocr-latest',
                text: fillResult.text,
                finishReason: 'STOP',
                usedFallback: true,
                splitParts: parts.length
              };
              
              modelUsed = 'mistral-ocr/fallback-split';
              
              await logInfo('processar-autos', `Fallback Mistral OCR completo: ${processedPages} páginas em ${parts.length} partes`, jobId);
              
              geminiExtractionSucceeded = true; // Mark as succeeded (via fallback)
              
            } else {
              // Not a capacity error - rethrow
              throw geminiError;
            }
          }
          
          if (geminiExtractionSucceeded) {
            timings.pdfExtraction.end = Date.now();
            modelUsed = modelUsed || `${visionResult.provider}/${visionResult.model}`;
            
            const parsed = tryFixTruncatedJson(visionResult.text);
            if (!parsed) {
              throw new Error("Não foi possível processar a resposta da IA");
            }
            extractedData = ensureValidStructure(parsed);
          }
          
        } else if (pdfSizeBytes > GEMINI_PROCESSING_LIMIT) {
          // Legacy path for files between 45MB limit and GEMINI_PROCESSING_LIMIT
          // This shouldn't be hit often since SAFE_MEMORY_SPLIT_LIMIT is the same as GEMINI_PROCESSING_LIMIT
          console.log(`[processar-autos] PDF needs splitting (legacy path)...`);
          
          // Need to download stream to bytes for splitting
          if (pdfStream) {
            console.log('[processar-autos] Downloading stream for split processing...');
            const chunks: Uint8Array[] = [];
            const reader = pdfStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            pdfStream = null;
            
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            pdfBytes = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              pdfBytes.set(chunk, offset);
              offset += chunk.length;
            }
            console.log(`[processar-autos] Stream downloaded: ${pdfBytes.byteLength} bytes`);
          }
          
          if (!pdfBytes) {
            throw new Error('No PDF bytes available for split processing');
          }
          
          // Process with split
          const splitResult = await processLargePDFWithSplit(
            pdfBytes,
            'gemini-2.5-flash',
            jobId,
            supabaseAdmin,
            userId
          );
          pdfBytes = null; // Free memory
          
          console.log(`[processar-autos] Split processing complete: ${splitResult.partsCount} parts, ${splitResult.pageCount} pages`);
          
          // Continue with structured extraction using the combined text
          await supabaseAdmin.from('import_jobs').update({ 
            current_step: 'Estruturando dados extraídos...',
            progress: 45,
            updated_at: new Date().toISOString()
          }).eq('id', jobId);
          
          const fillResult = await callAI(
            await getAIConfig(),
            systemPrompt,
            `Analise o seguinte texto extraído de um PDF de processo trabalhista e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${splitResult.rawText}`,
            { promptType: 'single_pass_large_split', userId, maxOutputTokens: 65536, jsonMode: true }
          );
          
          visionResult = {
            provider: splitResult.provider,
            model: 'gemini-2.5-flash',
            text: fillResult.text,
            finishReason: 'STOP',
            usedFallback: false,
            splitParts: splitResult.partsCount
          };
          
        } else if (pdfStream) {
          // STREAMING MODE: For medium-large files (20-45MB), stream directly to Files API
          console.log(`[processar-autos] Medium-large PDF detected (${(pdfSizeBytes / 1024 / 1024).toFixed(2)}MB), using STREAMING for single-pass...`);
          
          // Use extractVisualContent with stream input
          const extracted = await extractVisualContent(
            { stream: pdfStream, size: pdfSizeBytes }, 
            { model: 'gemini-2.0-flash' }
          );
          pdfStream = null; // Stream is consumed
          console.log('[processar-autos] MEMORY: Stream consumed, no bytes in memory');
          
          // The extracted text serves as input for structured parsing
          const fillResult = await callAI(
            await getAIConfig(),
            systemPrompt,
            `Analise o seguinte texto extraído de um PDF de processo trabalhista e retorne os dados estruturados em JSON conforme o schema esperado:\n\n${extracted.rawText}`,
            { promptType: 'single_pass_large', userId, maxOutputTokens: 65536, jsonMode: true }
          );
          
          visionResult = {
            provider: 'gemini-streaming',
            model: extracted.model,
            text: fillResult.text,
            finishReason: 'STOP',
            usedFallback: false
          };
        } else if (pdfBytes) {
          // Small PDFs (<20MB): use base64 inline (original flow)
          const pdfBase64 = base64FromBytes();
          
          // Clear bytes after conversion
          pdfBytes = null;
          console.log('[processar-autos] MEMORY: Cleared PDF bytes after base64 conversion');

          visionResult = await callPDFProvider(pdfBase64, systemPrompt, {
            promptType: 'pdf_extraction',
            userId: userId
          });
        } else {
          throw new Error('No PDF input available (bytes or stream)');
        }
        
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
    const { fileName, filePath, retryFilePath, fileParts, pageRanges, totalPages, isChunkedUpload } = await req.json();

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
    const isChunked = isChunkedUpload && fileParts?.length > 0;
    const finalFilePath = filePath || retryFilePath || (isChunked ? fileParts[0] : null);
    
    if (!finalFilePath || !fileName) {
      return new Response(
        JSON.stringify({ error: "filePath e fileName são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[processar-autos] ${isRetry ? 'Retry' : isChunked ? 'Chunked' : 'New'} request - scheduling background processing for: ${finalFilePath}${isChunked ? ` (${fileParts.length} parts)` : ''}`);

    // Create job record with file_path for retry capability
    const { data: job, error: jobError } = await supabaseAdmin
      .from('import_jobs')
      .insert({
        user_id: userId,
        status: 'processing',
        progress: 0,
        current_step: isRetry ? 'Reprocessando documento...' : isChunked ? `Processando ${fileParts.length} partes...` : 'Iniciando processamento...',
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
      // For chunked uploads, pass the parts info to background processor
      // @ts-ignore - EdgeRuntime exists in Supabase Edge Functions
      EdgeRuntime.waitUntil(processarChunkedPDFBackground(jobId, fileParts, pageRanges, totalPages, fileName, supabaseAdmin, userId));
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
