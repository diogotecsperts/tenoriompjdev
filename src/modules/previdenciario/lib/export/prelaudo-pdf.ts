/**
 * Export PDF do Pré-Laudo Previdenciário.
 * "Esqueleto" visual (banner topo + banner rodapé + fonte + margens + numeração)
 * idêntico ao módulo Trabalhista para manter a identidade do programa.
 * O conteúdo continua sendo os 10 steps do PrelaudoData.
 */
import { jsPDF } from "jspdf";
import type {
  PrelaudoData,
  CidItem,
  MedicacaoItem,
  StepId,
} from "../prelaudo-structure";
import { ALL_STEP_IDS } from "../prelaudo-structure";
import {
  COLORS,
  MARGINS,
  PAGE,
  HEADER_SAFETY_MARGIN,
  FOOTER_SAFETY_MARGIN,
  DEFAULT_LAYOUT,
  type PageLayout,
  loadImageAsBase64,
  getImageDimensions,
  buildPeritoIdLine,
  fmtDate,
  buildFilename,
  isFieldEmpty,
  stripLightMarkdown,
} from "./_shared";

// ---------- Layout dinâmico ----------
let pageLayout: PageLayout = { ...DEFAULT_LAYOUT };

const calculateDynamicLayout = async (
  headerB64: string | null,
  footerB64: string | null,
): Promise<PageLayout> => {
  let headerBottomY = DEFAULT_LAYOUT.headerBottomY;
  let footerTopY = DEFAULT_LAYOUT.footerTopY;
  if (headerB64) {
    try {
      const d = await getImageDimensions(headerB64);
      const aspect = d.height / d.width;
      const imgW = PAGE.width - 16;
      headerBottomY = 2 + imgW * aspect;
    } catch { /* fallback */ }
  }
  if (footerB64) {
    try {
      const d = await getImageDimensions(footerB64);
      const aspect = d.height / d.width;
      footerTopY = PAGE.height - PAGE.width * aspect;
    } catch { /* fallback */ }
  }
  return {
    headerBottomY,
    footerTopY,
    contentStartY: headerBottomY + HEADER_SAFETY_MARGIN,
    contentEndY: footerTopY - FOOTER_SAFETY_MARGIN,
  };
};

// ---------- Banner topo/rodapé (idêntico ao Trabalhista) ----------
const addHeaderToPages = async (doc: jsPDF, b64: string | null) => {
  if (!b64) return;
  let aspect = 0.15;
  try {
    const d = await getImageDimensions(b64);
    aspect = d.height / d.width;
  } catch { /* fallback */ }
  const imgW = PAGE.width - 16;
  const imgH = imgW * aspect;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    try { doc.addImage(b64, "PNG", 8, 2, imgW, imgH); } catch { /* ignore */ }
  }
};

const addFooterToPages = async (doc: jsPDF, b64: string | null) => {
  if (!b64) return;
  let aspect = 0.12;
  try {
    const d = await getImageDimensions(b64);
    aspect = d.height / d.width;
  } catch { /* fallback */ }
  const imgW = PAGE.width;
  const imgH = imgW * aspect;
  const yPos = PAGE.height - imgH;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    try {
      doc.addImage(b64, "PNG", 0, yPos, imgW, imgH);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
      doc.text(`Página ${i} de ${total}`, PAGE.width / 2, PAGE.height - 5, { align: "center" });
      doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    } catch { /* ignore */ }
  }
};

// ---------- Helpers de renderização ----------
const LINE = 5;
const SECTION_H = 12;
const SUBTITLE_H = 7;

const checkNewPage = (doc: jsPDF, y: number, needed = 10): number => {
  if (y + needed > pageLayout.contentEndY) {
    doc.addPage();
    return pageLayout.contentStartY;
  }
  return y;
};

const sectionTitle = (doc: jsPDF, n: number, title: string, y: number): number => {
  y = checkNewPage(doc, y, SECTION_H);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text(`${n}. ${title.toUpperCase()}`, MARGINS.left, y);
  doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setLineWidth(0.5);
  doc.line(MARGINS.left, y + 2, PAGE.width - MARGINS.right, y + 2);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + SECTION_H;
};

const subtitle = (doc: jsPDF, t: string, y: number): number => {
  y = checkNewPage(doc, y, SUBTITLE_H);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.text(t, MARGINS.left, y);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + SUBTITLE_H;
};

const paragraph = (doc: jsPDF, text: string, y: number): number => {
  if (isFieldEmpty(text)) return y;
  const clean = stripLightMarkdown(text);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  const lines = doc.splitTextToSize(clean, PAGE.contentWidth);
  for (const line of lines) {
    y = checkNewPage(doc, y, LINE);
    doc.text(line, MARGINS.left, y);
    y += LINE;
  }
  return y + 2;
};

const labeled = (doc: jsPDF, label: string, value: string, y: number): number => {
  if (isFieldEmpty(value)) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  const labelText = `${label}: `;
  const labelW = doc.getTextWidth(labelText) + 2;
  y = checkNewPage(doc, y, LINE);
  doc.text(labelText, MARGINS.left, y);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(stripLightMarkdown(value), PAGE.contentWidth - labelW);
  lines.forEach((ln: string, idx: number) => {
    if (idx === 0) {
      doc.text(ln, MARGINS.left + labelW, y);
    } else {
      y = checkNewPage(doc, y + LINE, LINE);
      doc.text(ln, MARGINS.left + labelW, y);
    }
  });
  return y + LINE + 1;
};

const hasAny = (obj: any) =>
  obj && Object.values(obj).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

const emptyNote = (doc: jsPDF, y: number): number => {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
  y = checkNewPage(doc, y, LINE);
  doc.text("— Não informado.", MARGINS.left, y);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + LINE + 2;
};

// ---------- Metadados públicos ----------
export interface PrelaudoPdfMeta {
  periciado: string;
  dataPericia: string;
  local?: string;
  numeroProcesso?: string;
  peritoNome?: string;
  peritoCRM?: string;
}

// ---------- Função principal ----------
export const generatePrelaudoPdf = async (
  data: PrelaudoData,
  meta: PrelaudoPdfMeta,
  includedSteps?: StepId[],
): Promise<jsPDF> => {
  const included = new Set<StepId>(includedSteps ?? ALL_STEP_IDS);
  let sectionNo = 0;
  const nextN = () => ++sectionNo;

  const doc = new jsPDF();

  const headerB64 = await loadImageAsBase64("/timbrado-cabecalho.png");
  const footerB64 = await loadImageAsBase64("/timbrado-rodape.png");
  pageLayout = await calculateDynamicLayout(headerB64, footerB64);

  let y = pageLayout.contentStartY;

  // Identificação do perito (topo direito da p.1)
  const peritoLine = buildPeritoIdLine({
    peritoNome: meta.peritoNome,
    peritoCRM: meta.peritoCRM,
  });
  if (peritoLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
    doc.text(peritoLine, PAGE.width - MARGINS.right, y, { align: "right" });
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    y += 6;
  }

  // Título do documento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text("PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO", PAGE.width / 2, y, { align: "center" });
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  y += 8;

  // Metadados do cabeçalho do documento
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (meta.local) { y = labeled(doc, "Local", meta.local, y); }
  if (meta.dataPericia) { y = labeled(doc, "Data da perícia", fmtDate(meta.dataPericia), y); }
  if (meta.numeroProcesso) { y = labeled(doc, "Nº do processo", meta.numeroProcesso, y); }
  y += 4;

  // ----- 1. Identificação -----
  if (included.has("identificacao")) {
    y = sectionTitle(doc, nextN(), "Identificação", y);
    const id = data.identificacao || {};
    if (!hasAny(id)) {
      y = emptyNote(doc, y);
    } else {
      y = labeled(doc, "Nome", id.nome || "", y);
      y = labeled(doc, "CPF", id.cpf || "", y);
      y = labeled(doc, "RG", id.rg || "", y);
      y = labeled(doc, "Data de nascimento", fmtDate(id.data_nascimento), y);
      y = labeled(doc, "Idade", id.idade || "", y);
      y = labeled(doc, "Sexo", id.sexo || "", y);
      y = labeled(doc, "Estado civil", id.estado_civil || "", y);
      y = labeled(doc, "Escolaridade", id.escolaridade || "", y);
      y = labeled(doc, "Profissão", id.profissao || "", y);
      y = labeled(doc, "Última atividade", id.ultima_atividade || "", y);
      y = labeled(doc, "Endereço", id.endereco || "", y);
      y = labeled(doc, "Telefone", id.telefone || "", y);
      if (id.numero_processo || id.vara || id.comarca || id.beneficio_pleiteado) {
        y += 2;
        y = subtitle(doc, "Dados do processo", y);
        y = labeled(doc, "Nº do processo", id.numero_processo || "", y);
        y = labeled(doc, "Vara", id.vara || "", y);
        y = labeled(doc, "Comarca", id.comarca || "", y);
        y = labeled(doc, "Benefício pleiteado", id.beneficio_pleiteado || "", y);
      }
    }
  }

  // ----- 2. Queixa -----
  if (included.has("queixa")) {
    y = sectionTitle(doc, nextN(), "Queixa principal", y);
    const q = data.queixa || {};
    if (!hasAny(q)) y = emptyNote(doc, y);
    else {
      if (q.queixa_principal) y = paragraph(doc, q.queixa_principal, y);
      y = labeled(doc, "Início dos sintomas", q.inicio_sintomas || "", y);
      y = labeled(doc, "Evolução", q.evolucao || "", y);
      y = labeled(doc, "Lateralidade", q.lateralidade || "", y);
      y = labeled(doc, "Fatores agravantes", q.fatores_agravantes || "", y);
    }
  }

  // ----- 3. Medicação -----
  if (included.has("medicacao")) {
    y = sectionTitle(doc, nextN(), "Medicação em uso", y);
    const itens = data.medicacao?.itens ?? [];
    if (itens.length === 0 && !data.medicacao?.observacoes) {
      y = emptyNote(doc, y);
    } else {
      itens.forEach((m: MedicacaoItem) => {
        const parts = [m.nome, m.dose, m.frequencia].filter(Boolean).join(" — ");
        const status = m.em_uso === false ? " (suspensa)" : "";
        y = paragraph(doc, `• ${parts}${status}`, y);
      });
      if (data.medicacao?.observacoes) {
        y = labeled(doc, "Observações", data.medicacao.observacoes, y);
      }
    }
  }

  // ----- 4. Acompanhamento -----
  if (included.has("acompanhamento")) {
    y = sectionTitle(doc, nextN(), "Acompanhamento médico", y);
    const a = data.acompanhamento || {};
    if (!hasAny(a)) y = emptyNote(doc, y);
    else {
      y = labeled(doc, "Faz acompanhamento", a.faz_acompanhamento === "sim" ? "Sim" : a.faz_acompanhamento === "nao" ? "Não" : "", y);
      y = labeled(doc, "Especialistas", a.especialistas || "", y);
      y = labeled(doc, "Frequência", a.frequencia || "", y);
      y = labeled(doc, "Última consulta", a.ultima_consulta || "", y);
      if (a.observacoes) y = labeled(doc, "Observações", a.observacoes, y);
    }
  }

  // ----- 5. Comorbidades -----
  if (included.has("comorbidades")) {
    y = sectionTitle(doc, nextN(), "Comorbidades", y);
    const c = data.comorbidades || {};
    if (!hasAny(c)) y = emptyNote(doc, y);
    else {
      if (c.lista && c.lista.length > 0) y = paragraph(doc, c.lista.join(" • "), y);
      if (c.texto) y = paragraph(doc, c.texto, y);
      y = labeled(doc, "Cirurgias prévias", c.cirurgias_previas || "", y);
      y = labeled(doc, "Internações", c.internacoes || "", y);
      y = labeled(doc, "Histórico familiar", c.historico_familiar || "", y);
    }
  }

  // ----- 6. Estado mental -----
  if (included.has("estado_mental")) {
    y = sectionTitle(doc, nextN(), "Estado mental", y);
    const em = data.estado_mental || {};
    if (!hasAny(em)) y = emptyNote(doc, y);
    else {
      y = labeled(doc, "Orientação", em.orientacao || "", y);
      y = labeled(doc, "Humor", em.humor || "", y);
      y = labeled(doc, "Afeto", em.afeto || "", y);
      y = labeled(doc, "Pensamento", em.pensamento || "", y);
      y = labeled(doc, "Memória", em.memoria || "", y);
      y = labeled(doc, "Atenção", em.atencao || "", y);
      y = labeled(doc, "Juízo e crítica", em.juizo_critica || "", y);
      if (em.observacoes) y = labeled(doc, "Observações", em.observacoes, y);
    }
  }

  // ----- 7. Ectoscopia -----
  if (included.has("ectoscopia")) {
    y = sectionTitle(doc, nextN(), "Ectoscopia / Exame geral", y);
    const ec = data.ectoscopia || {};
    if (!hasAny(ec)) y = emptyNote(doc, y);
    else {
      y = labeled(doc, "Estado geral", ec.estado_geral || "", y);
      y = labeled(doc, "Hidratação", ec.hidratacao || "", y);
      y = labeled(doc, "Corado", ec.corado || "", y);
      y = labeled(doc, "Acianótico", ec.acianotico || "", y);
      y = labeled(doc, "Anictérico", ec.anicterico || "", y);
      y = labeled(doc, "Marcha", ec.marcha || "", y);
      y = labeled(doc, "Postura", ec.postura || "", y);
      y = labeled(doc, "Peso", ec.peso || "", y);
      y = labeled(doc, "Altura", ec.altura || "", y);
      y = labeled(doc, "IMC", ec.imc || "", y);
      y = labeled(doc, "Pressão arterial", ec.pressao_arterial || "", y);
      if (ec.observacoes) y = labeled(doc, "Observações", ec.observacoes, y);
    }
  }

  // ----- 8. Ortopédico -----
  if (included.has("exame_ortopedico")) {
    y = sectionTitle(doc, nextN(), "Exame ortopédico", y);
    const ort = data.exame_ortopedico || {};
    if (!hasAny(ort)) y = emptyNote(doc, y);
    else {
      y = labeled(doc, "Segmento avaliado", ort.segmento_avaliado || "", y);
      y = labeled(doc, "Inspeção", ort.inspecao || "", y);
      y = labeled(doc, "Palpação", ort.palpacao || "", y);
      y = labeled(doc, "Amplitude de movimento", ort.amplitude_movimento || "", y);
      y = labeled(doc, "Força muscular", ort.forca_muscular || "", y);
      y = labeled(doc, "Reflexos", ort.reflexos || "", y);
      y = labeled(doc, "Testes especiais", ort.testes_especiais || "", y);
      y = labeled(doc, "Manobras", ort.manobras || "", y);
      if (ort.observacoes) y = labeled(doc, "Observações", ort.observacoes, y);
    }
  }

  // ----- 9. CID -----
  if (included.has("cid")) {
    y = sectionTitle(doc, nextN(), "CID-10", y);
    const cid = data.cid;
    if (!cid?.itens || cid.itens.length === 0) y = emptyNote(doc, y);
    else {
      cid.itens.forEach((it: CidItem) => {
        const prefix = it.principal ? "★ " : "• ";
        const desc = it.descricao ? ` — ${it.descricao}` : "";
        y = paragraph(doc, `${prefix}${it.codigo}${desc}`, y);
      });
      if (cid.observacoes) y = labeled(doc, "Observações", cid.observacoes, y);
    }
  }

  // ----- 10. Conclusão -----
  if (included.has("conclusao")) {
    y = sectionTitle(doc, nextN(), "Conclusão", y);
    const con = data.conclusao || {};
    if (!hasAny(con)) y = emptyNote(doc, y);
    else {
      if (con.diagnostico) y = labeled(doc, "Diagnóstico", con.diagnostico, y);
      const nexoMap: Record<string, string> = { sim: "Sim", nao: "Não", parcial: "Parcial" };
      y = labeled(doc, "Nexo causal", nexoMap[con.nexo_causal || ""] || "", y);
      if (con.nexo_justificativa) y = labeled(doc, "Justificativa do nexo", con.nexo_justificativa, y);
      const incMap: Record<string, string> = { total: "Total", parcial: "Parcial", ausente: "Ausente" };
      y = labeled(doc, "Incapacidade", incMap[con.incapacidade || ""] || "", y);
      const tempMap: Record<string, string> = { temporaria: "Temporária", permanente: "Permanente" };
      y = labeled(doc, "Temporalidade", tempMap[con.temporalidade || ""] || "", y);
      y = labeled(doc, "Data de início da incapacidade (DII)", fmtDate(con.data_inicio_incapacidade), y);
      y = labeled(doc, "Prazo para reavaliação", con.prazo_reavaliacao || "", y);
      y = labeled(doc, "Reabilitação indicada", con.reabilitacao_indicada === "sim" ? "Sim" : con.reabilitacao_indicada === "nao" ? "Não" : "", y);
      if (con.consideracoes_finais) y = labeled(doc, "Considerações finais", con.consideracoes_finais, y);
    }
  }

  // Assinatura
  y += 14;
  y = checkNewPage(doc, y, 25);
  doc.setDrawColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setLineWidth(0.3);
  const sigW = 80;
  const sigX = (PAGE.width - sigW) / 2;
  doc.line(sigX, y, sigX + sigW, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.text(meta.peritoNome || "Perito médico", PAGE.width / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
  doc.text("Médico Perito Judicial", PAGE.width / 2, y, { align: "center" });

  // Aplica banners em TODAS as páginas (igual ao Trabalhista)
  await addHeaderToPages(doc, headerB64);
  await addFooterToPages(doc, footerB64);

  return doc;
};

export const downloadPrelaudoPdf = async (
  data: PrelaudoData,
  meta: PrelaudoPdfMeta,
  includedSteps?: StepId[],
): Promise<void> => {
  const doc = await generatePrelaudoPdf(data, meta, includedSteps);
  doc.save(buildFilename("pdf", meta));
};
