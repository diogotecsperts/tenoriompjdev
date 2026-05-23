/**
 * Tipagem forte e defaults para a coluna jsonb `prev_data`.
 * Toda escrita deve usar merge raso por grupo.
 */

export type PrevBeneficioTipo =
  | "B31"
  | "B32"
  | "B91"
  | "B92"
  | "BPC_LOAS"
  | "isencao_IR"
  | "majoracao_25"
  | "";

export type PrevQualidadeSegurado =
  | "empregado"
  | "contribuinte_individual"
  | "facultativo"
  | "segurado_especial"
  | "desempregado_periodo_graca"
  | "";

export interface PrevData {
  beneficio: {
    tipo: PrevBeneficioTipo;
    nb_numero: string;
    der: string;
    dib: string;
    dcb: string;
    motivo_cessacao: string;
  };
  segurado: {
    rg: string;
    cpf: string;
    nit_pis: string;
    endereco: string;
    estado_civil: string;
    qualidade_segurado: PrevQualidadeSegurado;
    ultima_atividade: string;
    data_ultima_contribuicao: string;
  };
  historia_clinica_prev: string;
  historia_laboral_prev: string;
  incapacidade: {
    existe: "sim" | "nao" | "parcial" | "";
    tipo: "temporaria" | "permanente" | "";
    grau: "parcial" | "total" | "";
    abrangencia: "uniprofissional" | "multiprofissional" | "omniprofissional" | "";
    dii: string;
    dii_justificativa: string;
    data_recuperacao_estimada: string;
    susceptivel_reabilitacao: "sim" | "nao" | "inconclusivo" | "";
    necessita_auxilio_terceiros: "sim" | "nao" | "";
    justificativa: string;
  };
  nexo: {
    tipo: "comum" | "tecnico_NTEP" | "profissional" | "sem_nexo" | "";
    justificativa: string;
  };
  enquadramento: {
    leis_aplicaveis: string[];
    fundamentacao: string;
  };
  conclusao_prev: {
    parecer:
      | "apto"
      | "incapaz_temporario"
      | "incapaz_permanente_total"
      | "incapaz_permanente_parcial"
      | "inconclusivo"
      | "";
    beneficio_recomendado: string;
    texto_final: string;
  };
  quesitos: {
    juizo: string;
    autor: string;
    inss: string;
  };
}

export function getDefaultPrevData(): PrevData {
  return {
    beneficio: {
      tipo: "",
      nb_numero: "",
      der: "",
      dib: "",
      dcb: "",
      motivo_cessacao: "",
    },
    segurado: {
      rg: "",
      cpf: "",
      nit_pis: "",
      endereco: "",
      estado_civil: "",
      qualidade_segurado: "",
      ultima_atividade: "",
      data_ultima_contribuicao: "",
    },
    historia_clinica_prev: "",
    historia_laboral_prev: "",
    incapacidade: {
      existe: "",
      tipo: "",
      grau: "",
      abrangencia: "",
      dii: "",
      dii_justificativa: "",
      data_recuperacao_estimada: "",
      susceptivel_reabilitacao: "",
      necessita_auxilio_terceiros: "",
      justificativa: "",
    },
    nexo: { tipo: "", justificativa: "" },
    enquadramento: { leis_aplicaveis: [], fundamentacao: "" },
    conclusao_prev: { parecer: "", beneficio_recomendado: "", texto_final: "" },
    quesitos: { juizo: "", autor: "", inss: "" },
  };
}

/** Merge raso seguro entre PrevData parcial e atual. */
export function mergePrevData(current: PrevData, patch: Partial<PrevData>): PrevData {
  const out: PrevData = { ...current };
  for (const key of Object.keys(patch) as (keyof PrevData)[]) {
    const v = patch[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[key] = { ...(current[key] as object), ...(v as object) } as any;
    } else {
      out[key] = v as any;
    }
  }
  return out;
}
