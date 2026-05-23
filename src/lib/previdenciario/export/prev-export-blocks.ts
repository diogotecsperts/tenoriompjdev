/**
 * Helpers puros de formatação para exportação previdenciária.
 * Compliance:
 * - Zero "IA" / "Inteligência Artificial" / markdown no output.
 * - Bold no fonte → CAPS no destino (sem **).
 * - Omissão total de campos vazios.
 *
 * IMPORTANTE: Os headings retornados NÃO contêm numeração — a numeração
 * dinâmica (1, 2, 3…) é aplicada pelos builders DOCX/PDF apenas sobre os
 * blocos não-vazios efetivamente renderizados, garantindo sequência contínua.
 */

import { PrevData } from "@/lib/previdenciario/prev-data-defaults";
import { LaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { PREV_BIBLIOGRAPHIC_FALLBACK } from "./prev-references";

export function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/** Remove markdown e jargão proibido. */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/\binteligência artificial\b/gi, "análise técnica");
  s = s.replace(/\bIA\b/g, "análise técnica");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, (_, t) => String(t).toUpperCase());
  s = s.replace(/\*\*(.+?)\*\*/g, (_, t) => String(t).toUpperCase());
  s = s.replace(/__(.+?)__/g, (_, t) => String(t).toUpperCase());
  s = s.replace(/\*(.+?)\*/g, "$1");
  s = s.replace(/_(.+?)_/g, "$1");
  s = s.replace(/^\s*[-*]\s+/gm, "• ");
  return s.trim();
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const BENEFICIO_LABEL: Record<string, string> = {
  B31: "B31 — Auxílio por incapacidade temporária (auxílio-doença)",
  B32: "B32 — Aposentadoria por incapacidade permanente (invalidez)",
  B91: "B91 — Auxílio-doença acidentário",
  B92: "B92 — Aposentadoria por invalidez acidentária",
  BPC_LOAS: "BPC/LOAS — Benefício assistencial ao deficiente",
  isencao_IR: "Isenção de Imposto de Renda por doença grave",
  majoracao_25: "Majoração de 25% — necessidade de auxílio de terceiros",
};

const QUALIDADE_LABEL: Record<string, string> = {
  empregado: "Empregado (CLT)",
  contribuinte_individual: "Contribuinte individual",
  facultativo: "Facultativo",
  segurado_especial: "Segurado especial (rural)",
  desempregado_periodo_graca: "Desempregado / Período de graça",
};

const NEXO_LABEL: Record<string, string> = {
  comum: "Nexo comum (doença não ocupacional)",
  tecnico_NTEP: "Nexo Técnico Epidemiológico Previdenciário (NTEP)",
  profissional: "Nexo profissional / ocupacional",
  sem_nexo: "Ausência de nexo previdenciário",
};

const PARECER_LABEL: Record<string, string> = {
  apto: "Apto — sem incapacidade laboral",
  incapaz_temporario: "Incapaz temporariamente",
  incapaz_permanente_parcial: "Incapaz permanente — parcial",
  incapaz_permanente_total: "Incapaz permanente — total",
  inconclusivo: "Inconclusivo",
};

export function beneficioLabel(v: string) {
  return BENEFICIO_LABEL[v] ?? v;
}
export function qualidadeLabel(v: string) {
  return QUALIDADE_LABEL[v] ?? v;
}
export function nexoLabel(v: string) {
  return NEXO_LABEL[v] ?? v;
}
export function parecerLabel(v: string) {
  return PARECER_LABEL[v] ?? v;
}

export interface Block {
  heading: string; // SEM numeração — builder injeta o número dinâmico
  lines: string[]; // linhas já sanitizadas
}

/**
 * Constrói a sequência de blocos numeráveis do laudo previdenciário,
 * omitindo seções inteiras quando não houver conteúdo.
 *
 * Observação: o bloco de identificação processual (vara, processo, segurado,
 * INSS, perito) NÃO faz parte desta lista — é renderizado separadamente
 * pelos builders como invocação ao juízo, antes da seção 1.
 */
export function buildPrevBlocks(laudo: LaudoPrev): Block[] {
  const l: any = laudo;
  const pd: PrevData = laudo.prev_data;
  const blocks: Block[] = [];

  // 1. Dados do Segurado
  const segLines: string[] = [];
  if (!isEmpty(l.vitima_nome)) segLines.push(`Nome: ${l.vitima_nome}`);
  if (!isEmpty(l.vitima_nascimento))
    segLines.push(`Nascimento: ${formatDateBR(l.vitima_nascimento)}`);
  if (!isEmpty(pd.segurado.cpf)) segLines.push(`CPF: ${pd.segurado.cpf}`);
  if (!isEmpty(pd.segurado.rg)) segLines.push(`RG: ${pd.segurado.rg}`);
  if (!isEmpty(pd.segurado.nit_pis)) segLines.push(`NIT/PIS: ${pd.segurado.nit_pis}`);
  if (!isEmpty(pd.segurado.estado_civil))
    segLines.push(`Estado civil: ${pd.segurado.estado_civil}`);
  if (!isEmpty(l.vitima_profissao))
    segLines.push(`Profissão: ${l.vitima_profissao}`);
  if (!isEmpty(l.vitima_escolaridade))
    segLines.push(`Escolaridade: ${l.vitima_escolaridade}`);
  if (!isEmpty(pd.segurado.endereco))
    segLines.push(`Endereço: ${pd.segurado.endereco}`);
  if (!isEmpty(pd.segurado.qualidade_segurado))
    segLines.push(`Qualidade de segurado: ${qualidadeLabel(pd.segurado.qualidade_segurado)}`);
  if (!isEmpty(pd.segurado.ultima_atividade))
    segLines.push(`Última atividade: ${pd.segurado.ultima_atividade}`);
  if (!isEmpty(pd.segurado.data_ultima_contribuicao))
    segLines.push(
      `Data da última contribuição: ${formatDateBR(pd.segurado.data_ultima_contribuicao)}`,
    );
  if (segLines.length) blocks.push({ heading: "Dados do Segurado", lines: segLines });

  // 2. Benefício Pleiteado
  const benLines: string[] = [];
  if (!isEmpty(pd.beneficio.tipo))
    benLines.push(`Espécie: ${beneficioLabel(pd.beneficio.tipo)}`);
  if (!isEmpty(pd.beneficio.nb_numero)) benLines.push(`NB: ${pd.beneficio.nb_numero}`);
  if (!isEmpty(pd.beneficio.der)) benLines.push(`DER: ${formatDateBR(pd.beneficio.der)}`);
  if (!isEmpty(pd.beneficio.dib)) benLines.push(`DIB: ${formatDateBR(pd.beneficio.dib)}`);
  if (!isEmpty(pd.beneficio.dcb)) benLines.push(`DCB: ${formatDateBR(pd.beneficio.dcb)}`);
  if (!isEmpty(pd.beneficio.motivo_cessacao))
    benLines.push(`Motivo da cessação: ${pd.beneficio.motivo_cessacao}`);
  if (benLines.length) blocks.push({ heading: "Benefício Pleiteado", lines: benLines });

  // 3. Objetivo
  if (!isEmpty(l.objetivo_pericia))
    blocks.push({
      heading: "Objetivo da Perícia",
      lines: [sanitizeText(l.objetivo_pericia)],
    });

  // 4. Metodologia
  if (!isEmpty(l.metodologia_pericial))
    blocks.push({
      heading: "Metodologia Pericial",
      lines: [sanitizeText(l.metodologia_pericial)],
    });

  // 5. Documentos
  if (Array.isArray(l.documentos) && l.documentos.length > 0)
    blocks.push({
      heading: "Documentos Avaliados",
      lines: l.documentos.map((d: string) => `• ${sanitizeText(d)}`),
    });

  // 6. Resumos
  const resLines: string[] = [];
  if (!isEmpty(l.resumo_peticao_inicial))
    resLines.push(`PETIÇÃO INICIAL:\n${sanitizeText(l.resumo_peticao_inicial)}`);
  if (!isEmpty(l.resumo_contestacao))
    resLines.push(`CONTESTAÇÃO / INSS:\n${sanitizeText(l.resumo_contestacao)}`);
  if (resLines.length)
    blocks.push({ heading: "Resumo Administrativo / Processual", lines: resLines });

  // 7. História Clínica
  const histClinLines: string[] = [];
  if (!isEmpty(pd.historia_clinica_prev))
    histClinLines.push(sanitizeText(pd.historia_clinica_prev));
  if (!isEmpty(l.historia_atual))
    histClinLines.push(`HISTÓRIA DA DOENÇA ATUAL:\n${sanitizeText(l.historia_atual)}`);
  if (!isEmpty(l.antecedentes))
    histClinLines.push(`ANTECEDENTES PATOLÓGICOS:\n${sanitizeText(l.antecedentes)}`);
  if (!isEmpty(l.tratamentos))
    histClinLines.push(`TRATAMENTOS:\n${sanitizeText(l.tratamentos)}`);
  if (!isEmpty(l.afastamentos))
    histClinLines.push(`AFASTAMENTOS:\n${sanitizeText(l.afastamentos)}`);
  if (histClinLines.length)
    blocks.push({ heading: "História Clínica", lines: histClinLines });

  // 8. História Laboral
  const histLabLines: string[] = [];
  if (!isEmpty(pd.historia_laboral_prev))
    histLabLines.push(sanitizeText(pd.historia_laboral_prev));
  if (!isEmpty(l.historico_ocupacional))
    histLabLines.push(sanitizeText(l.historico_ocupacional));
  if (histLabLines.length)
    blocks.push({ heading: "História Laboral", lines: histLabLines });

  // 9. Exame Pericial
  const exameLines: string[] = [];
  if (!isEmpty(l.exame_fisico))
    exameLines.push(`EXAME FÍSICO:\n${sanitizeText(l.exame_fisico)}`);
  if (!isEmpty(l.laudos_medicos))
    exameLines.push(`LAUDOS MÉDICOS:\n${sanitizeText(l.laudos_medicos)}`);
  if (!isEmpty(l.exames_complementares))
    exameLines.push(`EXAMES COMPLEMENTARES:\n${sanitizeText(l.exames_complementares)}`);
  if (exameLines.length)
    blocks.push({ heading: "Exame Pericial", lines: exameLines });

  // 10. Diagnóstico
  const cidLines: string[] = [];
  const cidsArr: any[] = Array.isArray(l.cids_selecionados) ? l.cids_selecionados : [];
  cidsArr.forEach((c) => {
    if (c?.codigo) cidLines.push(`• ${c.codigo} — ${c.descricao || ""}`.trim());
  });
  // Preferir o campo isolado previdenciário; cair no legado se vazio.
  const descTec = !isEmpty(pd.cids_descricao_tecnica)
    ? pd.cids_descricao_tecnica
    : (l.descricao_tecnica_doencas || "");
  if (!isEmpty(descTec))
    cidLines.push(`\n${sanitizeText(descTec)}`);
  if (cidLines.length)
    blocks.push({ heading: "Diagnóstico (CID-10)", lines: cidLines });

  // 11. Análise da Incapacidade
  const inc = pd.incapacidade;
  const incLines: string[] = [];
  if (!isEmpty(inc.existe)) incLines.push(`Existe incapacidade: ${inc.existe}`);
  if (!isEmpty(inc.tipo)) incLines.push(`Tipo: ${inc.tipo}`);
  if (!isEmpty(inc.grau)) incLines.push(`Grau: ${inc.grau}`);
  if (!isEmpty(inc.abrangencia)) incLines.push(`Abrangência: ${inc.abrangencia}`);
  if (!isEmpty(inc.dii)) incLines.push(`DII: ${formatDateBR(inc.dii)}`);
  if (!isEmpty(inc.data_recuperacao_estimada))
    incLines.push(
      `Data estimada de recuperação: ${formatDateBR(inc.data_recuperacao_estimada)}`,
    );
  if (!isEmpty(inc.susceptivel_reabilitacao))
    incLines.push(`Suscetível à reabilitação: ${inc.susceptivel_reabilitacao}`);
  if (!isEmpty(inc.necessita_auxilio_terceiros))
    incLines.push(`Necessita auxílio de terceiros: ${inc.necessita_auxilio_terceiros}`);
  if (!isEmpty(inc.dii_justificativa))
    incLines.push(`\nJUSTIFICATIVA DA DII:\n${sanitizeText(inc.dii_justificativa)}`);
  if (!isEmpty(inc.justificativa))
    incLines.push(`\nJUSTIFICATIVA GERAL:\n${sanitizeText(inc.justificativa)}`);
  if (incLines.length)
    blocks.push({ heading: "Análise da Incapacidade", lines: incLines });

  // 12. Nexo Previdenciário
  const nxLines: string[] = [];
  if (!isEmpty(pd.nexo.tipo)) nxLines.push(`Tipo de nexo: ${nexoLabel(pd.nexo.tipo)}`);
  if (!isEmpty(pd.nexo.justificativa))
    nxLines.push(`\n${sanitizeText(pd.nexo.justificativa)}`);
  if (nxLines.length) blocks.push({ heading: "Nexo Previdenciário", lines: nxLines });

  // 13. Enquadramento Legal
  const enqLines: string[] = [];
  if (pd.enquadramento.leis_aplicaveis.length > 0) {
    enqLines.push("Dispositivos legais aplicáveis:");
    pd.enquadramento.leis_aplicaveis.forEach((lei) => enqLines.push(`• ${lei}`));
  }
  if (!isEmpty(pd.enquadramento.fundamentacao))
    enqLines.push(`\n${sanitizeText(pd.enquadramento.fundamentacao)}`);
  if (enqLines.length)
    blocks.push({ heading: "Enquadramento Legal", lines: enqLines });

  // 14. Conclusão
  const conc = pd.conclusao_prev;
  const concLines: string[] = [];
  if (!isEmpty(conc.parecer)) concLines.push(`Parecer: ${parecerLabel(conc.parecer)}`);
  if (!isEmpty(conc.beneficio_recomendado))
    concLines.push(`Benefício recomendado: ${conc.beneficio_recomendado}`);
  if (!isEmpty(conc.texto_final))
    concLines.push(`\n${sanitizeText(conc.texto_final)}`);
  if (concLines.length)
    blocks.push({ heading: "Conclusão Previdenciária", lines: concLines });

  // 15. Quesitos
  const ques: string[] = [];
  if (!isEmpty(l.quesitos_juizo))
    ques.push(`QUESITOS DO JUÍZO:\n${sanitizeText(l.quesitos_juizo)}`);
  if (!isEmpty(l.quesitos_reclamante))
    ques.push(`\nQUESITOS DO AUTOR:\n${sanitizeText(l.quesitos_reclamante)}`);
  if (!isEmpty(l.quesitos_reclamada))
    ques.push(`\nQUESITOS DO INSS / PARTE RÉ:\n${sanitizeText(l.quesitos_reclamada)}`);
  if (ques.length) blocks.push({ heading: "Quesitos", lines: ques });

  // 16. Honorários
  if (!isEmpty(l.valor_honorarios) && Number(l.valor_honorarios) > 0)
    blocks.push({
      heading: "Honorários Periciais",
      lines: [`Valor arbitrado: R$ ${Number(l.valor_honorarios).toFixed(2).replace(".", ",")}`],
    });

  // 17. Referências Bibliográficas (com fallback previdenciário)
  if (!isEmpty(l.referencias_bibliograficas)) {
    blocks.push({
      heading: "Referências Bibliográficas",
      lines: [sanitizeText(l.referencias_bibliograficas)],
    });
  } else {
    blocks.push({
      heading: "Referências Bibliográficas",
      lines: PREV_BIBLIOGRAPHIC_FALLBACK.map((r) => `• ${r}`),
    });
  }

  return blocks;
}
