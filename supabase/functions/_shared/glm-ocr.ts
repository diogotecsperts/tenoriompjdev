/**
 * GLM-OCR (Z.AI) — Cliente para extração de texto via endpoint layout_parsing.
 *
 * Endpoint:  POST https://api.z.ai/api/paas/v4/layout_parsing
 * Model:     "glm-ocr"
 * Limites:   PDF ≤ 50MB, imagens ≤ 10MB, MAX 30 páginas por request.
 *            Para PDFs com > 30 páginas, iteramos com start_page_id/end_page_id.
 *
 * Resposta (campos relevantes):
 *   {
 *     id, created, model,
 *     md_results: "# Doc title\n...",   // markdown consolidado do range
 *     data_info: { num_pages: 5, pages: [{ width, height }] },
 *     usage: {...}
 *   }
 *
 * Este helper roda 100% dentro da edge function (sem rasterização client-side).
 * Selecionado exclusivamente via DevPanel (`phase1_ocr_provider = "glm"`) ou
 * como fallback explícito (`ocr_fallback_provider = "glm"`). Nunca chamado
 * automaticamente por caminho hardcoded.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GLM_LAYOUT_URL = "https://api.z.ai/api/paas/v4/layout_parsing";
const GLM_MODEL = "glm-ocr";
const GLM_PAGES_PER_REQUEST = 30;
const GLM_MAX_PDF_BYTES = 50_000_000; // 50 MB por request
const GLM_MAX_RETRIES = 3;

export interface GlmOcrResult {
  text: string;
  pageCount: number;
  provider: "glm-ocr";
  model: "glm-ocr";
  processingTimeMs: number;
}

/**
 * Obter chave GLM: primeiro do `global_api_keys` (DevPanel "Provedores de OCR"),
 * fallback para `Deno.env.get('GLM_API_KEY')`. Mesmo padrão de getGeminiApiKey.
 */
export async function getGlmAPIKey(): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from("global_api_keys")
        .select("api_key")
        .eq("id", "glm")
        .maybeSingle();
      if (data?.api_key) return data.api_key;
    }
  } catch (e) {
    console.warn("[glm-ocr] falha ao ler global_api_keys, usando env fallback:", (e as Error).message);
  }
  return Deno.env.get("GLM_API_KEY") || null;
}

export async function hasGlmAPIKey(): Promise<boolean> {
  const k = await getGlmAPIKey();
  return !!k && k.length > 0;
}

interface GlmLayoutResponse {
  id?: string;
  model?: string;
  md_results?: string | Array<{ content?: string; page_number?: number }>;
  data_info?: { num_pages?: number };
  code?: number;
  message?: string;
}

/**
 * Faz UMA chamada ao endpoint layout_parsing, para um range específico.
 * Retorna o markdown do range + total de páginas do PDF (do data_info).
 */
async function callGlmLayoutParsing(
  fileDataUrl: string,
  apiKey: string,
  opts: { startPage?: number; endPage?: number } = {},
): Promise<{ markdown: string; totalPages: number }> {
  const payload: Record<string, unknown> = {
    model: GLM_MODEL,
    file: fileDataUrl,
  };
  if (opts.startPage) payload.start_page_id = opts.startPage;
  if (opts.endPage) payload.end_page_id = opts.endPage;

  let lastErr = "";
  for (let attempt = 1; attempt <= GLM_MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(GLM_LAYOUT_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      lastErr = `network error: ${(e as Error).message}`;
      if (attempt < GLM_MAX_RETRIES) {
        const wait = 500 * Math.pow(3, attempt - 1);
        console.warn(`[glm-ocr] tentativa ${attempt}/${GLM_MAX_RETRIES} falhou (${lastErr}); retry em ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error(`GLM-OCR request failed: ${lastErr}`);
    }

    if (res.ok) {
      const json = (await res.json()) as GlmLayoutResponse;
      // md_results normalmente é uma string (docs). Aceitamos array como fallback defensivo.
      let markdown = "";
      if (typeof json.md_results === "string") {
        markdown = json.md_results;
      } else if (Array.isArray(json.md_results)) {
        markdown = json.md_results
          .map((p) => String(p?.content || "").trim())
          .filter(Boolean)
          .join("\n\n");
      }
      const totalPages = Number(json.data_info?.num_pages) || 0;
      return { markdown, totalPages };
    }

    const text = await res.text();
    lastErr = `${res.status} ${text.slice(0, 400)}`;
    const isRetryable = res.status === 429 || res.status >= 500;
    if (!isRetryable || attempt === GLM_MAX_RETRIES) {
      throw new Error(`GLM-OCR failed (${res.status}): ${text.slice(0, 500)}`);
    }
    const wait = 500 * Math.pow(3, attempt - 1);
    console.warn(`[glm-ocr] status=${res.status} retry ${attempt}/${GLM_MAX_RETRIES} em ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`GLM-OCR exhausted retries: ${lastErr}`);
}

/**
 * Converte Uint8Array em data URL base64 (application/pdf).
 * Faz codificação em chunks para não estourar o call stack em PDFs grandes.
 */
function toBase64DataUrl(pdfBytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < pdfBytes.length; i += CHUNK) {
    const slice = pdfBytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  const b64 = btoa(binary);
  return `data:application/pdf;base64,${b64}`;
}

/**
 * Extrai texto de um PDF usando GLM-OCR (Z.AI).
 *
 * - Valida limite de 50MB antes de chamar a API.
 * - Se o PDF tiver > 30 páginas, itera em janelas de 30 páginas usando
 *   start_page_id/end_page_id, concatenando os markdowns por página.
 * - Não faz fallback silencioso: qualquer erro é propagado ao caller
 *   (que consulta `resolveOcrFallback` centralmente).
 */
export async function extractWithGlmOCR(
  pdfBytes: Uint8Array,
  apiKey: string,
): Promise<GlmOcrResult> {
  const startTime = Date.now();
  const sizeMB = (pdfBytes.byteLength / 1024 / 1024).toFixed(2);

  if (pdfBytes.byteLength > GLM_MAX_PDF_BYTES) {
    throw new Error(
      `Arquivo muito grande para GLM-OCR: ${sizeMB}MB (limite: 50MB). ` +
      `Troque o provider no DevPanel ou configure fallback explícito.`,
    );
  }

  console.log(`[glm-ocr] iniciando extração (${sizeMB}MB)…`);
  const fileDataUrl = toBase64DataUrl(pdfBytes);

  // 1ª chamada: primeiras 30 páginas + descobre num_pages total.
  const first = await callGlmLayoutParsing(fileDataUrl, apiKey, {
    startPage: 1,
    endPage: GLM_PAGES_PER_REQUEST,
  });

  const totalPages = first.totalPages || GLM_PAGES_PER_REQUEST;
  const parts: string[] = [];
  if (first.markdown.trim().length > 0) {
    parts.push(`=== PÁGINAS 1-${Math.min(GLM_PAGES_PER_REQUEST, totalPages)} ===\n${first.markdown.trim()}`);
  }

  // Se houver mais páginas, itera em blocos de 30.
  if (totalPages > GLM_PAGES_PER_REQUEST) {
    console.log(`[glm-ocr] PDF tem ${totalPages} páginas → paginando em blocos de ${GLM_PAGES_PER_REQUEST}`);
    for (let start = GLM_PAGES_PER_REQUEST + 1; start <= totalPages; start += GLM_PAGES_PER_REQUEST) {
      const end = Math.min(start + GLM_PAGES_PER_REQUEST - 1, totalPages);
      const chunk = await callGlmLayoutParsing(fileDataUrl, apiKey, {
        startPage: start,
        endPage: end,
      });
      if (chunk.markdown.trim().length > 0) {
        parts.push(`=== PÁGINAS ${start}-${end} ===\n${chunk.markdown.trim()}`);
      }
    }
  }

  const combined = parts.join("\n\n");
  const processingTimeMs = Date.now() - startTime;
  console.log(
    `[glm-ocr] extração completa em ${processingTimeMs}ms — ${totalPages} páginas, ${combined.length} chars`,
  );

  return {
    text: combined,
    pageCount: totalPages,
    provider: "glm-ocr",
    model: "glm-ocr",
    processingTimeMs,
  };
}
