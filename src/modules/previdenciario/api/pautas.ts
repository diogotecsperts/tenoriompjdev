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

// ---------- Split de PDFs grandes (>48MB) ----------
//
// Provider mais restritivo hoje é o GLM-OCR (teto de 50MB por request).
// Usamos 48MB como corte defensivo. Só divide quando estritamente necessário:
// PDFs ≤ 48MB seguem o caminho rápido intacto (preProcessarPericia).

export const PREV_SPLIT_MAX_BYTES = 48 * 1024 * 1024;

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
