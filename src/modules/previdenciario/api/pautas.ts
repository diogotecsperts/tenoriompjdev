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
