/**
 * Tipos do novo módulo Previdenciário (v2).
 * Isolado do trabalhista e da v1.
 */

export type PrevPericiaStatus =
  | "aguardando"
  | "em_atendimento"
  | "concluido"
  | "faltou";

export type PrevDocumentoTipo =
  | "laudo"
  | "exame"
  | "receita"
  | "pedido"
  | "outro";

export interface PrevPauta {
  id: string;
  user_id: string;
  data: string; // ISO date YYYY-MM-DD
  local: string;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrevPericia {
  id: string;
  pauta_id: string;
  user_id: string;
  ordem: number;
  status: PrevPericiaStatus;
  periciado_nome: string | null;
  pdf_path: string | null;
  pdf_processado: boolean;
  prelaudo_data: Record<string, any>;
  prev_extracao: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PrevDocumento {
  id: string;
  pericia_id: string;
  user_id: string;
  tipo: PrevDocumentoTipo;
  data: string | null;
  resumo: string | null;
  trecho_original: string | null;
  ordem: number;
  created_at: string;
}

export const PERICIA_STATUS_LABEL: Record<PrevPericiaStatus, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  faltou: "Faltou",
};

export const PERICIA_STATUS_COLOR: Record<PrevPericiaStatus, string> = {
  aguardando: "bg-muted text-muted-foreground",
  em_atendimento: "bg-amber-100 text-amber-700 border-amber-200",
  concluido: "bg-emerald-100 text-emerald-700 border-emerald-200",
  faltou: "bg-red-100 text-red-700 border-red-200",
};
