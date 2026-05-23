import { supabase } from "@/integrations/supabase/client";

export type PrevCampo =
  | "prev_cid_descricao"
  | "prev_nexo"
  | "prev_incapacidade_global"
  | "prev_dii_justificativa"
  | "prev_enquadramento"
  | "prev_conclusao";

export interface GeneratePrevFieldArgs {
  laudoId: string;
  campo: PrevCampo;
  escolha?: string | string[];
  cidsManuais?: string[];
}

/**
 * Wrapper de cliente para a Edge Function `gerar-justificativa-medica`,
 * estendida na Fase 5.8 para suportar campos previdenciários.
 *
 * Retorna o texto puro gerado. Lança Error com mensagem amigável em caso de falha.
 */
export async function generatePrevField({
  laudoId,
  campo,
  escolha,
  cidsManuais,
}: GeneratePrevFieldArgs): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "gerar-justificativa-medica",
    {
      body: { laudoId, campo, escolha, cidsManuais },
    }
  );

  if (error) {
    throw new Error(error.message || "Falha ao chamar a IA.");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  if (!data?.texto || typeof data.texto !== "string") {
    throw new Error("Resposta da IA em formato inesperado.");
  }
  return data.texto;
}
