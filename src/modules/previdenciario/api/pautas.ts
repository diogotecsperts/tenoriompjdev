import { supabase } from "@/integrations/supabase/client";
import type { PrevPauta, PrevPericia, PrevPericiaStatus } from "../types";

/**
 * API client para `prev_pautas` e `prev_pericias`.
 * Todas as chamadas respeitam RLS (auth.uid() = user_id).
 */

// ---------- Pautas ----------

export async function listPautas(): Promise<PrevPauta[]> {
  const { data, error } = await supabase
    .from("prev_pautas" as any)
    .select("*")
    .order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PrevPauta[];
}

export async function getPauta(id: string): Promise<PrevPauta | null> {
  const { data, error } = await supabase
    .from("prev_pautas" as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as PrevPauta | null;
}

export async function createPauta(input: {
  user_id: string;
  data: string;
  local: string;
  cidade?: string | null;
  uf?: string | null;
  observacoes?: string | null;
}): Promise<PrevPauta> {
  const { data, error } = await supabase
    .from("prev_pautas" as any)
    .insert(input as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PrevPauta;
}

export async function updatePauta(
  id: string,
  patch: Partial<Pick<PrevPauta, "data" | "local" | "cidade" | "uf" | "observacoes">>
): Promise<void> {
  const { error } = await supabase
    .from("prev_pautas" as any)
    .update(patch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePauta(id: string): Promise<void> {
  const { error } = await supabase.from("prev_pautas" as any).delete().eq("id", id);
  if (error) throw error;
}

// ---------- Perícias ----------

export async function listPericias(pautaId: string): Promise<PrevPericia[]> {
  const { data, error } = await supabase
    .from("prev_pericias" as any)
    .select("*")
    .eq("pauta_id", pautaId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PrevPericia[];
}

export async function getPericia(id: string): Promise<PrevPericia | null> {
  const { data, error } = await supabase
    .from("prev_pericias" as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as PrevPericia | null;
}

export async function createPericia(input: {
  pauta_id: string;
  user_id: string;
  ordem: number;
  periciado_nome?: string | null;
  pdf_path?: string | null;
}): Promise<PrevPericia> {
  const { data, error } = await supabase
    .from("prev_pericias" as any)
    .insert(input as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PrevPericia;
}

export async function updatePericia(
  id: string,
  patch: Partial<
    Pick<
      PrevPericia,
      | "ordem"
      | "status"
      | "periciado_nome"
      | "pdf_path"
      | "pdf_processado"
      | "prelaudo_data"
      | "prev_extracao"
    >
  >
): Promise<void> {
  const { error } = await supabase
    .from("prev_pericias" as any)
    .update(patch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePericia(id: string): Promise<void> {
  const { error } = await supabase.from("prev_pericias" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function setPericiaStatus(
  id: string,
  status: PrevPericiaStatus
): Promise<void> {
  await updatePericia(id, { status });
}

// ---------- Storage de PDFs ----------

/** Sobe o PDF para `prev-pdfs/{userId}/{periciaId}.pdf`. Retorna o path salvo. */
export async function uploadPericiaPdf(
  userId: string,
  periciaId: string,
  file: File
): Promise<string> {
  const path = `${userId}/${periciaId}.pdf`;
  const { error } = await supabase.storage
    .from("prev-pdfs")
    .upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

// ---------- Rebuild raster de PDFs grandes ----------
//
// Estratégia principal para PDFs > 48MB: em vez de dividir e mandar N chamadas
// ao provider de OCR, rasterizamos todas as páginas via pdfjs no browser, e
// remontamos um PDF novo, só-imagens (JPEG), sem herança de /Resources. Esse
// PDF limpo geralmente fica em 15-30MB para dezenas/centenas de páginas e
// pode ser enviado ao provider configurado no DevPanel em UMA única chamada.

export interface RebuildRasterOptions {
  /** DPI base (default 150). O fallback usa 120 se o PDF ainda ficar grande. */
  dpi?: number;
  /** Qualidade JPEG 0..1 (default 0.75). Fallback usa 0.65. */
  jpegQuality?: number;
  /** Concorrência de rasterização (default 4). */
  parallelism?: number;
  /** Aborta a operação. */
  signal?: AbortSignal;
  /** Callback de progresso por página. */
  onPageProgress?: (done: number, total: number) => void;
}

/**
 * Rasteriza todas as páginas de um PDF e remonta um PDF novo, só-imagens.
 * Faz uma segunda passada com DPI/qualidade menores se o resultado exceder
 * `maxBytes`. Retorna o Blob final (sempre `application/pdf`).
 */
export async function rebuildPdfAsRasterClean(
  source: Blob | File | Uint8Array,
  maxBytes: number = PREV_SPLIT_MAX_BYTES,
  opts: RebuildRasterOptions = {},
): Promise<{ blob: Blob; pageCount: number; dpiUsed: number; qualityUsed: number }> {
  const parallelism = Math.max(1, Math.min(8, opts.parallelism ?? 4));

  const doRebuild = async (dpi: number, quality: number) => {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // pdfjs
    const pdfjs = await import("pdfjs-dist");
    // @ts-ignore worker via Vite ?url
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    const bytes =
      source instanceof Uint8Array
        ? source
        : new Uint8Array(await (source as Blob).arrayBuffer());
    // pdfjs consome o buffer — copia para não invalidar reuso em segunda passada
    const bufCopy = bytes.slice();
    const loadingTask = pdfjs.getDocument({ data: bufCopy } as any);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    // Renderiza uma página → JPEG bytes
    const renderPage = async (pageNum: number): Promise<Uint8Array> => {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const page = await pdf.getPage(pageNum);
      // dpi → scale (pdfjs base é 72 dpi)
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas 2D indisponível");
      // Fundo branco para JPEG (sem alpha)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, background: "white" } as any).promise;
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob null"))),
          "image/jpeg",
          quality,
        );
      });
      const buf = new Uint8Array(await blob.arrayBuffer());
      // libera canvas
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      return buf;
    };

    // Renderiza em paralelo (concorrência limitada), preservando ordem
    const jpegs: Uint8Array[] = new Array(totalPages);
    let nextIdx = 0;
    let done = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < parallelism; w++) {
      workers.push(
        (async () => {
          while (true) {
            const i = nextIdx++;
            if (i >= totalPages) return;
            jpegs[i] = await renderPage(i + 1);
            done++;
            opts.onPageProgress?.(done, totalPages);
          }
        })(),
      );
    }
    await Promise.all(workers);

    // Monta o novo PDF com pdf-lib
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    for (let i = 0; i < totalPages; i++) {
      const jpg = await out.embedJpg(jpegs[i]);
      const page = out.addPage([jpg.width, jpg.height]);
      page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
      // libera referência
      jpegs[i] = undefined as unknown as Uint8Array;
    }
    const outBytes = await out.save({ useObjectStreams: true });
    const outBuf = new ArrayBuffer(outBytes.byteLength);
    new Uint8Array(outBuf).set(outBytes);
    const outBlob = new Blob([outBuf], { type: "application/pdf" });
    return { blob: outBlob, pageCount: totalPages };
  };

  const dpi1 = opts.dpi ?? 150;
  const q1 = opts.jpegQuality ?? 0.75;
  const first = await doRebuild(dpi1, q1);
  console.info(
    `[prev-rebuild] passada 1: ${first.pageCount} págs @ ${dpi1}dpi q=${q1} → ${(first.blob.size / 1024 / 1024).toFixed(1)}MB`,
  );
  if (first.blob.size <= maxBytes) {
    return { blob: first.blob, pageCount: first.pageCount, dpiUsed: dpi1, qualityUsed: q1 };
  }

  // Segunda passada mais agressiva
  const dpi2 = 120;
  const q2 = 0.65;
  console.warn(
    `[prev-rebuild] passada 1 excedeu ${(maxBytes / 1024 / 1024).toFixed(0)}MB — refazendo @ ${dpi2}dpi q=${q2}`,
  );
  const second = await doRebuild(dpi2, q2);
  console.info(
    `[prev-rebuild] passada 2: ${(second.blob.size / 1024 / 1024).toFixed(1)}MB`,
  );
  return { blob: second.blob, pageCount: second.pageCount, dpiUsed: dpi2, qualityUsed: q2 };
}

const CLEAN_SUFFIX = "-clean";

/** Path do PDF limpo auxiliar (não sobrescreve o original). */
export function cleanPericiaPdfPath(userId: string, periciaId: string): string {
  return `${userId}/${periciaId}${CLEAN_SUFFIX}.pdf`;
}

/** Rasteriza + sobe o PDF limpo. Retorna path e metadados. */
export async function rasterAndUploadCleanPdf(
  userId: string,
  periciaId: string,
  source: Blob | File | Uint8Array,
  opts: RebuildRasterOptions = {},
): Promise<{ path: string; sizeBytes: number; pageCount: number }> {
  const { blob, pageCount } = await rebuildPdfAsRasterClean(source, PREV_SPLIT_MAX_BYTES, opts);
  const path = cleanPericiaPdfPath(userId, periciaId);
  const { error } = await supabase.storage
    .from("prev-pdfs")
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  return { path, sizeBytes: blob.size, pageCount };
}

/** Remove o PDF limpo auxiliar (best-effort). */
export async function deletePericiaPdfClean(userId: string, periciaId: string): Promise<void> {
  try {
    await supabase.storage.from("prev-pdfs").remove([cleanPericiaPdfPath(userId, periciaId)]);
  } catch (e) {
    console.warn("[prev-pdfs] falha ao apagar PDF limpo:", e);
  }
}

// ---------- Split de PDFs grandes (>48MB) ----------
//
// Provider mais restritivo hoje é o GLM-OCR (teto de 50MB por request).
// Usamos 48MB como corte defensivo. Só divide quando estritamente necessário:
// PDFs ≤ 48MB seguem o caminho rápido intacto (preProcessarPericia).

export const PREV_SPLIT_MAX_BYTES = 48 * 1024 * 1024;

/**
 * Limite defensivo de páginas por parte. GLM-OCR aceita ≤ 100 páginas por PDF
 * (limite duro do provider). Usamos 90 como margem de segurança.
 */
export const PREV_SPLIT_MAX_PAGES = 90;

/**
 * Lê o pageCount de um PDF sem rasterizar. Usado como probe rápido no gate
 * de entrada de `preProcessarPericiaComSplit` para decidir se precisa rebuild.
 * Custo: ~50-200ms para PDFs de dezenas/centenas de páginas.
 */
export async function probePdfPageCount(source: Blob | File | Uint8Array): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes =
    source instanceof Uint8Array
      ? source
      : new Uint8Array(await (source as Blob).arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Divide um PDF **já rasterizado limpo** em partes sequenciais de até
 * `maxPages` páginas E ≤ `maxBytes`. Só faz sentido em cima do output de
 * `rebuildPdfAsRasterClean` — nunca no PDF original, que pode ter recursos
 * compartilhados que inflam qualquer range.
 *
 * Estratégia: janelas sequenciais de `maxPages`. Se uma janela ainda exceder
 * `maxBytes` (raro no raster proporcional), divide a janela pela metade e
 * reserializa — converge rápido porque cada página raster é independente.
 */
export async function splitCleanPdfByPages(
  cleanSource: Blob | Uint8Array,
  maxPages: number = PREV_SPLIT_MAX_PAGES,
  maxBytes: number = PREV_SPLIT_MAX_BYTES,
): Promise<PrevPdfSplitPart[]> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes =
    cleanSource instanceof Uint8Array
      ? cleanSource
      : new Uint8Array(await (cleanSource as Blob).arrayBuffer());
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = probe.getPageCount();

  const serializeRange = async (startIdx: number, endIdx: number): Promise<Blob> => {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const n = doc.getPageCount();
    for (let i = n - 1; i > endIdx; i--) doc.removePage(i);
    for (let i = startIdx - 1; i >= 0; i--) doc.removePage(i);
    const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
    const buf = new ArrayBuffer(out.byteLength);
    new Uint8Array(buf).set(out);
    return new Blob([buf], { type: "application/pdf" });
  };

  const parts: PrevPdfSplitPart[] = [];

  const emitRange = async (startIdx: number, endIdx: number): Promise<void> => {
    const blob = await serializeRange(startIdx, endIdx);
    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    if (blob.size <= maxBytes) {
      console.info(
        `[prev-split-clean] parte págs ${startIdx + 1}-${endIdx + 1}: ${sizeMB}MB (OK)`,
      );
      parts.push({ blob, startPage: startIdx + 1, endPage: endIdx + 1, totalPages });
      return;
    }
    if (endIdx === startIdx) {
      // Página única raster excedeu maxBytes — improvável, mas marca para o caller.
      console.warn(
        `[prev-split-clean] página raster ${startIdx + 1} ficou ${sizeMB}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB`,
      );
      parts.push({
        blob,
        startPage: startIdx + 1,
        endPage: endIdx + 1,
        totalPages,
        needsClientRasterize: true,
      });
      return;
    }
    console.info(
      `[prev-split-clean] janela ${startIdx + 1}-${endIdx + 1} = ${sizeMB}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB — subdividindo`,
    );
    const mid = Math.floor((startIdx + endIdx) / 2);
    await emitRange(startIdx, mid);
    await emitRange(mid + 1, endIdx);
  };

  // Janelas sequenciais de `maxPages`
  for (let start = 0; start < totalPages; start += maxPages) {
    const end = Math.min(start + maxPages - 1, totalPages - 1);
    await emitRange(start, end);
  }
  console.info(
    `[prev-split-clean] ${totalPages} págs → ${parts.length} partes (maxPages=${maxPages}, maxBytes=${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
  );
  return parts;
}

export interface PrevPdfSplitPart {
  blob: Blob;
  startPage: number; // 1-based
  endPage: number; // 1-based, inclusive
  totalPages: number;
  /**
   * Sinaliza que esta parte (tipicamente uma página única com conteúdo pesado
   * genuíno) não coube em `maxBytes` mesmo após clone+remove. O caller deve
   * rasterizar essa parte client-side (pdfjs) em vez de subir ao provider.
   */
  needsClientRasterize?: boolean;
}

export function prevPdfNeedsSplit(source: Blob | File | { size: number }): boolean {
  return source.size > PREV_SPLIT_MAX_BYTES;
}

/**
 * Divide um PDF em partes ≤ maxBytes usando halving recursivo.
 *
 * Estratégia: em vez de `PDFDocument.create()` + `copyPages()` (que inlineia
 * o dicionário `/Resources` compartilhado da árvore de páginas — bug conhecido
 * do pdf-lib em PDFs judiciais), recarrega os bytes originais e **remove** as
 * páginas fora do range. Ao salvar com `useObjectStreams: true`, o pdf-lib só
 * emite objetos alcançáveis a partir do trailer — recursos órfãos somem.
 *
 * Se, mesmo após clone+remove, uma única página exceder `maxBytes`, marca a
 * parte com `needsClientRasterize: true` para o caller resolver via pdfjs.
 */
export async function splitPrevPdf(
  source: Blob | File | Uint8Array,
  maxBytes: number = PREV_SPLIT_MAX_BYTES,
): Promise<PrevPdfSplitPart[]> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes =
    source instanceof Uint8Array
      ? source
      : new Uint8Array(await (source as Blob).arrayBuffer());
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = probe.getPageCount();

  // Clone + remove: recarrega o PDF por range e remove páginas fora dele.
  const serializeRange = async (startIdx: number, endIdx: number): Promise<Blob> => {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const n = doc.getPageCount();
    // Remove de trás pra frente para não deslocar índices.
    for (let i = n - 1; i > endIdx; i--) doc.removePage(i);
    for (let i = startIdx - 1; i >= 0; i--) doc.removePage(i);
    const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
    const buf = new ArrayBuffer(out.byteLength);
    new Uint8Array(buf).set(out);
    return new Blob([buf], { type: "application/pdf" });
  };

  const parts: PrevPdfSplitPart[] = [];

  const divide = async (startIdx: number, endIdx: number): Promise<void> => {
    const blob = await serializeRange(startIdx, endIdx);
    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    if (blob.size <= maxBytes) {
      console.info(
        `[prev-split] parte págs ${startIdx + 1}-${endIdx + 1}: ${sizeMB}MB (OK)`,
      );
      parts.push({
        blob,
        startPage: startIdx + 1,
        endPage: endIdx + 1,
        totalPages,
      });
      return;
    }
    if (endIdx === startIdx) {
      // Página única ainda pesada após clone+remove — cai no fallback rasterizado.
      console.warn(
        `[prev-split] página ${startIdx + 1} ainda ${sizeMB}MB após clone+remove; marcando para rasterização client-side`,
      );
      parts.push({
        blob,
        startPage: startIdx + 1,
        endPage: endIdx + 1,
        totalPages,
        needsClientRasterize: true,
      });
      return;
    }
    console.info(
      `[prev-split] range ${startIdx + 1}-${endIdx + 1} = ${sizeMB}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB — dividindo`,
    );
    const mid = Math.floor((startIdx + endIdx) / 2);
    await divide(startIdx, mid);
    await divide(mid + 1, endIdx);
  };

  await divide(0, totalPages - 1);
  return parts;
}

/** Sobe uma parte temporária em `prev-pdfs/{userId}/{periciaId}/parts/part-{index}.pdf`. */
export async function uploadPericiaPdfPart(
  userId: string,
  periciaId: string,
  index: number,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${periciaId}/parts/part-${String(index).padStart(3, "0")}.pdf`;
  const { error } = await supabase.storage
    .from("prev-pdfs")
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

/** Baixa o PDF completo de uma perícia (para split client-side). */
export async function downloadPericiaPdf(pdfPath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from("prev-pdfs").download(pdfPath);
  if (error || !data) throw error ?? new Error("PDF não encontrado no storage.");
  return data;
}

/** Remove todas as partes temporárias de `{userId}/{periciaId}/parts/`. Best-effort. */
export async function deletePericiaPdfParts(
  userId: string,
  periciaId: string,
): Promise<void> {
  try {
    const prefix = `${userId}/${periciaId}/parts`;
    const { data, error } = await supabase.storage.from("prev-pdfs").list(prefix, {
      limit: 100,
    });
    if (error || !data || data.length === 0) return;
    const paths = data.map((f) => `${prefix}/${f.name}`);
    await supabase.storage.from("prev-pdfs").remove(paths);
  } catch (e) {
    console.warn("[prev-pdfs] falha ao limpar partes temporárias:", e);
  }
}

export async function getPericiaPdfSignedUrl(
  path: string,
  expiresInSec = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("prev-pdfs")
    .createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function deletePericiaPdf(path: string): Promise<void> {
  const { error } = await supabase.storage.from("prev-pdfs").remove([path]);
  if (error) throw error;
}
