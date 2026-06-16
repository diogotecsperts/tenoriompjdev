import { supabase } from "@/integrations/supabase/client";

export interface PreProcessarResult {
  ok: true;
  periciaId: string;
  pages: number;
  documentosCriados: number;
  provider: string;
  model: string;
  durationMs: number;
}

/**
 * Dispara o pré-processamento IA de uma perícia previdenciária.
 * Reusa exatamente a infra de IA configurada no DevPanel (provider/fallback/retry).
 */
export async function preProcessarPericia(periciaId: string): Promise<PreProcessarResult> {
  const { data, error } = await supabase.functions.invoke("prev-pre-processar", {
    body: { periciaId },
  });
  if (error) {
    throw new Error(error.message || "Falha no pré-processamento.");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  if (!data?.ok) {
    throw new Error("Resposta inesperada do servidor.");
  }
  return data as PreProcessarResult;
}
