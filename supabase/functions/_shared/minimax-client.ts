/**
 * MiniMax M3 client — chat completions + OCR (chunked/paralelo).
 *
 * Regras fixas (não configuráveis):
 *  - Endpoint: POST https://api.minimax.io/v1/chat/completions
 *  - Model:    "MiniMax-M3" (case-sensitive)
 *  - thinking: { type: "disabled" }  → sempre injetado, IA geral e OCR
 *
 * Referência: /mnt/user-uploads/M3-REFERENCE.md (colada pelo cliente)
 */

const MINIMAX_ENDPOINT = "https://api.minimax.io/v1/chat/completions";
export const MINIMAX_MODEL = "MiniMax-M3";

// -------- OCR execution strategy (exclusiva do MiniMax) --------
const OCR_CHUNK_PAGES = 10;      // páginas por request
const OCR_PARALLELISM = 4;       // requests simultâneos
const OCR_MAX_RETRIES = 2;       // por chunk
const OCR_JPEG_QUALITY = 80;     // qualidade da rasterização
const OCR_RENDER_DPI = 150;      // dpi de rasterização

export function getMinimaxAPIKey(): string | null {
  return Deno.env.get("MINIMAX_API_KEY") || null;
}

// ---------- Chat completions (IA geral) ----------

export interface MinimaxChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface CallMinimaxChatOpts {
  messages: MinimaxChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  apiKey?: string;
}

export interface MinimaxChatResult {
  text: string;
  provider: "minimax";
  model: string;
  tokensInput?: number;
  tokensOutput?: number;
}

export async function callMinimaxChat(opts: CallMinimaxChatOpts): Promise<MinimaxChatResult> {
  const apiKey = opts.apiKey || getMinimaxAPIKey();
  if (!apiKey) throw new Error("MINIMAX_API_KEY não configurada");

  const body: Record<string, unknown> = {
    model: MINIMAX_MODEL,
    thinking: { type: "disabled" }, // FIXO — economiza tokens e evita lixo
    temperature: opts.temperature ?? 0,
    messages: opts.messages,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(MINIMAX_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MiniMax API error (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return {
    text: typeof text === "string" ? text : JSON.stringify(text),
    provider: "minimax",
    model: data?.model || MINIMAX_MODEL,
    tokensInput: data?.usage?.prompt_tokens,
    tokensOutput: data?.usage?.completion_tokens,
  };
}

// ---------- OCR (chunked/paralelo — EXCLUSIVO do MiniMax) ----------

export interface MinimaxOCRResult {
  text: string;
  pageCount: number;
  provider: "minimax-ocr";
  model: string;
}

export interface ExtractOCROpts {
  logPrefix?: string;
  apiKey?: string;
}

/**
 * Rasteriza páginas de um PDF em JPEG base64 usando mupdf (WASM).
 * Retorna array de data URLs prontos para MiniMax (`data:image/jpeg;base64,...`).
 */
async function rasterizePdfPages(
  pdfBytes: Uint8Array,
  logPrefix: string,
): Promise<{ dataUrls: string[]; pageCount: number }> {
  // Carrega mupdf via npm: (funciona em Deno Deploy — WASM puro, sem native deps)
  // deno-lint-ignore no-explicit-any
  let mupdf: any;
  try {
    mupdf = await import("npm:mupdf@1.3.0");
  } catch (e) {
    throw new Error(
      `Falha ao carregar mupdf (rasterizador PDF→imagem): ${(e as Error).message}. ` +
        `MiniMax OCR não disponível neste runtime — configure outro provider de OCR.`,
    );
  }

  const doc = mupdf.PDFDocument
    ? mupdf.PDFDocument.openDocument(pdfBytes, "application/pdf")
    : mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const pageCount: number = doc.countPages();
  console.log(`${logPrefix} rasterizando ${pageCount} páginas @${OCR_RENDER_DPI}dpi (jpeg q=${OCR_JPEG_QUALITY})`);

  const scale = OCR_RENDER_DPI / 72;
  const matrix = mupdf.Matrix ? mupdf.Matrix.scale(scale, scale) : [scale, 0, 0, scale, 0, 0];
  const cs = mupdf.ColorSpace?.DeviceRGB || mupdf.DeviceRGB;

  const dataUrls: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(matrix, cs, false, true);
    const jpegBytes: Uint8Array = pixmap.asJPEG(OCR_JPEG_QUALITY);
    const b64 = base64Encode(jpegBytes);
    dataUrls.push(`data:image/jpeg;base64,${b64}`);
    pixmap.destroy?.();
    page.destroy?.();
  }
  doc.destroy?.();
  return { dataUrls, pageCount };
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]);
  }
  return btoa(binary);
}

async function ocrOneChunk(
  apiKey: string,
  imageDataUrls: string[],
  startPage: number,
  endPage: number,
  previousSummary: string | null,
  logPrefix: string,
): Promise<{ text: string; summary: string }> {
  const prompt =
    `Você é um OCR jurídico-médico. Transcreva integralmente TODO o texto visível destas ${imageDataUrls.length} páginas (páginas ${startPage} a ${endPage} do documento). ` +
    `Regras rígidas:\n` +
    `- Marque cada página com uma linha exata: "--- Página N ---" (N = número real da página).\n` +
    `- Texto puro, sem markdown, sem comentários, sem resumos.\n` +
    `- Preserve tabelas com | separando colunas.\n` +
    `- Transcreva também texto contido em carimbos, assinaturas legíveis e imagens escaneadas.\n` +
    `Ao final da transcrição, adicione UMA linha separadora "===RESUMO===" seguida de um resumo de no máximo 200 tokens ` +
    `com nomes, datas, CPFs, números de processo e assuntos-chave desta faixa de páginas (para dar contexto ao próximo chunk).`;

  const messages: MinimaxChatMessage[] = [];
  if (previousSummary) {
    messages.push({
      role: "assistant",
      content: `[Contexto do chunk anterior]: ${previousSummary}`,
    });
  }
  messages.push({
    role: "user",
    content: [
      { type: "text", text: prompt },
      ...imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  });

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= OCR_MAX_RETRIES; attempt++) {
    try {
      const res = await callMinimaxChat({
        messages,
        maxTokens: 16000,
        temperature: 0,
        apiKey,
      });
      const raw = res.text || "";
      const [transcription, summary] = raw.split(/===RESUMO===/i);
      return {
        text: (transcription || raw).trim(),
        summary: (summary || "").trim().slice(0, 800),
      };
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      const retryable = /\b(429|500|502|503|504)\b/.test(msg);
      if (!retryable || attempt === OCR_MAX_RETRIES) break;
      const delay = 1500 * Math.pow(2, attempt);
      console.warn(`${logPrefix} chunk ${startPage}-${endPage} retry ${attempt + 1}/${OCR_MAX_RETRIES} em ${delay}ms: ${msg.slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error(`Falha desconhecida no chunk ${startPage}-${endPage}`);
}

/**
 * OCR chunked/paralelo — EXCLUSIVO do MiniMax.
 * Mistral e Gemini continuam single-shot; NÃO usar este padrão neles.
 */
export async function extractWithMinimaxOCR(
  pdfBytes: Uint8Array,
  opts: ExtractOCROpts = {},
): Promise<MinimaxOCRResult> {
  const apiKey = opts.apiKey || getMinimaxAPIKey();
  if (!apiKey) throw new Error("MINIMAX_API_KEY não configurada");
  const logPrefix = opts.logPrefix || "[minimax-ocr]";
  const t0 = Date.now();

  const { dataUrls, pageCount } = await rasterizePdfPages(pdfBytes, logPrefix);
  console.log(`${logPrefix} rasterização concluída em ${Date.now() - t0}ms`);

  // Monta chunks sequenciais de OCR_CHUNK_PAGES páginas
  const chunks: Array<{ index: number; start: number; end: number; images: string[] }> = [];
  for (let i = 0; i < pageCount; i += OCR_CHUNK_PAGES) {
    const end = Math.min(i + OCR_CHUNK_PAGES, pageCount);
    chunks.push({
      index: chunks.length,
      start: i + 1,
      end,
      images: dataUrls.slice(i, end),
    });
  }
  console.log(`${logPrefix} ${chunks.length} chunks de até ${OCR_CHUNK_PAGES} páginas, paralelismo=${OCR_PARALLELISM}`);

  // Executa com paralelismo controlado; cross-chunk summary passado do vizinho anterior concluído
  const results: Array<{ text: string; summary: string } | { failed: true; range: string }> = new Array(chunks.length);
  let nextIdx = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(OCR_PARALLELISM, chunks.length); w++) {
    workers.push((async () => {
      while (true) {
        const myIdx = nextIdx++;
        if (myIdx >= chunks.length) return;
        const c = chunks[myIdx];
        // pega summary do chunk imediatamente anterior se já concluído
        const prev = myIdx > 0 ? results[myIdx - 1] : null;
        const prevSummary =
          prev && !("failed" in prev) ? prev.summary : null;
        try {
          const r = await ocrOneChunk(apiKey, c.images, c.start, c.end, prevSummary, logPrefix);
          results[myIdx] = r;
          console.log(`${logPrefix} ✓ chunk ${c.start}-${c.end} (${r.text.length} chars)`);
        } catch (e) {
          console.error(`${logPrefix} ✗ chunk ${c.start}-${c.end} FALHOU após ${OCR_MAX_RETRIES} tentativas: ${(e as Error).message}`);
          results[myIdx] = { failed: true, range: `${c.start}-${c.end}` };
        }
      }
    })());
  }
  await Promise.all(workers);

  // Concatena em ordem
  const parts: string[] = [];
  for (const r of results) {
    if ("failed" in r) {
      parts.push(`\n\n[FALHA CHUNK páginas ${r.range} — não foi possível transcrever]\n\n`);
    } else {
      parts.push(r.text);
    }
  }
  const finalText = parts.join("\n\n").trim();
  console.log(`${logPrefix} concluído em ${Date.now() - t0}ms — ${finalText.length} chars, ${pageCount} páginas`);

  return {
    text: finalText,
    pageCount,
    provider: "minimax-ocr",
    model: MINIMAX_MODEL,
  };
}
