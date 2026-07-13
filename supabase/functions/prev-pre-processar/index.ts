/**
 * prev-pre-processar
 *
 * Pré-processamento de PDF de perícia PREVIDENCIÁRIA.
 * Fluxo:
 *  1. Baixa o PDF do bucket `prev-pdfs`.
 *  2. OCR via Mistral (mesmo shared helper usado em Impugnação).
 *  3. Extração estruturada via IA (getAIConfig + callAI, mesma camada do trabalhista).
 *  4. Salva `prev_extracao` (JSON), marca `pdf_processado=true` e cria entradas em `prev_documentos`.
 *
 * Isolado do módulo trabalhista. Não toca em `laudos` nem em `processos-pdf`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOcrRouterConfig, runOcrWithConfiguredProvider } from "../_shared/ocr-router.ts";
import { getAIConfig, callAI, classifyAIProviderError } from "../_shared/ai-config.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";
import { classifyMistralError, isMistralError } from "./_mistral-errors.ts";
import { notifyPdfErrorFireAndForget } from "../_shared/notify-pdf-error.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  periciaId: string;
  /**
   * Texto OCR já extraído pelo pipeline client-side (usado quando o provider
   * configurado é MiniMax — rasterização é feita no navegador para não estourar
   * o limite de CPU de 2s da edge function).
   */
  preExtractedText?: string;
  preExtractedProvider?: string;
  preExtractedModel?: string;
  preExtractedPageCount?: number;
}

const DEFAULT_EXTRACTION_PROMPT = `Você é um perito médico judicial extraindo dados objetivos de um processo previdenciário (INSS) para uso em uma futura perícia.

Sua tarefa é ler o texto OCR do processo e devolver um JSON ESTRITO com os campos abaixo. Não invente. Se um campo não existir no documento, use string vazia "" (ou array vazio []).

NUNCA emita juízo médico, conclusão pericial, nexo, incapacidade ou diagnóstico próprio. Apenas EXTRAIA o que está escrito.

FORMATO DE SAÍDA (JSON puro, sem markdown, sem comentários):
{
  "identificacao": {
    "nome": "",
    "cpf": "",
    "rg": "",
    "data_nascimento": "",
    "idade": "",
    "sexo": "",
    "estado_civil": "",
    "escolaridade": "",
    "profissao": "",
    "ultima_atividade": "",
    "pessoas_mesmo_teto": ""
  },
  /* REGRAS de identificacao:
     - tempo_sem_trabalhar: NÃO extrair. Este campo é preenchido manualmente pelo perito.
     - pessoas_mesmo_teto: SOMENTE preencher se o benefício pleiteado for BPC/LOAS
       (Benefício de Prestação Continuada / amparo assistencial). Em todos os outros
       benefícios (auxílio-doença, aposentadoria por invalidez, etc.), deixe "".
       Quando aplicável, descrever brevemente, ex.: "3 pessoas: esposa e dois filhos".
     - estado_civil: usar SOMENTE um destes valores literais, quando explícito no
       processo: "União estável", "Solteiro(a)", "Casado(a)", "Divorciado(a)",
       "Viúvo(a)". Se não estiver explícito, "".
     - escolaridade: SEMPRE preencher quando houver QUALQUER menção
       (carteira de trabalho, qualificação na petição inicial, anamnese,
       depoimento, formulários do INSS, currículo). Usar OBRIGATORIAMENTE
       um destes valores literais (escolha o mais próximo, mapeando sinônimos):
       "Analfabeto" (não-alfabetizado, sem instrução),
       "Ensino fundamental incompleto" (primário incompleto, 1º grau incompleto, série inicial),
       "Ensino fundamental completo" (primário completo, 1º grau completo, 8ª/9ª série),
       "Ensino médio incompleto" (2º grau incompleto, colegial incompleto),
       "Ensino médio completo" (2º grau completo, colegial completo, ensino técnico),
       "Ensino superior incompleto" (universitário incompleto, graduação incompleta),
       "Ensino superior completo" (graduado, universitário, pós-graduação).
       Use EXATAMENTE um dos 7 rótulos acima. Se realmente não houver
       nenhuma menção, deixe "". */
  "processo": {
    "numero": "",
    "vara": "",
    "comarca": "",
    "beneficio_pleiteado": "",
    "data_distribuicao": ""
  },
  "historia_clinica": "",
  "historia_laboral": "",
  "queixa_principal": "",
  "comorbidades": "",
  "medicacoes": [],
  "medicacoes_uso": "",
  /* medicacoes_uso: TEXTO CORRIDO com as medicações de uso contínuo declaradas
     pelo periciado/processo, separadas por vírgula (ex.: "Losartana 50mg 1x/dia,
     Metformina 850mg 2x/dia, Dipirona se dor"). Vazio se não houver. */
  "comorbidades_fixas": {
    "has": false,
    "dm2": false,
    "dislipidemia": false,
    "hipotireoidismo": false,
    "ansiedade": false,
    "depressao": false,
    "fibromialgia": false,
    "obesidade": false,
    "cardiopatia": false,
    "dpoc": false,
    "irc": false,
    "ar": false
  },
  /* comorbidades_fixas: marque true para CADA comorbidade EXPLICITAMENTE
     descrita no processo (laudo, receita, anamnese, CID, exames).
     É ESPERADO marcar várias quando o processo cita várias. Não invente:
     se o processo não cita uma comorbidade, deixe false.
     Mapeamento (sinônimos e CIDs também valem como menção explícita):
       has = Hipertensão arterial sistêmica / HAS / "hipertenso" / I10;
       dm2 = Diabetes mellitus tipo 2 / DM2 / "diabético" / E11;
       dislipidemia = Dislipidemia / "colesterol alto" / E78;
       hipotireoidismo = Hipotireoidismo / E03 / uso de levotiroxina;
       ansiedade = Transtorno de ansiedade / ansiedade generalizada / F41;
       depressao = Transtorno depressivo / depressão / F32 / F33;
       fibromialgia = Fibromialgia / M79.7;
       obesidade = Obesidade / IMC > 30 declarado / E66;
       cardiopatia = Cardiopatia / insuf. cardíaca / IAM prévio / I20-I25 / I50;
       dpoc = Doença pulmonar obstrutiva crônica / DPOC / J44;
       irc = Insuficiência renal crônica / IRC / N18;
       ar = Artrite reumatoide / AR / M05 / M06.
     NÃO inferir por sintoma genérico (ex.: "dor lombar" não vira nada). */
  "cids_alegados": [],
  "tratamentos": "",
  "afastamentos": "",
  "documentos": [
    { "tipo": "laudo|exame|receita|pedido|outro", "data": "AAAA-MM-DD ou ''", "resumo": "uma frase objetiva" }
  ],
  "quesitos_juizo": [],
  "quesitos_autor": [],
  "quesitos_reu": []
}

REGRAS:
- Datas no formato AAAA-MM-DD quando possível; caso contrário, deixe como aparece no texto.
- CIDs no formato "X00.0 - Descrição" quando descrição estiver presente; senão só o código.
- "documentos" deve listar laudos, exames, receitas e pedidos médicos mencionados, com data e um resumo curto.
- Português brasileiro com acentuação correta.
- PROIBIDO usar a expressão "IA".
- PROIBIDO usar markdown.

TEXTO OCR DO PROCESSO:
\${ocrText}`;


const SYSTEM_PROMPT =
  'Você extrai dados objetivos de processos judiciais previdenciários e devolve APENAS JSON válido, sem markdown e sem texto adicional. É proibido usar a expressão "IA".';

/**
 * Reduz texto OCR preservando cabeça e cauda (quesitos costumam ficar no fim).
 */
function trimOcrPreservingTail(text: string, maxChars = 120_000): string {
  if (text.length <= maxChars) return text;
  const headSize = Math.floor(maxChars * 0.66);
  const tailSize = maxChars - headSize;
  const head = text.slice(0, headSize);
  const tail = text.slice(-tailSize);
  return `${head}\n\n[...trecho omitido por limite de contexto...]\n\n${tail}`;
}

function classifyProcessingError(
  err: unknown,
  fallback?: { provider?: string; model?: string; stage?: string },
) {
  const msg = err instanceof Error ? err.message : String(err || "Erro desconhecido");
  const classified = classifyAIProviderError(
    err,
    fallback?.provider || "backend",
    fallback?.model || "processamento",
    fallback?.stage || "processamento",
  );

  if (/Gemini OCR timeout|pdf-visual-extractor|OCR timeout|generateContent.*timeout/i.test(msg)) {
    return {
      error:
        "Tempo excedido no OCR Gemini. O PDF demorou demais para a leitura visual síncrona; tente um PDF menor/dividido ou use outro OCR no DevPanel para este documento.",
      code: "provider_timeout",
      stage: "ocr",
      provider: "gemini",
      model: fallback?.model || null,
      upstreamStatus: null,
      technicalDetail: msg.slice(0, 1200),
      httpStatus: 504,
    };
  }

  const httpStatus =
    classified.code === "quota_exceeded" ? 402 :
    classified.code === "invalid_key" ? 401 :
    classified.code === "rate_limited" ? 429 :
    classified.code === "invalid_request" ? 400 :
    classified.code === "provider_timeout" ? 504 :
    classified.code === "provider_unavailable" ? 503 :
    classified.code === "response_truncated" ? 502 : 500;

  return {
    error: classified.message,
    code: classified.code,
    stage: classified.stage,
    provider: classified.provider,
    model: classified.model,
    upstreamStatus: classified.upstreamStatus,
    technicalDetail: classified.technicalDetail,
    httpStatus,
  };
}

/**
 * Detecta sinais de truncamento na saída da IA (chaves/colchetes desbalanceados,
 * string aberta, ausência de '}' final).
 */
function looksTruncated(s: string): boolean {
  const t = s.trim();
  if (!t.endsWith("}") && !t.endsWith("]")) return true;
  let open = 0, close = 0, bOpen = 0, bClose = 0;
  let inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") open++;
    else if (c === "}") close++;
    else if (c === "[") bOpen++;
    else if (c === "]") bClose++;
  }
  return inStr || open !== close || bOpen !== bClose;
}

/**
 * Parser robusto de JSON com reparo em cascata (8 etapas).
 * Inspirado no padrão `tryFixTruncatedJson` do processar-autos (trabalhista),
 * reimplementado localmente para manter isolamento do módulo previdenciário.
 */
function parseAIJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();

  // 1) strip de fences ``` / ```json
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  // 2) localiza primeiro '{'
  const first = s.indexOf("{");
  if (first < 0) return null;
  s = s.slice(first);

  // tentativa direta
  try { return JSON.parse(s); } catch { /* segue para reparo */ }

  // 3) limpa caracteres de controle (preserva \n \r \t)
  let repaired = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 4) remove vírgulas penduradas
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");

  // 5) se string final aberta, fecha aspas; balanceia [] e {}
  let inStr = false, esc = false;
  let curly = 0, square = 0;
  for (let i = 0; i < repaired.length; i++) {
    const c = repaired[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") curly++;
    else if (c === "}") curly--;
    else if (c === "[") square++;
    else if (c === "]") square--;
  }
  if (inStr) repaired += '"';
  // remove vírgula final solta antes de fechar
  repaired = repaired.replace(/,\s*$/, "");
  while (square-- > 0) repaired += "]";
  while (curly-- > 0) repaired += "}";

  // 6) nova tentativa
  try { return JSON.parse(repaired); } catch { /* segue */ }

  // 7) fallback: corta no último '}' que produz parse válido
  for (let i = repaired.lastIndexOf("}"); i > 0; i = repaired.lastIndexOf("}", i - 1)) {
    const candidate = repaired.slice(0, i + 1).replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(candidate); } catch { /* continua */ }
  }

  // 8) falhou
  return null;
}

// ============================================================
// Normalização defensiva de escolaridade
// ============================================================

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeEscolaridade(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  const n = stripDiacritics(text).replace(/[.;,]+$/g, "").trim();

  const direct: Record<string, string> = {
    "analfabeto": "Analfabeto",
    "ensino fundamental incompleto": "Ensino fundamental incompleto",
    "ensino fundamental completo": "Ensino fundamental completo",
    "ensino medio incompleto": "Ensino médio incompleto",
    "ensino medio completo": "Ensino médio completo",
    "ensino superior incompleto": "Ensino superior incompleto",
    "ensino superior completo": "Ensino superior completo",
  };
  if (direct[n]) return direct[n];

  const hasInc = /\binc(ompleto|\.?)\b|nao concluid|sem conclus|cursando/.test(n);
  const hasComp = /\bcompl(eto|\.?)\b|concluid|formad/.test(n);

  if (/analfabet|sem instruc|nao alfabet|nao-alfabet/.test(n)) return "Analfabeto";
  if (/superior|graduac|universitari|faculdade|pos[\s-]?graduac|mestrad|doutorad|especializac|bachare|licenciatur|tecnologo/.test(n)) {
    return hasInc ? "Ensino superior incompleto" : "Ensino superior completo";
  }
  if (/\bmedio\b|\b2[ºo°]?\s*grau\b|segundo\s+grau|colegial|tecnico|cientifico|eja\s*medio|ensino tecnico/.test(n)) {
    return hasInc ? "Ensino médio incompleto" : "Ensino médio completo";
  }
  if (/fundamental|\b1[ºo°]?\s*grau\b|primeiro\s+grau|primari|ginasi|\b[1-9]\s*[ªa]?\s*serie\b|oitava\s+serie|nona\s+serie|eja\s*fundamental/.test(n)) {
    if (hasInc) return "Ensino fundamental incompleto";
    if (/\b[89]\s*[ªa]?\s*serie\b|oitava\s+serie|nona\s+serie/.test(n)) return "Ensino fundamental completo";
    return hasComp ? "Ensino fundamental completo" : "Ensino fundamental incompleto";
  }

  return "";
}

function inferEscolaridadeFromText(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  const n = stripDiacritics(text);

  const snippets: string[] = [];
  const marker = /(escolaridade|grau\s+de\s+instrucao|nivel\s+de\s+instrucao|instru[cç][aã]o)/gi;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text)) && snippets.length < 8) {
    snippets.push(text.slice(Math.max(0, match.index - 160), match.index + 220));
  }
  for (const snippet of snippets) {
    const found = normalizeEscolaridade(snippet);
    if (found) return found;
  }

  if (/analfabet|sem instruc|nao alfabet/.test(n)) return "Analfabeto";
  if (/ensino\s+superior|curso\s+superior|nivel\s+superior|graduac|universitari|faculdade|bachare|licenciatur|tecnologo|pos[\s-]?graduac|mestrad|doutorad/.test(n)) {
    return /incomplet|nao\s+concluid|sem\s+conclus|cursando/.test(n)
      ? "Ensino superior incompleto"
      : "Ensino superior completo";
  }
  if (/ensino\s+medio|\b2[ºo°]?\s*grau\b|segundo\s+grau|colegial|ensino\s+tecnico|curso\s+tecnico/.test(n)) {
    return /incomplet|nao\s+concluid|sem\s+conclus|cursando/.test(n)
      ? "Ensino médio incompleto"
      : "Ensino médio completo";
  }
  if (/ensino\s+fundamental|\b1[ºo°]?\s*grau\b|primeiro\s+grau|primari|ginasi|\b[1-9]\s*[ªa]?\s*serie\b|oitava\s+serie|nona\s+serie/.test(n)) {
    if (/incomplet|nao\s+concluid|sem\s+conclus|cursando/.test(n)) return "Ensino fundamental incompleto";
    if (/\b[89]\s*[ªa]?\s*serie\b|oitava\s+serie|nona\s+serie|complet|concluid/.test(n)) return "Ensino fundamental completo";
    return "Ensino fundamental incompleto";
  }

  return "";
}

function inferEscolaridadeFromParsed(parsed: any, ocrText?: string): string {
  const direct = normalizeEscolaridade(parsed?.identificacao?.escolaridade);
  if (direct) return direct;

  const candidates: unknown[] = [
    parsed?.historia_clinica,
    parsed?.historia_laboral,
    parsed?.queixa_principal,
    parsed?.tratamentos,
    parsed?.afastamentos,
  ];

  if (Array.isArray(parsed?.documentos)) {
    for (const d of parsed.documentos) {
      candidates.push(d?.resumo, d?.trecho_original);
    }
  }

  for (const candidate of candidates) {
    const found = inferEscolaridadeFromText(candidate);
    if (found) return found;
  }

  const fromOcr = inferEscolaridadeFromText(ocrText);
  if (fromOcr) return fromOcr;

  return "";
}

// ============================================================
// Unificação da Queixa Principal (prompt do cliente)
// ============================================================

const QUEIXA_SYSTEM_PROMPT =
  'Você é médico perito judicial. Retorne APENAS o parágrafo técnico final em português, sem markdown, sem bullets, sem títulos, sem aspas e sem a palavra "IA".';

const DEFAULT_QUEIXA_PROMPT = `Você é médico perito judicial especialista em perícias ortopédicas, previdenciárias e trabalhistas.

Sua tarefa é reescrever e UNIFICAR todas as seções selecionadas pelo usuário, transformando-as exclusivamente em QUEIXA PRINCIPAL e parte inicial da ANAMNESE.

FOCALIZE APENAS EM:
1. Queixa principal.
2. Tempo de evolução.
3. Evolução, recorrência ou progressão.
4. Características dos sintomas.
5. Irradiação, parestesia ou sintomas associados, quando informados.
6. Antecedentes traumáticos relevantes, quando informados.
7. Repercussão funcional referida.

REGRAS OBRIGATÓRIAS:
1. Una todas as informações em um único texto coeso.
2. Elimine repetições.
3. Organize a frase principal nesta ordem fixa e inegociável:
   (a) queixa principal;
   (b) irradiação e parestesia (quando houver);
   (c) tempo de evolução (com início há aproximadamente [X ou _] anos);
   (d) encerramento padrão (episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais).
4. Não acrescentar medicações, tratamentos, fisioterapia, acompanhamento médico, exames, documentos ou comorbidades.
5. Não emitir conclusão sobre incapacidade laboral.
6. Não presumir diagnóstico não informado.
7. Não ampliar os fatos além do que foi descrito.
8. Usar sempre A parte pericianda como sujeito principal.
9. Preferir o verbo refere em vez de relata, salvo em histórico de trauma onde se usa relata.
10. TEMPLATE OFICIAL da frase principal (preencher os colchetes; omitir o trecho de irradiação se não houver):
    "A parte pericianda refere quadro de [queixa], com irradiação e parestesia para [membros], com início há aproximadamente [tempo ou _] anos, relatando episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais."
11. Quando houver irradiação ou parestesia, descrevê-la SEMPRE antes do tempo de evolução, no formato: "com irradiação e parestesia para o segmento informado".
12. Quando houver trauma, usar: A parte pericianda relata histórico de trauma ocorrido em [data], ocasião em que sofreu [lesão]. Desde o evento, refere [sintomas], os quais associa diretamente ao trauma inicial.
13. Quando houver coxalgia, tratá-la como queixa do segmento axial, descrevendo-a junto à coluna e não com as artralgias periféricas.
14. POSIÇÃO FIXA DO TEMPO: o tempo de evolução entra SEMPRE depois da irradiação/parestesia e SEMPRE antes do encerramento padrão. NUNCA no início da frase. NUNCA depois do encerramento. NUNCA vinculado a queixa de outro sistema.
15. Queixas emocionais em frase própria no final: Acrescenta queixas emocionais, incluindo os sintomas referidos, com repercussão referida no convívio social e na qualidade de vida.
16. Corrigir ortografia, pontuação, concordância e repetições.
17. Não usar bullets, título, cabeçalho, markdown ou comentários.
18. Produzir apenas o texto final em um único parágrafo técnico e coeso.
19. Se houver múltiplas queixas, iniciar pela queixa principal mais específica e agrupar as demais de forma anatômica e lógica.
20. TEMPO DE EVOLUÇÃO — regra crítica:
    - PROIBIDO inventar, estimar ou inferir o tempo a partir de datas de exames, laudos, afastamentos, receitas, início de tratamento ou qualquer outro indício indireto.
    - Se o tempo de evolução estiver EXPLÍCITO no relato do processo (ex.: "há 5 anos", "desde 2019"), usar o valor informado: "com início há aproximadamente 5 anos".
    - Se o tempo NÃO estiver explícito, NÃO OMITIR o trecho: inserir o placeholder underline exatamente como: "com início há aproximadamente _ anos" — o perito preencherá manualmente durante a consulta.
21. Se faltar repercussão funcional, não inventar. Omitir.
22. O encerramento padrão "relatando episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais" deve aparecer sempre por último na frase principal, após o tempo de evolução.

TEXTOS / SEÇÕES SELECIONADAS:
\${textoSelecionado}

Reescreva em um único parágrafo técnico, coeso e pronto para inserção direta no laudo pericial. Retorne apenas o texto final, sem introdução, sem aspas, sem numeração e sem títulos.`;

function buildTextoSelecionado(ocrText: string, extracao: any): string {
  const queixa = (extracao?.queixa_principal || "").toString().trim();
  const histClin = (extracao?.historia_clinica || "").toString().trim();
  const histLab = (extracao?.historia_laboral || "").toString().trim();
  const comorb = (extracao?.comorbidades || "").toString().trim();
  const cids = Array.isArray(extracao?.cids_alegados) ? extracao.cids_alegados.join(", ") : "";

  const blocoEstruturado = [
    queixa && `QUEIXA EXTRAÍDA: ${queixa}`,
    histClin && `HISTÓRIA CLÍNICA: ${histClin}`,
    histLab && `HISTÓRIA LABORAL: ${histLab}`,
    comorb && `COMORBIDADES: ${comorb}`,
    cids && `CIDS ALEGADOS: ${cids}`,
  ].filter(Boolean).join("\n\n");

  // Cauda do OCR — quesitos/anamnese costumam ficar no fim
  const ocrTail = ocrText.length > 40_000 ? ocrText.slice(-40_000) : ocrText;

  return `${blocoEstruturado}\n\nTEXTO BRUTO DO PROCESSO (trecho):\n${ocrTail}`;
}

/**
 * Pós-processa a saída da IA: remove markdown/bullets, colapsa em parágrafo único,
 * rejeita se contiver "IA" como palavra isolada ou se for muito curto.
 */
function sanitizeQueixa(raw: string): string {
  if (!raw) return "";
  let t = raw.trim();
  // remove fences
  t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  // remove markdown headings/bullets
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^\s*[-*•]\s+/gm, "");
  // remove negrito/itálico
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1");
  // colapsa em um único parágrafo
  t = t.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  // remove aspas envolventes
  t = t.replace(/^["'“”«»](.*)["'“”«»]$/s, "$1").trim();
  // rejeita conteúdo proibido
  if (/\bIA\b/.test(t)) return "";
  if (t.length < 60) return "";
  return t;
}

async function gerarQueixaUnificada(args: {
  aiConfig: any;
  userId: string;
  ocrText: string;
  extracao: any;
}): Promise<string> {
  const textoSelecionado = buildTextoSelecionado(args.ocrText, args.extracao);
  if (textoSelecionado.replace(/\s/g, "").length < 80) return "";

  const userPrompt = await getPrompt(
    "prompt_prev_queixa_unificada",
    DEFAULT_QUEIXA_PROMPT,
    { textoSelecionado },
    {
      description: "PREV: Unificação da Queixa Principal a partir do processo",
      cardId: "previdenciario",
      sectionId: "queixa",
    },
  );

  const resp = await callAI(args.aiConfig, QUEIXA_SYSTEM_PROMPT, userPrompt, {
    userId: args.userId,
    promptType: "prev_queixa_unificada",
    maxOutputTokens: 1200,
    jsonMode: false,
    requestTimeoutMs: 20_000,
  });

  return sanitizeQueixa(resp?.text || "");
}

// ============================================================
// Resumo de Exames Complementares (3ª passada IA)
// ============================================================

const RESUMO_SYSTEM_PROMPT =
  'Você é médico perito judicial. Retorne APENAS blocos de extração de laudos de exames complementares em português, sem markdown, sem comentários e sem a palavra "IA". Cada bloco começa direto pelo cabeçalho do exame (tipo, segmento, data). NÃO inclua a expressão "EXTRAÇÃO DO LAUDO" no texto retornado. Se não houver nenhum laudo de exame complementar identificável, retorne string vazia.';

const DEFAULT_RESUMO_PROMPT = `Você é médico perito judicial. Sua tarefa é LOCALIZAR, dentro do TEXTO OCR DO PROCESSO abaixo, TODOS os laudos de exames complementares descritos (ex.: ultrassonografia, raio-X, tomografia computadorizada, ressonância magnética, eletroneuromiografia, densitometria, ecocardiograma, ecodoppler, endoscopia, colonoscopia, EEG, e laudos médicos de especialistas que contenham achados objetivos) e PRODUZIR um bloco de extração para cada laudo encontrado.

REGRAS GERAIS:
1. Apenas EXTRAIR. Não interpretar, não diagnosticar, não emitir conduta, não sugerir tratamento.
2. NUNCA inventar achados, datas ou tipos de exame. Se a informação não está no texto, OMITA.
3. Português brasileiro, técnico, objetivo, sem floreios.
4. PROIBIDO usar markdown, bullets, títulos hierárquicos ("###", "**", etc.) ou a palavra "IA".
5. Mantenha terminologia médica original do laudo (não simplificar).
6. Ignore documentos que NÃO sejam laudos de exame (procurações, petições, contracheques, ofícios, decisões, atestados sem achados objetivos).
7. Se o mesmo exame aparecer repetido, considerar apenas a versão mais completa.
8. PROIBIDO escrever a expressão "EXTRAÇÃO DO LAUDO" (ou variações) em qualquer parte da resposta. O cabeçalho de cada bloco começa direto pelo tipo do exame.

FORMATO OBRIGATÓRIO de cada bloco (texto puro, exatamente assim):

[TIPO DO EXAME] ([SEGMENTO/REGIÃO se houver]) — [DATA AAAA-MM-DD ou "data não informada"]
Achados: [descrever os achados objetivos do laudo, em frase corrida, mantendo a terminologia original].
Impressão diagnóstica do laudo: [transcrever a conclusão/impressão diagnóstica do próprio laudo, se houver; caso contrário, omitir esta linha].

REGRAS DE CONCATENAÇÃO:
- Separe cada bloco por UMA linha em branco.
- Ordene os blocos por data crescente quando houver data; laudos sem data vão ao final.
- Se NENHUM laudo de exame complementar for identificado no processo, retorne string VAZIA (não escreva "nenhum laudo encontrado", não escreva nada).

TEXTO OCR DO PROCESSO:
\${ocrText}

Retorne SOMENTE os blocos no formato acima, concatenados, sem introdução e sem comentários.`;

function sanitizeResumo(raw: string): string {
  if (!raw) return "";
  let t = raw.trim();
  t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  // Remover qualquer ocorrência remanescente do rótulo "EXTRAÇÃO DO LAUDO"
  // (no início de linha ou em qualquer ponto do texto).
  t = t.replace(/^[ \t]*EXTRA[ÇC][ÃA]O\s+DO\s+LAUDO\s*[—\-:]?\s*/gim, "");
  t = t.replace(/EXTRA[ÇC][ÃA]O\s+DO\s+LAUDO\s*[—\-:]?\s*/gi, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  if (/\bIA\b/.test(t)) return "";
  if (t.length < 30) return "";
  return t;
}

async function gerarResumoExames(args: {
  aiConfig: any;
  userId: string;
  ocrText: string;
}): Promise<string> {
  // Resumo precisa do OCR completo (vários laudos costumam estar espalhados).
  // Reaproveita o trimming preservando cauda já aplicado upstream.
  if (args.ocrText.replace(/\s/g, "").length < 200) return "";

  const userPrompt = await getPrompt(
    "prompt_prev_resumo_exames",
    DEFAULT_RESUMO_PROMPT,
    { ocrText: args.ocrText },
    {
      description: "PREV: Resumo de Exames Complementares (extração técnica de laudos)",
      cardId: "previdenciario",
      sectionId: "resumo",
    },
  );

  const resp = await callAI(args.aiConfig, RESUMO_SYSTEM_PROMPT, userPrompt, {
    userId: args.userId,
    promptType: "prev_resumo_exames",
    maxOutputTokens: 4000,
    jsonMode: false,
    requestTimeoutMs: 25_000,
  });

  return sanitizeResumo(resp?.text || "");
}

type PrevPericiaRow = {
  id: string;
  user_id: string;
  pdf_path: string | null;
  pauta_id: string;
  periciado_nome?: string | null;
};

type OcrResult = { text: string; pageCount: number; provider: string; model: string };

async function updateJob(
  admin: any,
  jobId: string | undefined,
  patch: Record<string, unknown>,
) {
  if (!jobId) return;
  const { error } = await admin.from("prev_processing_jobs").update(patch).eq("id", jobId);
  if (error) console.error("[prev-pre-processar] update job failed:", error);
}

async function finalizeFailedJob(
  admin: any,
  jobId: string,
  err: unknown,
  fallback?: { provider?: string; model?: string; stage?: string },
) {
  const classified = classifyProcessingError(err, fallback);
  // Enriquecer error_message com um trecho do detalhe técnico para dar ao
  // usuário/analista uma pista real (ex.: "Interactions create failed (400): ...")
  // em vez de apenas "Falha no provider backend/processamento".
  let userMessage = classified.error;
  if (classified.technicalDetail) {
    const detailPreview = String(classified.technicalDetail).slice(0, 240).trim();
    if (detailPreview && !userMessage.includes(detailPreview.slice(0, 40))) {
      userMessage = `${classified.error} Detalhe: ${detailPreview}`;
    }
  }
  await updateJob(admin, jobId, {
    status: "failed",
    progress: 100,
    stage: classified.stage || fallback?.stage || "failed",
    provider: classified.provider || fallback?.provider || null,
    model: classified.model || fallback?.model || null,
    error_code: classified.code,
    error_message: userMessage,
    technical_detail: classified.technicalDetail,
    completed_at: new Date().toISOString(),
  });
  console.error(
    `[prev-pre-processar] job ${jobId} failed code=${classified.code} stage=${classified.stage}:`,
    classified.technicalDetail,
  );
}

async function processStructuredExtraction(args: {
  admin: any;
  userId: string;
  pericia: PrevPericiaRow;
  ocr: OcrResult;
  startedAt: number;
  jobId?: string;
}): Promise<{
  periciaId: string;
  pages: number;
  documentosCriados: number;
  provider: string;
  model: string;
  durationMs: number;
}> {
  const { admin, userId, pericia, ocr, startedAt, jobId } = args;

  await updateJob(admin, jobId, {
    status: "processing",
    stage: "ai_extraction",
    progress: 65,
    provider: ocr.provider,
    model: ocr.model,
  });

  const aiConfig = await getAIConfig();
  const ocrText = trimOcrPreservingTail(ocr.text, 120_000);
  const remainingAiBudgetMs = jobId
    ? 120_000
    : 140_000 - (Date.now() - startedAt) - 4_000;

  if (remainingAiBudgetMs < 20_000) {
    const detail =
      `OCR concluído (${ocr.pageCount}p, ${ocr.text.length} chars via ${ocr.provider}/${ocr.model}), ` +
      `mas consumiu tempo demais para a extração estruturada síncrona com segurança. ` +
      `elapsed=${Date.now() - startedAt}ms remaining=${remainingAiBudgetMs}ms`;
    throw new Error(detail);
  }

  const userPrompt = await getPrompt(
    "prompt_prev_extracao_processo",
    DEFAULT_EXTRACTION_PROMPT,
    { ocrText },
    {
      description: "PREV: Extração estruturada do PDF do processo (pré-processamento)",
      cardId: "previdenciario",
      sectionId: "pre-processamento",
    },
  );

  const aiResp = await callAI(aiConfig, SYSTEM_PROMPT, userPrompt, {
    userId,
    promptType: "prev_extracao_processo",
    maxOutputTokens: 12000,
    jsonMode: true,
    requestTimeoutMs: remainingAiBudgetMs,
  });

  if (looksTruncated(aiResp.text)) {
    console.warn(
      `[prev-pre-processar] AI output looks truncated (len=${aiResp.text.length}); attempting repair.`,
    );
  }

  const parsed = parseAIJson(aiResp.text);
  if (!parsed) {
    throw new Error(
      `response_truncated: Resposta não pôde ser convertida em JSON. Tamanho=${aiResp.text.length}. Início=${aiResp.text.slice(0, 300)}`,
    );
  }

  const COMORB_KEYS = [
    "has","dm2","dislipidemia","hipotireoidismo","ansiedade","depressao",
    "fibromialgia","obesidade","cardiopatia","dpoc","irc","ar",
  ] as const;
  const toBool = (v: unknown): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      return ["true","1","sim","yes","y","x","marcado","positivo"].includes(s);
    }
    return false;
  };
  if (parsed && typeof parsed === "object") {
    let mu = parsed.medicacoes_uso;
    if (Array.isArray(mu)) mu = mu.filter(Boolean).join(", ");
    if (typeof mu !== "string") mu = "";
    mu = mu.replace(/[*_`#>]/g, "").replace(/\bIA\b/g, "").replace(/\s+/g, " ").trim();
    parsed.medicacoes_uso = mu;

    if (!parsed.identificacao || typeof parsed.identificacao !== "object") {
      parsed.identificacao = {};
    }
    const escolaridade = inferEscolaridadeFromParsed(parsed, ocrText);
    if (escolaridade) parsed.identificacao.escolaridade = escolaridade;

    const src = (parsed.comorbidades_fixas && typeof parsed.comorbidades_fixas === "object")
      ? parsed.comorbidades_fixas as Record<string, unknown>
      : {};
    const normalized: Record<string, boolean> = {};
    for (const k of COMORB_KEYS) normalized[k] = toBool(src[k]);
    parsed.comorbidades_fixas = normalized;
  }

  await updateJob(admin, jobId, { stage: "ai_refinement", progress: 78 });

  let queixaUnificada = "";
  try {
    queixaUnificada = await gerarQueixaUnificada({ aiConfig, userId, ocrText, extracao: parsed });
    if (queixaUnificada) parsed.queixa_principal = queixaUnificada;
  } catch (e) {
    console.warn("[prev-pre-processar] queixa unificada falhou (não-fatal):", e);
  }

  let resumoExames = "";
  try {
    resumoExames = await gerarResumoExames({ aiConfig, userId, ocrText });
    if (resumoExames) parsed.resumo_exames = resumoExames;
  } catch (e) {
    console.warn("[prev-pre-processar] resumo de exames falhou (não-fatal):", e);
  }

  await updateJob(admin, jobId, { stage: "saving", progress: 90 });

  const extracao = {
    ...parsed,
    _meta: {
      ocr_pages: ocr.pageCount,
      ocr_chars: ocr.text.length,
      ai_provider: aiResp.provider,
      ai_model: aiResp.model,
      used_fallback: aiResp.usedFallback,
      queixa_unificada_ok: !!queixaUnificada,
      resumo_exames_ok: !!resumoExames,
      extracted_at: new Date().toISOString(),
    },
  };

  const periciado_nome =
    parsed?.identificacao?.nome && typeof parsed.identificacao.nome === "string"
      ? parsed.identificacao.nome
      : null;

  const updatePatch: Record<string, unknown> = { prev_extracao: extracao, pdf_processado: true };
  if (periciado_nome) updatePatch.periciado_nome = periciado_nome;

  const { error: updErr } = await admin.from("prev_pericias").update(updatePatch).eq("id", pericia.id);
  if (updErr) throw new Error(`Falha ao salvar perícia: ${updErr.message}`);

  await admin.from("prev_documentos").delete().eq("pericia_id", pericia.id);
  const docs = Array.isArray(parsed?.documentos) ? parsed.documentos : [];
  if (docs.length > 0) {
    const rows = docs.slice(0, 100).map((d: any, i: number) => ({
      pericia_id: pericia.id,
      user_id: userId,
      tipo: ["laudo", "exame", "receita", "pedido", "outro"].includes(d?.tipo) ? d.tipo : "outro",
      data: typeof d?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : null,
      resumo: typeof d?.resumo === "string" ? d.resumo.slice(0, 600) : null,
      trecho_original: null,
      ordem: i,
    }));
    const { error: docErr } = await admin.from("prev_documentos").insert(rows);
    if (docErr) throw new Error(`Falha ao salvar documentos: ${docErr.message}`);
  }

  const durationMs = Date.now() - startedAt;
  const result = {
    periciaId: pericia.id,
    pages: ocr.pageCount,
    documentosCriados: docs.length,
    provider: aiResp.provider,
    model: aiResp.model,
    durationMs,
  };

  await updateJob(admin, jobId, {
    status: "completed",
    stage: "completed",
    progress: 100,
    provider: aiResp.provider,
    model: aiResp.model,
    result,
    completed_at: new Date().toISOString(),
  });

  return result;
}

async function runPreProcessJob(args: {
  admin: any;
  jobId: string;
  userId: string;
  pericia: PrevPericiaRow;
}) {
  const { admin, jobId, userId, pericia } = args;
  const startedAt = Date.now();

  try {
    await updateJob(admin, jobId, { status: "processing", stage: "download", progress: 5 });
    if (!pericia.pdf_path) throw new Error("Esta perícia não tem PDF anexado");

    const { data: blob, error: dlErr } = await admin.storage.from("prev-pdfs").download(pericia.pdf_path);
    if (dlErr || !blob) throw new Error(`Falha ao baixar PDF: ${dlErr?.message ?? "vazio"}`);

    const sizeBytes = blob.size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
    console.log(`[prev-pre-processar] job ${jobId} PDF ${sizeMB}MB`);
    if (sizeBytes > 150_000_000) throw new Error(`PDF acima de 150MB (${sizeMB}MB) — divida manualmente antes do upload.`);

    await updateJob(admin, jobId, { stage: "ocr_processing", progress: 18 });

    // Para PDFs grandes (>30 MB), passa o blob direto (streaming ao Gemini
    // Files API — evita materializar Uint8Array no worker e estourar 150 MB).
    // Para PDFs pequenos, mantém o caminho tradicional com bytes.
    const LARGE_PDF_THRESHOLD = 30_000_000;
    const ocrInput = sizeBytes > LARGE_PDF_THRESHOLD
      ? { blob: blob as Blob, size: sizeBytes }
      : new Uint8Array(await blob.arrayBuffer());

    const ocr = await runOcrWithConfiguredProvider(ocrInput, {
      logPrefix: `[prev-pre-processar job ${jobId}]`,
      onHeartbeat: async (stage, progress) => {
        await updateJob(admin, jobId, { stage, progress });
      },
    });
    await updateJob(admin, jobId, {
      stage: "ocr_completed",
      progress: 60,
      provider: ocr.provider,
      model: ocr.model,
      result: { ocr_pages: ocr.pageCount, ocr_chars: ocr.text.length },
    });

    await processStructuredExtraction({ admin, userId, pericia, ocr, startedAt, jobId });
    console.log(`[prev-pre-processar] job ${jobId} completed in ${Date.now() - startedAt}ms`);
  } catch (err) {
    await finalizeFailedJob(admin, jobId, err);
  }
}




Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const t0 = Date.now();
  console.log("[prev-pre-processar] start");

  // Contexto para notificação de erro (populado ao longo do fluxo)
  let notifyCtx: { userId?: string; periciadoNome?: string; pautaNome?: string } = {};

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado", code: "session_expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ReqBody;
    if (!body?.periciaId) {
      return new Response(JSON.stringify({ error: "periciaId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente autenticado (para validar o usuário)
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida", code: "session_expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Cliente admin (storage + writes)
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Carrega perícia
    const { data: pericia, error: perErr } = await admin
      .from("prev_pericias")
      .select("id, user_id, pdf_path, pauta_id, periciado_nome")
      .eq("id", body.periciaId)
      .maybeSingle();

    if (pericia) {
      notifyCtx.userId = pericia.user_id;
      notifyCtx.periciadoNome = (pericia as any).periciado_nome ?? "—";
      try {
        const { data: pauta } = await admin
          .from("prev_pautas")
          .select("nome_pauta")
          .eq("id", pericia.pauta_id)
          .maybeSingle();
        notifyCtx.pautaNome = (pauta as any)?.nome_pauta ?? "";
      } catch { /* ignore */ }
    }

    if (perErr || !pericia) {
      return new Response(JSON.stringify({ error: "Perícia não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pericia.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pericia.pdf_path) {
      return new Response(JSON.stringify({ error: "Esta perícia não tem PDF anexado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.preExtractedText && body.preExtractedText.trim().length > 0) {
      console.log(
        `[prev-pre-processar] usando texto pré-extraído pelo frontend ` +
        `(${body.preExtractedText.length} chars, provider=${body.preExtractedProvider}/${body.preExtractedModel})`,
      );
      const ocr = {
        text: body.preExtractedText,
        pageCount: body.preExtractedPageCount || 0,
        provider: body.preExtractedProvider || "minimax-ocr-client",
        model: body.preExtractedModel || "MiniMax-M3",
      };
      const result = await processStructuredExtraction({ admin, userId, pericia, ocr, startedAt: t0 });
      console.log(`[prev-pre-processar] done in ${result.durationMs}ms`);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ocrConfig = await getOcrRouterConfig();
    if (ocrConfig.provider === "minimax") {
      return new Response(
        JSON.stringify({
          ok: false,
          needsClientRasterize: true,
          mode: "minimax-client-rasterize",
          chunkEndpoint: "minimax-ocr-chunk",
          pdfPath: pericia.pdf_path,
          bucket: "prev-pdfs",
          message:
            "Provider MiniMax selecionado. Rode a rasterização no navegador e re-invoque com preExtractedText.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: job, error: jobErr } = await admin
      .from("prev_processing_jobs")
      .insert({
        pericia_id: pericia.id,
        user_id: userId,
        status: "queued",
        stage: "queued",
        progress: 0,
        provider: ocrConfig.provider,
        model: ocrConfig.provider === "gemini" ? ocrConfig.geminiModel : null,
      })
      .select("id")
      .single();

    if (jobErr || !job?.id) {
      throw new Error(`Falha ao criar job de processamento: ${jobErr?.message ?? "sem id"}`);
    }

    const jobPromise = runPreProcessJob({ admin, jobId: job.id, userId, pericia });
    const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil?.bind((globalThis as any).EdgeRuntime);
    if (waitUntil) waitUntil(jobPromise);
    else jobPromise.catch((e) => console.error("[prev-pre-processar] background job failed:", e));

    return new Response(
      JSON.stringify({
        ok: true,
        async: true,
        jobId: job.id,
        periciaId: pericia.id,
        status: "queued",
        stage: "queued",
        progress: 0,
        provider: ocrConfig.provider,
        model: ocrConfig.provider === "gemini" ? ocrConfig.geminiModel : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";

    notifyPdfErrorFireAndForget({
      modulo: "Previdenciário",
      errorMessage: msg,
      userId: notifyCtx.userId,
      periciadoNome: notifyCtx.periciadoNome,
      pautaNome: notifyCtx.pautaNome,
      stage: isMistralError(msg) ? "ocr" : "processamento",
    });


    // Classifica erros vindos da Mistral (OCR) para devolver mensagem específica
    if (isMistralError(msg)) {
      const classified = classifyMistralError(msg);
      console.error(
        `[prev-pre-processar] mistral_error code=${classified.code} upstreamStatus=${classified.upstreamStatus ?? "n/a"}`,
      );
      return new Response(
        JSON.stringify({
          error: classified.userMessage,
          code: classified.code,
          stage: "ocr",
          upstreamStatus: classified.upstreamStatus,
        }),
        {
          status: classified.httpStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const classified = classifyProcessingError(err);
    console.error(
      `[prev-pre-processar] FATAL code=${classified.code} stage=${classified.stage} provider=${classified.provider ?? "n/a"} model=${classified.model ?? "n/a"}:`,
      classified.technicalDetail || msg,
    );
    return new Response(JSON.stringify({
      error: classified.error,
      code: classified.code,
      stage: classified.stage,
      provider: classified.provider,
      model: classified.model,
      upstreamStatus: classified.upstreamStatus,
      technicalDetail: classified.technicalDetail,
    }), {
      status: classified.httpStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
