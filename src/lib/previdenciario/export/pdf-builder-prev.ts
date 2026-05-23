/**
 * Builder PDF do laudo previdenciário — espelha a identidade visual do
 * exportador trabalhista (timbrado, invocação ao juízo, numeração dinâmica)
 * com primitivas duplicadas localmente para garantir isolamento total.
 */
import { jsPDF } from "jspdf";
import { LaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { buildPrevBlocks, formatDateBR, sanitizeText, isEmpty } from "./prev-export-blocks";

// ========== CONSTANTES (espelhadas do trabalhista) ==========
const COLORS = {
  primary: { r: 27, g: 54, b: 101 },
  secondary: { r: 31, g: 41, b: 55 },
  text: { r: 31, g: 41, b: 55 },
  muted: { r: 75, g: 85, b: 99 },
  white: { r: 255, g: 255, b: 255 },
};
const MARGINS = { left: 20, right: 15 };
const PAGE = { width: 210, height: 297, contentWidth: 175 };
const HEADER_SAFETY_MARGIN = 6;
const FOOTER_SAFETY_MARGIN = 12;
const SECTION_TITLE_HEIGHT = 12;
const LINE_HEIGHT = 5;
const PARAGRAPH_AFTER = 3;

interface PageLayout {
  contentStartY: number;
  contentEndY: number;
}
let pageLayout: PageLayout = {
  contentStartY: 51,
  contentEndY: 258,
};

// ========== IMAGENS ==========
const loadImageAsBase64 = (url: string): Promise<string | null> =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

const getImageDimensions = (b64: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = b64;
  });

async function calculateLayout(header: string | null, footer: string | null): Promise<PageLayout> {
  let headerBottomY = 45;
  let footerTopY = 270;
  if (header) {
    try {
      const d = await getImageDimensions(header);
      const w = PAGE.width - 16;
      headerBottomY = 2 + w * (d.height / d.width);
    } catch {}
  }
  if (footer) {
    try {
      const d = await getImageDimensions(footer);
      footerTopY = PAGE.height - PAGE.width * (d.height / d.width);
    } catch {}
  }
  return {
    contentStartY: headerBottomY + HEADER_SAFETY_MARGIN,
    contentEndY: footerTopY - FOOTER_SAFETY_MARGIN,
  };
}

async function paintHeaderOnAll(doc: jsPDF, b64: string | null) {
  if (!b64) return;
  let aspect = 0.15;
  try {
    const d = await getImageDimensions(b64);
    aspect = d.height / d.width;
  } catch {}
  const w = PAGE.width - 16;
  const h = w * aspect;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    try {
      doc.addImage(b64, "PNG", 8, 2, w, h);
    } catch {}
  }
}
async function paintFooterOnAll(doc: jsPDF, b64: string | null) {
  if (!b64) return;
  let aspect = 0.12;
  try {
    const d = await getImageDimensions(b64);
    aspect = d.height / d.width;
  } catch {}
  const w = PAGE.width;
  const h = w * aspect;
  const yPos = PAGE.height - h;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    try {
      doc.addImage(b64, "PNG", 0, yPos, w, h);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
      doc.text(`Página ${i} de ${total}`, PAGE.width / 2, PAGE.height - 5, { align: "center" });
      doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    } catch {}
  }
}

// ========== PRIMITIVAS DE TEXTO ==========
function checkNewPage(doc: jsPDF, y: number, need = 10): number {
  if (y + need > pageLayout.contentEndY) {
    doc.addPage();
    return pageLayout.contentStartY;
  }
  return y;
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = checkNewPage(doc, y, SECTION_TITLE_HEIGHT);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text(title.toUpperCase(), MARGINS.left, y);
  doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setLineWidth(0.5);
  doc.line(MARGINS.left, y + 2, PAGE.width - MARGINS.right, y + 2);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + SECTION_TITLE_HEIGHT;
}

function addParagraph(doc: jsPDF, text: string, y: number): number {
  if (!text) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const segments = text.split("\n");
  for (const seg of segments) {
    if (!seg.trim()) {
      y += 3;
      continue;
    }
    const lines = doc.splitTextToSize(seg, PAGE.contentWidth);
    lines.forEach((line: string, index: number) => {
      y = checkNewPage(doc, y, LINE_HEIGHT);
      const isLast = index === lines.length - 1;
      const trimmed = line.trim();
      if (isLast || doc.getTextWidth(trimmed) < PAGE.contentWidth * 0.7) {
        doc.text(trimmed, MARGINS.left, y);
      } else {
        const words = trimmed.split(/\s+/);
        if (words.length > 1) {
          let totalW = 0;
          words.forEach((w) => (totalW += doc.getTextWidth(w)));
          const gap = (PAGE.contentWidth - totalW) / (words.length - 1);
          let x = MARGINS.left;
          words.forEach((w, i) => {
            doc.text(w, x, y);
            if (i < words.length - 1) x += doc.getTextWidth(w) + gap;
          });
        } else {
          doc.text(trimmed, MARGINS.left, y);
        }
      }
      y += LINE_HEIGHT;
    });
  }
  return y + PARAGRAPH_AFTER;
}

function addLabeledField(doc: jsPDF, label: string, value: string, y: number): number {
  if (!value) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const labelText = `${label}: `;
  const labelWidth = doc.getTextWidth(labelText) + 2;
  y = checkNewPage(doc, y, LINE_HEIGHT * 2);
  doc.text(labelText, MARGINS.left, y);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(value, PAGE.contentWidth - labelWidth);
  lines.forEach((line: string, i: number) => {
    if (i === 0) doc.text(line, MARGINS.left + labelWidth, y);
    else {
      y = checkNewPage(doc, y + LINE_HEIGHT, LINE_HEIGHT);
      doc.text(line, MARGINS.left + labelWidth, y);
    }
  });
  return y + LINE_HEIGHT + PARAGRAPH_AFTER;
}

// ========== PERITO ==========
function buildPeritoIdLine(nomeRaw: string, crm: string): string | null {
  const nome = (nomeRaw || "").trim();
  const c = (crm || "").trim();
  if (!nome && !c) return null;
  let crmFmt = "";
  if (c) {
    const m1 = c.match(/^(\d+)\s*[\/\-]?\s*([A-Za-z]{2})$/);
    const m2 = !m1 ? c.match(/^([A-Za-z]{2})\s*[\/\-]?\s*(\d+)$/) : null;
    if (m1) crmFmt = `CRM/${m1[2].toUpperCase()} ${m1[1]}`;
    else if (m2) crmFmt = `CRM/${m2[1].toUpperCase()} ${m2[2]}`;
    else crmFmt = `CRM ${c}`;
  }
  const left = nome ? `Perito Judicial: Dr. ${nome.replace(/^dr[a]?\.?\s+/i, "")}` : "Perito Judicial";
  return crmFmt ? `${left} - ${crmFmt}` : left;
}

// ========== FUNÇÃO PRINCIPAL ==========
export async function generatePrevLaudoPDF(laudo: LaudoPrev): Promise<void> {
  const l: any = laudo;
  const doc = new jsPDF();

  const headerB64 = await loadImageAsBase64("/timbrado-cabecalho.png");
  const footerB64 = await loadImageAsBase64("/timbrado-rodape.png");
  pageLayout = await calculateLayout(headerB64, footerB64);

  let y = pageLayout.contentStartY;

  // ===== Identificação do perito (canto superior direito) =====
  const peritoIdLine = buildPeritoIdLine(l.perito_nome || "", l.perito_crm || "");
  if (peritoIdLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
    doc.text(peritoIdLine, PAGE.width - MARGINS.right, y, { align: "right" });
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    y += 6;
  }

  // ===== Invocação ao juízo =====
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA", MARGINS.left, y);
  y += 6;
  if (!isEmpty(l.processo_vara)) {
    doc.text(String(l.processo_vara).toUpperCase(), MARGINS.left, y);
    y += 12;
  } else {
    y += 6;
  }
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (!isEmpty(l.processo_numero)) y = addLabeledField(doc, "Processo nº", l.processo_numero, y);
  if (!isEmpty(l.reclamante)) y = addLabeledField(doc, "Segurado(a)", l.reclamante, y);
  const requerido = !isEmpty(l.reclamada)
    ? l.reclamada
    : "INSTITUTO NACIONAL DO SEGURO SOCIAL — INSS";
  y = addLabeledField(doc, "Requerido(a)", requerido, y);
  if (!isEmpty(l.data_pericia))
    y = addLabeledField(doc, "Data da perícia", formatDateBR(l.data_pericia), y);
  if (!isEmpty(l.local_pericia))
    y = addLabeledField(doc, "Local da perícia", l.local_pericia, y);
  y += 6;

  // ===== Título do laudo =====
  y = checkNewPage(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  const title = "LAUDO PERICIAL MÉDICO — PERÍCIA PREVIDENCIÁRIA";
  doc.text(title, PAGE.width / 2, y, { align: "center" });
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  y += 10;

  // ===== Blocos numerados dinamicamente =====
  const blocks = buildPrevBlocks(laudo);
  let sectionNumber = 1;
  for (const block of blocks) {
    y = addSectionTitle(doc, `${sectionNumber}. ${block.heading}`, y);
    for (const line of block.lines) {
      y = addParagraph(doc, sanitizeText(line), y);
    }
    sectionNumber++;
  }

  // ===== Assinatura =====
  if (peritoIdLine) {
    y = checkNewPage(doc, y + 20, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("_______________________________________", PAGE.width / 2, y, { align: "center" });
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(peritoIdLine.replace(/^Perito Judicial:\s*/i, ""), PAGE.width / 2, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "italic");
    doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
    doc.text("Perito Judicial", PAGE.width / 2, y, { align: "center" });
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  }

  // ===== Aplica timbrado em TODAS as páginas (após o conteúdo) =====
  await paintHeaderOnAll(doc, headerB64);
  await paintFooterOnAll(doc, footerB64);

  const proc = (l.processo_numero || "").replace(/[^0-9]/g, "") || "sem-numero";
  const segNome = (l.vitima_nome || l.reclamante || "segurado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  doc.save(`laudo-previdenciario-${proc}-${segNome}.pdf`);
}
