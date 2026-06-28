/**
 * Export PDF do Pré-Laudo Previdenciário — versão GUIA 23.06.
 * Texto corrido (sem títulos/subtítulos visíveis no corpo). O único título
 * que aparece é "PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO" no topo, seguido do
 * cabeçalho de Dados do processo.
 */
import { jsPDF } from "jspdf";
import type { PrelaudoData, StepId } from "../prelaudo-structure";
import {
  ALL_STEP_IDS,
  COMORBIDADES_FIXAS,
  ESTADO_CIVIL_OPCOES,
  ESCOLARIDADE_OPCOES,
  EXAME_FISICO_TEXTOS,
  INCAPACIDADE_LABEL,
} from "../prelaudo-structure";
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
  buildOptionRows,
  buildMultiOptionRows,
  type OptionRow,
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

const checkNewPage = (doc: jsPDF, y: number, needed = 10): number => {
  if (y + needed > pageLayout.contentEndY) {
    doc.addPage();
    return pageLayout.contentStartY;
  }
  return y;
};

const paragraph = (doc: jsPDF, text: string, y: number, opts?: { italic?: boolean }): number => {
  if (isFieldEmpty(text)) return y;
  const clean = stripLightMarkdown(text);
  doc.setFontSize(10);
  doc.setFont("helvetica", opts?.italic ? "italic" : "normal");
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

// ---------- Rich paragraph com runs coloridos (para comorbidades em vermelho) ----------
type Run = { text: string; color?: { r: number; g: number; b: number }; bold?: boolean };

const richParagraph = (doc: jsPDF, runs: Run[], y: number): number => {
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const tokens: Run[] = [];
  for (const r of runs) {
    const parts = r.text.split(/(\s+)/);
    for (const p of parts) if (p) tokens.push({ text: p, color: r.color, bold: r.bold });
  }
  let x = MARGINS.left;
  let lineWidth = 0;
  y = checkNewPage(doc, y, LINE);
  for (const tok of tokens) {
    doc.setFont("helvetica", tok.bold ? "bold" : "normal");
    const ww = doc.getTextWidth(tok.text);
    if (lineWidth + ww > PAGE.contentWidth && lineWidth > 0) {
      y += LINE;
      y = checkNewPage(doc, y, LINE);
      x = MARGINS.left;
      lineWidth = 0;
      if (/^\s+$/.test(tok.text)) continue;
    }
    const c = tok.color || COLORS.text;
    doc.setTextColor(c.r, c.g, c.b);
    doc.text(tok.text, x, y);
    x += ww;
    lineWidth += ww;
  }
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + LINE + 2;
};

// ---------- "Prova escolar": título + lista (X)/( ) vertical ----------
const optionsBlock = (doc: jsPDF, title: string, rows: OptionRow[], y: number): number => {
  // Título
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  y = checkNewPage(doc, y, LINE);
  doc.text(`${title}:`, MARGINS.left, y);
  y += LINE;
  // Linhas
  for (const r of rows) {
    y = checkNewPage(doc, y, LINE);
    const mark = r.marked ? "(X) " : "(  ) ";
    const c = r.marked ? COLORS.red : COLORS.text;
    doc.setFont("helvetica", r.marked ? "bold" : "normal");
    doc.setTextColor(c.r, c.g, c.b);
    const markW = doc.getTextWidth(mark);
    doc.text(mark, MARGINS.left + 4, y);
    // Quebra de linha para labels longos
    const labelLines = doc.splitTextToSize(r.label, PAGE.contentWidth - 4 - markW);
    labelLines.forEach((ln: string, idx: number) => {
      if (idx > 0) {
        y += LINE;
        y = checkNewPage(doc, y, LINE);
      }
      doc.text(ln, MARGINS.left + 4 + markW, y);
    });
    y += LINE;
  }
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  return y + 2;
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

  const doc = new jsPDF();

  const headerB64 = await loadImageAsBase64("/timbrado-cabecalho.png");
  const footerB64 = await loadImageAsBase64("/timbrado-rodape.png");
  pageLayout = await calculateDynamicLayout(headerB64, footerB64);

  let y = pageLayout.contentStartY;

  // Identificação do perito (topo direito)
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

  // Título único do documento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text("PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO", PAGE.width / 2, y, { align: "center" });
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  y += 8;

  // ----- Cabeçalho fixo: Dados do processo -----
  const id = data.identificacao || {};
  y = labeled(doc, "Nº do processo", id.numero_processo || meta.numeroProcesso || "", y);
  y = labeled(doc, "Vara", id.vara || "", y);
  y = labeled(doc, "Comarca", id.comarca || "", y);
  y = labeled(
    doc,
    "Data da perícia",
    fmtDate(id.data_pericia || meta.dataPericia) || "",
    y,
  );
  y = labeled(doc, "Benefício pleiteado", id.beneficio_pleiteado || "", y);
  if (meta.local) y = labeled(doc, "Local", meta.local, y);
  y += 4;

  // ============================================================
  // 1) Identificação
  // ============================================================
  if (included.has("identificacao")) {
    y = labeled(doc, "Nome", id.nome || "", y);
    y = labeled(doc, "CPF", id.cpf || "", y);
    y = labeled(doc, "RG", id.rg || "", y);
    y = labeled(doc, "Data de nascimento", fmtDate(id.data_nascimento), y);
    y = labeled(doc, "Idade", id.idade || "", y);
    y = labeled(doc, "Sexo", id.sexo || "", y);
    y = optionsBlock(
      doc,
      "Estado civil",
      buildOptionRows(ESTADO_CIVIL_OPCOES, id.estado_civil, id.estado_civil_outros),
      y,
    );
    y = optionsBlock(
      doc,
      "Escolaridade",
      buildOptionRows(ESCOLARIDADE_OPCOES, id.escolaridade, id.escolaridade_outros),
      y,
    );
    y = labeled(doc, "Profissão", id.profissao || "", y);
    y = labeled(doc, "Última atividade", id.ultima_atividade || "", y);
    y = labeled(doc, "Pessoas sob o mesmo teto", id.pessoas_mesmo_teto || "", y);
    y = labeled(doc, "Tempo sem trabalhar", id.tempo_sem_trabalhar || "", y);
    y += 2;
  }

  // ============================================================
  // 2) Queixa principal + medicações + comorbidades
  // ============================================================
  if (included.has("queixa")) {
    const q = data.queixa || {};
    if (q.queixa_principal) y = paragraph(doc, q.queixa_principal, y);
    // Medicações
    if (q.medicacoes_uso && q.medicacoes_uso.trim()) {
      y = paragraph(
        doc,
        `Para os sintomas referidos, informa uso contínuo de medicações: ${q.medicacoes_uso.trim()}`,
        y,
      );
    }
    // Parágrafo fixo
    y = paragraph(
      doc,
      "Relata acompanhamento médico e realização regular de fisioterapia.",
      y,
    );
    // Comorbidades — lista (X)/( ) com todas as opções, marcadas em vermelho
    y = optionsBlock(
      doc,
      "Informa demais comorbidades",
      buildMultiOptionRows(
        COMORBIDADES_FIXAS,
        (q.comorbidades_fixas || {}) as Record<string, boolean | undefined>,
        Array.isArray(q.comorbidades_extras) ? q.comorbidades_extras : [],
      ),
      y,
    );
    y += 2;
  }

  // ============================================================
  // 3) Exame físico (texto fixo + radios de incapacidade)
  // ============================================================
  if (included.has("exame_fisico")) {
    y = paragraph(doc, EXAME_FISICO_TEXTOS.estado_mental, y);
    y = paragraph(doc, EXAME_FISICO_TEXTOS.ectoscopia, y);
    y = paragraph(doc, EXAME_FISICO_TEXTOS.inspecao_dinamica, y);
    y = paragraph(doc, EXAME_FISICO_TEXTOS.complementacao, y);

    const ex = data.exame_fisico || {};
    const fh = INCAPACIDADE_LABEL[ex.incap_funcao_habitual ?? ""];
    const vi = INCAPACIDADE_LABEL[ex.incap_vida_independente ?? ""];
    if (fh) {
      y = paragraph(doc, `Apresenta, para a sua função habitual: ${fh}.`, y);
    }
    if (vi) {
      y = paragraph(doc, `Apresenta, para a vida independente: ${vi}.`, y);
    }
    y += 2;
  }

  // ============================================================
  // 4) Resumo (texto da IA, somente leitura)
  // ============================================================
  if (included.has("resumo")) {
    const resumo = (data.resumo?.texto || "").trim();
    if (resumo) {
      for (const block of resumo.split(/\n{2,}/)) {
        y = paragraph(doc, block.replace(/\n/g, " "), y);
      }
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
