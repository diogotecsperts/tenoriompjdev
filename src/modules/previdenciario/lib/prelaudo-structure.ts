/**
 * SSOT do Pré-Laudo Previdenciário.
 * Define os 10 steps. Fase D entrega 1–5; Fase E entrega 6–10.
 */

export type StepId =
  | "identificacao"
  | "queixa"
  | "medicacao"
  | "acompanhamento"
  | "comorbidades"
  | "estado_mental"
  | "ectoscopia"
  | "exame_ortopedico"
  | "cid"
  | "conclusao";

export interface StepDef {
  id: StepId;
  ordem: number;
  label: string;
  short: string;
  implemented: boolean;
}

export const PRELAUDO_STEPS: StepDef[] = [
  { id: "identificacao",     ordem: 1,  label: "Identificação",        short: "Identif.",  implemented: true  },
  { id: "queixa",            ordem: 2,  label: "Queixa principal",     short: "Queixa",    implemented: true  },
  { id: "medicacao",         ordem: 3,  label: "Medicação em uso",     short: "Medicação", implemented: true  },
  { id: "acompanhamento",    ordem: 4,  label: "Acompanhamento médico",short: "Acomp.",    implemented: true  },
  { id: "comorbidades",      ordem: 5,  label: "Comorbidades",         short: "Comorb.",   implemented: true  },
  { id: "estado_mental",     ordem: 6,  label: "Estado mental",        short: "Mental",    implemented: false },
  { id: "ectoscopia",        ordem: 7,  label: "Ectoscopia / Geral",   short: "Ectosc.",   implemented: false },
  { id: "exame_ortopedico",  ordem: 8,  label: "Exame ortopédico",     short: "Ortop.",    implemented: false },
  { id: "cid",               ordem: 9,  label: "CID-10",               short: "CID",       implemented: false },
  { id: "conclusao",         ordem: 10, label: "Conclusão",            short: "Concl.",    implemented: false },
];

// =====================================================================
// Schema do prelaudo_data (jsonb persistido em prev_pericias)
// =====================================================================

export interface IdentificacaoData {
  nome: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  idade: string;
  sexo: string;
  estado_civil: string;
  escolaridade: string;
  profissao: string;
  ultima_atividade: string;
  endereco: string;
  telefone: string;
  // Processo
  numero_processo: string;
  vara: string;
  comarca: string;
  beneficio_pleiteado: string;
}

export interface QueixaData {
  queixa_principal: string;
  inicio_sintomas: string;     // texto livre
  evolucao: string;
  lateralidade: string;        // ex: "direita", "esquerda", "bilateral", "n/a"
  fatores_agravantes: string;
}

export interface MedicacaoItem {
  nome: string;
  dose: string;
  frequencia: string;
  em_uso: boolean;
}
export interface MedicacaoData {
  itens: MedicacaoItem[];
  observacoes: string;
}

export interface AcompanhamentoData {
  faz_acompanhamento: "sim" | "nao" | "";
  especialistas: string;       // ex: "Ortopedista, Psiquiatra"
  frequencia: string;          // ex: "mensal"
  ultima_consulta: string;
  observacoes: string;
}

export interface ComorbidadesData {
  texto: string;               // narrativa livre
  lista: string[];             // chips
  cirurgias_previas: string;
  internacoes: string;
  historico_familiar: string;
}

export interface PrelaudoData {
  identificacao: Partial<IdentificacaoData>;
  queixa: Partial<QueixaData>;
  medicacao: Partial<MedicacaoData>;
  acompanhamento: Partial<AcompanhamentoData>;
  comorbidades: Partial<ComorbidadesData>;
  // Steps 6-10 (placeholders para Fase E)
  estado_mental?: Record<string, any>;
  ectoscopia?: Record<string, any>;
  exame_ortopedico?: Record<string, any>;
  cid?: Record<string, any>;
  conclusao?: Record<string, any>;
}

export const EMPTY_PRELAUDO: PrelaudoData = {
  identificacao: {},
  queixa: {},
  medicacao: { itens: [] },
  acompanhamento: {},
  comorbidades: { lista: [] },
};

/**
 * Pré-preenche o prelaudo_data a partir do prev_extracao (cache da IA).
 * NUNCA sobrescreve campos já preenchidos pelo médico — preenche apenas o que está vazio.
 * Princípio: "Médico decide, IA sugere".
 */
export function mergeFromExtracao(
  current: PrelaudoData | undefined,
  extracao: Record<string, any> | undefined,
): PrelaudoData {
  const base: PrelaudoData = {
    ...EMPTY_PRELAUDO,
    ...(current || {}),
    identificacao: { ...(current?.identificacao || {}) },
    queixa: { ...(current?.queixa || {}) },
    medicacao: { itens: [], ...(current?.medicacao || {}) },
    acompanhamento: { ...(current?.acompanhamento || {}) },
    comorbidades: { lista: [], ...(current?.comorbidades || {}) },
  };
  if (!extracao) return base;

  const ident = extracao.identificacao || {};
  const proc = extracao.processo || {};
  const fill = (target: any, key: string, value: any) => {
    if (value && !target[key]) target[key] = value;
  };

  fill(base.identificacao, "nome", ident.nome);
  fill(base.identificacao, "cpf", ident.cpf);
  fill(base.identificacao, "rg", ident.rg);
  fill(base.identificacao, "data_nascimento", ident.data_nascimento);
  fill(base.identificacao, "idade", ident.idade);
  fill(base.identificacao, "sexo", ident.sexo);
  fill(base.identificacao, "estado_civil", ident.estado_civil);
  fill(base.identificacao, "escolaridade", ident.escolaridade);
  fill(base.identificacao, "profissao", ident.profissao);
  fill(base.identificacao, "ultima_atividade", ident.ultima_atividade);
  fill(base.identificacao, "endereco", ident.endereco);
  fill(base.identificacao, "telefone", ident.telefone);
  fill(base.identificacao, "numero_processo", proc.numero);
  fill(base.identificacao, "vara", proc.vara);
  fill(base.identificacao, "comarca", proc.comarca);
  fill(base.identificacao, "beneficio_pleiteado", proc.beneficio_pleiteado);

  fill(base.queixa, "queixa_principal", extracao.queixa_principal);

  // Medicações (apenas se a lista atual estiver vazia)
  if ((!base.medicacao.itens || base.medicacao.itens.length === 0) && Array.isArray(extracao.medicacoes)) {
    base.medicacao.itens = extracao.medicacoes.map((m: any) => {
      if (typeof m === "string") return { nome: m, dose: "", frequencia: "", em_uso: true };
      return {
        nome: m?.nome || String(m || ""),
        dose: m?.dose || "",
        frequencia: m?.frequencia || "",
        em_uso: m?.em_uso !== false,
      };
    });
  }

  // Comorbidades narrativa
  if (!base.comorbidades.texto && typeof extracao.comorbidades === "string") {
    base.comorbidades.texto = extracao.comorbidades;
  }

  return base;
}
