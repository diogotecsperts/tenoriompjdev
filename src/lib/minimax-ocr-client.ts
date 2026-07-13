/**
 * Client-side OCR pipeline.
 *
 * Rasteriza PDFs no navegador (pdfjs) e envia chunks de páginas ao endpoint
 * fino `minimax-ocr-chunk`. Necessário porque rodar rasterização WASM dentro
 * de uma edge function estoura o limite de ~2s de CPU síncrona
 * (WORKER_RESOURCE_LIMIT / HTTP 546).
 *
 * Parâmetros validados com o time do MiniMax (LOVABLE-QA.md, jul/2026):
 *  - Chunk: 10 páginas (sweet spot 8-12)
 *  - Resolução: 1500px maior lado, JPEG q=0.80 (~3k tokens/img)
 *  - Paralelismo: 3 sustentado (RPM 200 Plus plan) — burst 6 permitido
 *  - Cross-chunk context: `role: assistant` com resumo ≤500 tokens (cacheia system)
 *  - Checkpoint merge a cada 5 chunks
 */

import * as pdfjs from "pdfjs-dist";
// @ts-ignore worker importado como URL via ?url (Vite)
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";

// Configura worker do pdfjs (idempotente)
if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

// ------- Configuração -------
const DEFAULT_MAX_SIDE_PX = 1500;
const DEFAULT_JPEG_QUALITY = 0.80;
const DEFAULT_CHUNK_SIZE = 10;
const DEFAULT_PARALLELISM = 3;
const CHECKPOINT_EVERY = 5; // chunks

type ClientOcrProvider = "minimax" | "gemini";

export interface MinimaxOcrProgress {
  phase: "rasterizing" | "extracting" | "done";
  currentChunk: number;
  totalChunks: number;
  currentPage: number;
  totalPages: number;
  message?: string;
}

export interface MinimaxOcrOptions {
  provider?: ClientOcrProvider;
  chunkEndpoint?: "minimax-ocr-chunk" | "gemini-ocr-chunk";
  model?: string;
  maxSidePx?: number;
  jpegQuality?: number;
  chunkSize?: number;
  parallelism?: number;
  onProgress?: (p: MinimaxOcrProgress) => void;
  signal?: AbortSignal;
}

export interface MinimaxOcrResult {
  text: string;
  pageCount: number;
  chunkCount: number;
  failedChunks: string[];
  provider: "minimax-ocr-client" | "gemini-ocr-client";
  model: string;
  durationMs: number;
}

/**
 * Rasteriza um PDF (File | Blob | ArrayBuffer | Uint8Array) e envia chunks
 * ao endpoint `minimax-ocr-chunk`. Retorna texto concatenado + metadados.
 */
export async function runMinimaxClientOcr(
  source: File | Blob | ArrayBuffer | Uint8Array,
  opts: MinimaxOcrOptions = {},
): Promise<MinimaxOcrResult> {
  const t0 = performance.now();
  const provider = opts.provider ?? "minimax";
  const endpoint = opts.chunkEndpoint ?? (provider === "gemini" ? "gemini-ocr-chunk" : "minimax-ocr-chunk");
  const model = opts.model ?? (provider === "gemini" ? "gemini-2.5-flash" : "MiniMax-M3");
  const maxSide = opts.maxSidePx ?? DEFAULT_MAX_SIDE_PX;
  const quality = opts.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const parallelism = opts.parallelism ?? DEFAULT_PARALLELISM;

  const bytes = await toUint8Array(source);
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCount = doc.numPages;
  const totalChunks = Math.ceil(pageCount / chunkSize);

  opts.onProgress?.({
    phase: "rasterizing",
    currentChunk: 0,
    totalChunks,
    currentPage: 0,
    totalPages: pageCount,
    message: `Rasterizando ${pageCount} páginas @${maxSide}px`,
  });

  const chunks: Array<{ index: number; start: number; end: number }> = [];
  for (let i = 0; i < pageCount; i += chunkSize) {
    const end = Math.min(i + chunkSize, pageCount);
    chunks.push({
      index: chunks.length,
      start: i + 1,
      end,
    });
  }

  opts.onProgress?.({
    phase: "extracting",
    currentChunk: 0,
    totalChunks: chunks.length,
    currentPage: 0,
    totalPages: pageCount,
    message: `${chunks.length} chunks em modo seguro`,
  });

  // Executa chunk-a-chunk para não manter todas as páginas rasterizadas em
  // memória. Isso é essencial para PDFs grandes (50MB+) e também impede que
  // várias chamadas caras sejam disparadas em paralelo antes do primeiro erro.
  const results: Array<{ text: string; summary: string } | { failed: true; range: string }> =
    new Array(chunks.length);
  let completedCount = 0;
  let rollingSummary = "";

  for (const c of chunks) {
    if (opts.signal?.aborted) throw new Error("Operação cancelada");
    const images: string[] = [];
    for (let pageNumber = c.start; pageNumber <= c.end; pageNumber++) {
      if (opts.signal?.aborted) throw new Error("Operação cancelada");
      images.push(await rasterizePage(doc, pageNumber, maxSide, quality));
      opts.onProgress?.({
        phase: "rasterizing",
        currentChunk: c.index + 1,
        totalChunks,
        currentPage: pageNumber,
        totalPages: pageCount,
      });
    }

    const isCheckpoint = c.index > 0 && c.index % CHECKPOINT_EVERY === 0;
    try {
      const r = await callChunkEndpoint(endpoint, {
        images,
        contextSummary: rollingSummary,
        chunkIndex: c.index,
        pageStart: c.start,
        pageEnd: c.end,
        isCheckpoint,
        model,
      });
      results[c.index] = { text: r.text, summary: r.summary };
      rollingSummary = r.summary || rollingSummary;
    } catch (e) {
      console.error(`[${provider}-ocr-client] chunk ${c.start}-${c.end} falhou:`, e);
      results[c.index] = { failed: true, range: `${c.start}-${c.end}` };
    } finally {
      completedCount++;
      opts.onProgress?.({
        phase: "extracting",
        currentChunk: completedCount,
        totalChunks: chunks.length,
        currentPage: c.end,
        totalPages: pageCount,
      });
    }
  }
  try {
    // deno-lint-ignore no-explicit-any
    await (doc as any).destroy?.();
  } catch { /* ignore */ }

  const parts: string[] = [];
  const failedChunks: string[] = [];
  for (const r of results) {
    if ("failed" in r) {
      parts.push(`\n\n[FALHA CHUNK páginas ${r.range} — não foi possível transcrever]\n\n`);
      failedChunks.push(r.range);
    } else {
      parts.push(r.text);
    }
  }
  const text = parts.join("\n\n").trim();

  opts.onProgress?.({
    phase: "done",
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    currentPage: pageCount,
    totalPages: pageCount,
  });

  return {
    text,
    pageCount,
    chunkCount: chunks.length,
    failedChunks,
    provider: provider === "gemini" ? "gemini-ocr-client" : "minimax-ocr-client",
    model,
    durationMs: performance.now() - t0,
  };
}

// ---------------- helpers ----------------

async function rasterizePage(
  // deno-lint-ignore no-explicit-any
  doc: any,
  pageNumber: number,
  maxSide: number,
  quality: number,
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  try {
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = maxSide / Math.max(viewport1.width, viewport1.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D não disponível");

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    // libera canvas
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } finally {
    try {
      page.cleanup();
    } catch { /* ignore */ }
  }
}

interface ChunkCallBody {
  images: string[];
  contextSummary: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  isCheckpoint: boolean;
  model?: string;
}

async function callChunkEndpoint(endpoint: "minimax-ocr-chunk" | "gemini-ocr-chunk", body: ChunkCallBody): Promise<{ text: string; summary: string }> {
  // Backoff exponencial em falhas transitórias (429/5xx)
  let lastErr: Error | null = null;
  const delays = [0, 1000, 2000, 4000];
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body,
      });
      if (error) {
        const msg = (error as { message?: string }).message || String(error);
        lastErr = new Error(msg);
        // se erro não parece transitório, aborta
        if (!/\b(429|500|502|503|504)\b/.test(msg)) break;
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const d = data as any;
      if (!d?.ok) {
        lastErr = new Error(d?.error || "resposta inválida do endpoint");
        if (!/\b(429|500|502|503|504)\b/.test(String(d?.error || ""))) break;
        continue;
      }
      return { text: d.text || "", summary: d.summary || "" };
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr || new Error(`Falha ao chamar ${endpoint}`);
}

async function toUint8Array(src: File | Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  return new Uint8Array(await (src as Blob).arrayBuffer());
}
