/**
 * SSOT do Pré-Laudo Previdenciário — versão GUIA 23.06.
 *
 * Estrutura final: 4 etapas (Identificação, Queixa, Exame físico, Resumo) +
 * cabeçalho fixo de "Dados do processo" fora dos steps.
 *
 * Os IDs/tipos antigos (medicacao, acompanhamento, comorbidades, estado_mental,
 * ectoscopia, exame_ortopedico, cid, conclusao) permanecem no schema apenas para
 * retrocompatibilidade com pré-laudos já salvos. Eles NÃO são exibidos na
 * navegação, no editor ou na exportação.
 */

export type StepId =
  // ativos
  | "identificacao"
  | "queixa"
  | "exame_fisico"
  | "resumo"
  // legados (mantidos só para retrocompat de dados salvos)
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

/** Apenas as 4 etapas ativas — usadas pela navegação, editor e exportadores. */
export const PRELAUDO_STEPS: StepDef[] = [
  { id: "identificacao", ordem: 1, label: "Identificação",   short: "Identif.", implemented: true },
  { id: "queixa",        ordem: 2, label: "Queixa principal", short: "Queixa",   implemented: true },
  { id: "exame_fisico",  ordem: 3, label: "Exame físico",     short: "Exame",    implemented: true },
  { id: "resumo",        ordem: 4, label: "Resumo",           short: "Resumo",   implemented: true },
];

export const ALL_STEP_IDS: StepId[] = PRELAUDO_STEPS.map((s) => s.id);

// =====================================================================
// Listas fixas usadas em selects e exportação
// =====================================================================

export const ESTADO_CIVIL_OPCOES = [
  "União estável",
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "Não informado",
  "Outros",
] as const;

export const ESCOLARIDADE_OPCOES = [
  "Analfabeto",
  "Ensino fundamental incompleto",
  "Ensino fundamental completo",
  "Ensino médio incompleto",
  "Ensino médio completo",
  "Ensino superior incompleto",
  "Ensino superior completo",
  "Outros",
] as const;

// =====================================================================
// Normalizadores — convertem texto cru da IA para um dos rótulos fixos.
// Caso não reconheçam, devolvem { value: "Outros", outros: <texto original> }
// para que (a) o Select mostre "Outros", (b) o campo livre seja preenchido
// e (c) o PDF/DOCX marque "Outros: <texto>".
// =====================================================================

const stripDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function normalizeEscolaridade(
  raw: string | undefined | null,
): { value: string; outros: string } {
  const text = (raw || "").toString().trim();
  if (!text) return { value: "", outros: "" };
  const n = stripDiacritics(text).replace(/[.;,]+$/g, "").trim();

  // Match direto contra a lista oficial.
  for (const op of ESCOLARIDADE_OPCOES) {
    if (stripDiacritics(op) === n) return { value: op, outros: "" };
  }

  // Heurísticas / sinônimos
  const hasInc = /\binc(ompleto|\.?)\b|nao concluid|sem conclus/.test(n);
  const hasComp = /\bcompl(eto|\.?)\b|concluid|formad/.test(n);

  const isAnalf = /analfabet|sem instruc|nao alfabet|nao-alfabet/.test(n);
  const isFund = /fundamental|\b1[ºo°]?\s*grau\b|primari|ginasi|\b[1-9]a?\s*serie\b|\b8a?\s*serie\b|\b9a?\s*serie\b|eja\s*fundamental/.test(n);
  const isMed = /\bmedio\b|\b2[ºo°]?\s*grau\b|colegial|tecnico|cientifico|eja\s*medio|ensino tecnico/.test(n);
  const isSup = /superior|graduac|universitari|pos[\s-]?graduac|mestrad|doutorad|especializac|bachare|licenciatur|tecnologo/.test(n);

  if (isAnalf) return { value: "Analfabeto", outros: "" };
  if (isSup) {
    if (hasInc) return { value: "Ensino superior incompleto", outros: "" };
    return { value: "Ensino superior completo", outros: "" };
  }
  if (isMed) {
    if (hasInc) return { value: "Ensino médio incompleto", outros: "" };
    if (hasComp || /tecnico|cientifico/.test(n)) return { value: "Ensino médio completo", outros: "" };
    return { value: "Ensino médio completo", outros: "" };
  }
  if (isFund) {
    if (hasInc) return { value: "Ensino fundamental incompleto", outros: "" };
    if (hasComp) return { value: "Ensino fundamental completo", outros: "" };
    return { value: "Ensino fundamental incompleto", outros: "" };
  }

  return { value: "Outros", outros: text };
}

export function normalizeEstadoCivil(
  raw: string | undefined | null,
): { value: string; outros: string } {
  const text = (raw || "").toString().trim();
  if (!text) return { value: "", outros: "" };
  const n = stripDiacritics(text).replace(/[.;,]+$/g, "").trim();

  for (const op of ESTADO_CIVIL_OPCOES) {
    if (stripDiacritics(op) === n) return { value: op, outros: "" };
  }

  if (/uniao\s*estavel|amasiad|amig?ad|convivente|companheir/.test(n))
    return { value: "União estável", outros: "" };
  if (/^solteir|solteir[oa]/.test(n)) return { value: "Solteiro(a)", outros: "" };
  if (/^casad|casad[oa]/.test(n)) return { value: "Casado(a)", outros: "" };
  if (/divorciad|separad[oa]\s*judicial/.test(n)) return { value: "Divorciado(a)", outros: "" };
  if (/viuv[oa]/.test(n)) return { value: "Viúvo(a)", outros: "" };
  if (/nao\s*informad|n[\/.]?\s*i\b|sem\s*informac/.test(n))
    return { value: "Não informado", outros: "" };

  return { value: "Outros", outros: text };
}


/** Comorbidades fixas (etapa 2). Ordem do guia do cliente. */
export const COMORBIDADES_FIXAS = [
  { key: "has",            label: "Hipertensão arterial sistêmica" },
  { key: "dm2",            label: "Diabetes mellitus tipo 2" },
  { key: "dislipidemia",   label: "Dislipidemia" },
  { key: "hipotireoidismo", label: "Hipotireoidismo" },
  { key: "ansiedade",      label: "Transtorno de ansiedade" },
  { key: "depressao",      label: "Transtorno depressivo" },
  { key: "fibromialgia",   label: "Fibromialgia" },
  { key: "obesidade",      label: "Obesidade" },
  { key: "cardiopatia",    label: "Cardiopatia" },
  { key: "dpoc",           label: "Doença pulmonar obstrutiva crônica" },
  { key: "irc",            label: "Insuficiência renal crônica" },
  { key: "ar",             label: "Artrite reumatoide" },
] as const;
export type ComorbidadeKey = typeof COMORBIDADES_FIXAS[number]["key"];

export const COMORBIDADES_FIXAS_KEYS: ComorbidadeKey[] =
  COMORBIDADES_FIXAS.map((c) => c.key);

/** Textos FIXOS da etapa Exame Físico — não editáveis, vão para o export. */
export const EXAME_FISICO_TEXTOS = {
  estado_mental:
    "Consciente, orientada em tempo, espaço e pessoa, com atenção, memória, linguagem, pensamento, humor, afeto e percepção preservados. Juízo crítico e insight adequado, sem evidências de sofrimento psíquico ou alterações comportamentais relevantes no momento da avaliação.",
  ectoscopia:
    "Ectoscopia: Bom estado geral, corada, hidratada, anictérica, acianótica, com boa higiene pessoal.",
  inspecao_dinamica:
    "Inspeção Dinâmica: Deambula sem auxílio de órtese, com marcha sem alterações significativas no momento da avaliação.",
  complementacao:
    "Diante do exposto, destituído de qualquer parcialidade ou interesse, a não ser contribuir com a verdade, com base na história clínica, no exame físico, nos laudos médicos apresentados, exames de imagem e demais documentos constantes nos autos posso concluir afirmando:",
} as const;

export type IncapacidadeValue =
  | ""
  | "nao_ha"
  | "temporaria_cessada"
  | "temporaria_presente"
  | "permanente";

export const INCAPACIDADE_OPCOES: { value: Exclude<IncapacidadeValue, "">; label: string }[] = [
  { value: "nao_ha",              label: "Não há incapacidade" },
  { value: "temporaria_cessada",  label: "Temporária, já cessada" },
  { value: "temporaria_presente", label: "Temporária, ainda presente" },
  { value: "permanente",          label: "Permanente" },
];

export const INCAPACIDADE_LABEL: Record<IncapacidadeValue, string> = {
  "": "",
  nao_ha: "não há incapacidade",
  temporaria_cessada: "temporária, já cessada",
  temporaria_presente: "temporária, ainda presente",
  permanente: "permanente",
};

/** Heurística: o benefício pleiteado é BPC/LOAS? (usado pela edge function) */
export function isBpcLoas(beneficio?: string | null): boolean {
  if (!beneficio) return false;
  return /\b(BPC|LOAS|assistencial|amparo\s+social|prest[aá]\w*\s+continuada)\b/i.test(beneficio);
}

// =====================================================================
// Schemas
// =====================================================================

export interface IdentificacaoData {
  nome: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  idade: string;
  sexo: string;
  estado_civil: string;          // valor da lista fixa OU "Outros"
  estado_civil_outros: string;   // texto livre quando estado_civil = "Outros"
  escolaridade: string;          // valor da lista fixa OU "Outros"
  escolaridade_outros: string;
  profissao: string;
  ultima_atividade: string;
  tempo_sem_trabalhar: string;   // 100% manual a partir do GUIA 23.06
  pessoas_mesmo_teto: string;    // só preenchido pela IA em BPC/LOAS
  // Campos de processo (renderizados no ProcessoHeader, não no Step01)
  numero_processo: string;
  vara: string;
  comarca: string;
  data_pericia: string;
  beneficio_pleiteado: string;
  // legados
  endereco?: string;
  telefone?: string;
}

export interface ComorbidadeExtra {
  marcado: boolean;
  texto: string;
}

export interface QueixaData {
  /** Parágrafo unificado gerado pela IA (etapa 2 — bloco principal). */
  queixa_principal: string;
  /** Texto livre — medicações em uso contínuo (IA preenche, médico edita). */
  medicacoes_uso: string;
  /** Marcação das 12 comorbidades fixas. */
  comorbidades_fixas: Partial<Record<ComorbidadeKey, boolean>>;
  /** Linhas extras criadas pelo usuário (checkbox + texto). */
  comorbidades_extras: ComorbidadeExtra[];
  // legados (campos antigos do Step02 — preservados para retrocompat)
  inicio_sintomas?: string;
  evolucao?: string;
  lateralidade?: string;
  fatores_agravantes?: string;
}

export interface ExameFisicoData {
  incap_funcao_habitual: IncapacidadeValue;
  incap_vida_independente: IncapacidadeValue;
}

export interface ResumoData {
  /** Texto gerado pela IA com os blocos de extração de laudos de exames. */
  texto: string;
}

// ---------- legados (mantidos para retrocompat de dados salvos) ----------

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
  especialistas: string;
  frequencia: string;
  ultima_consulta: string;
  observacoes: string;
}
export interface ComorbidadesData {
  texto: string;
  lista: string[];
  cirurgias_previas: string;
  internacoes: string;
  historico_familiar: string;
}
export interface EstadoMentalData {
  orientacao: string; humor: string; afeto: string; pensamento: string;
  memoria: string; atencao: string; juizo_critica: string; observacoes: string;
}
export interface EctoscopiaData {
  estado_geral: string; hidratacao: string; corado: string; acianotico: string;
  anicterico: string; marcha: string; postura: string; peso: string; altura: string;
  imc: string; pressao_arterial: string; observacoes: string;
}
export interface ExameOrtopedicoData {
  segmento_avaliado: string; inspecao: string; palpacao: string;
  amplitude_movimento: string; forca_muscular: string; reflexos: string;
  testes_especiais: string; manobras: string; observacoes: string;
}
export interface CidItem { codigo: string; descricao: string; principal: boolean; }
export interface CidData { itens: CidItem[]; observacoes: string; }
export interface ConclusaoData {
  diagnostico: string; nexo_causal: "sim" | "nao" | "parcial" | "";
  nexo_justificativa: string; incapacidade: "total" | "parcial" | "ausente" | "";
  temporalidade: "temporaria" | "permanente" | ""; data_inicio_incapacidade: string;
  prazo_reavaliacao: string; reabilitacao_indicada: "sim" | "nao" | "";
  consideracoes_finais: string;
}

// =====================================================================
// PrelaudoData completo
// =====================================================================

export interface PrelaudoData {
  identificacao: Partial<IdentificacaoData>;
  queixa: Partial<QueixaData>;
  exame_fisico: Partial<ExameFisicoData>;
  resumo: Partial<ResumoData>;
  // legados (não exibidos)
  medicacao?: Partial<MedicacaoData>;
  acompanhamento?: Partial<AcompanhamentoData>;
  comorbidades?: Partial<ComorbidadesData>;
  estado_mental?: Partial<EstadoMentalData>;
  ectoscopia?: Partial<EctoscopiaData>;
  exame_ortopedico?: Partial<ExameOrtopedicoData>;
  cid?: Partial<CidData>;
  conclusao?: Partial<ConclusaoData>;
}

export const EMPTY_PRELAUDO: PrelaudoData = {
  identificacao: {},
  queixa: { comorbidades_fixas: {}, comorbidades_extras: [] },
  exame_fisico: {},
  resumo: {},
};

/**
 * Pré-preenche o prelaudo_data a partir do prev_extracao (cache da IA).
 * NUNCA sobrescreve campos já preenchidos pelo médico.
 */
export function mergeFromExtracao(
  current: PrelaudoData | undefined,
  extracao: Record<string, any> | undefined,
): PrelaudoData {
  const queixaCur: Partial<QueixaData> = current?.queixa || {};
  const base: PrelaudoData = {
    ...EMPTY_PRELAUDO,
    ...(current || {}),
    identificacao: { ...(current?.identificacao || {}) },
    queixa: {
      ...queixaCur,
      comorbidades_fixas: { ...(queixaCur.comorbidades_fixas || {}) },
      comorbidades_extras: Array.isArray(queixaCur.comorbidades_extras)
        ? [...queixaCur.comorbidades_extras]
        : [],
    },
    exame_fisico: { ...(current?.exame_fisico || {}) },
    resumo: { ...(current?.resumo || {}) },
  };
  if (!extracao) return base;

  const ident = extracao.identificacao || {};
  const proc = extracao.processo || {};
  const fill = (target: any, key: string, value: any) => {
    if (value && !target[key]) target[key] = value;
  };

  // Identificação
  fill(base.identificacao, "nome", ident.nome);
  fill(base.identificacao, "cpf", ident.cpf);
  fill(base.identificacao, "rg", ident.rg);
  fill(base.identificacao, "data_nascimento", ident.data_nascimento);
  fill(base.identificacao, "idade", ident.idade);
  fill(base.identificacao, "sexo", ident.sexo);
  // Estado civil + escolaridade passam por normalizadores: garantem que o
  // valor caia em um dos rótulos fixos OU vire "Outros" + texto livre.
  if (!base.identificacao.estado_civil && ident.estado_civil) {
    const ec = normalizeEstadoCivil(ident.estado_civil);
    if (ec.value) base.identificacao.estado_civil = ec.value;
    if (ec.outros && !base.identificacao.estado_civil_outros) {
      base.identificacao.estado_civil_outros = ec.outros;
    }
  }
  if (!base.identificacao.escolaridade && ident.escolaridade) {
    const es = normalizeEscolaridade(ident.escolaridade);
    if (es.value) base.identificacao.escolaridade = es.value;
    if (es.outros && !base.identificacao.escolaridade_outros) {
      base.identificacao.escolaridade_outros = es.outros;
    }
  }
  fill(base.identificacao, "profissao", ident.profissao);
  fill(base.identificacao, "ultima_atividade", ident.ultima_atividade);
  // tempo_sem_trabalhar: NÃO pré-preencher (regra GUIA 23.06)
  // pessoas_mesmo_teto: edge function só envia em BPC/LOAS
  fill(base.identificacao, "pessoas_mesmo_teto", ident.pessoas_mesmo_teto);

  // Processo (alimentam o ProcessoHeader)
  fill(base.identificacao, "numero_processo", proc.numero);
  fill(base.identificacao, "vara", proc.vara);
  fill(base.identificacao, "comarca", proc.comarca);
  fill(base.identificacao, "beneficio_pleiteado", proc.beneficio_pleiteado);

  // Queixa principal (parágrafo unificado pela 2ª passada IA)
  fill(base.queixa, "queixa_principal", extracao.queixa_principal);

  // Medicações em uso — texto unificado
  fill(base.queixa, "medicacoes_uso", extracao.medicacoes_uso);

  // Comorbidades fixas — checkboxes marcados pela IA
  const com = extracao.comorbidades_fixas;
  if (com && typeof com === "object") {
    const cur = base.queixa.comorbidades_fixas || {};
    for (const k of COMORBIDADES_FIXAS_KEYS) {
      if (cur[k] === undefined && typeof com[k] === "boolean") {
        cur[k] = com[k];
      }
    }
    base.queixa.comorbidades_fixas = cur;
  }

  // Resumo de exames (3ª passada IA)
  if (!base.resumo.texto && typeof extracao.resumo_exames === "string") {
    base.resumo.texto = extracao.resumo_exames;
  }

  return base;
}
