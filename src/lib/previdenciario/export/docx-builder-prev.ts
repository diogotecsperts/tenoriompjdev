/**
 * Builder DOCX do laudo previdenciário — espelha a identidade visual do
 * exportador trabalhista (timbrado, invocação ao juízo, numeração dinâmica)
 * com primitivas duplicadas localmente para garantir isolamento total.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  ImageRun,
  AlignmentType,
  BorderStyle,
  PageNumber,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  VerticalPositionAlign,
  TextWrappingType,
} from "docx";
import { saveAs } from "file-saver";
import { LaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { buildPrevBlocks, formatDateBR, sanitizeText, isEmpty } from "./prev-export-blocks";

// ========== CONSTANTES VISUAIS (espelhadas do trabalhista) ==========
const MM_TO_EMU = 36000;
const COLORS = {
  primary: "1B3665",
  secondary: "1F2937",
  text: "1F2937",
  muted: "4B5563",
};
const FONT = {
  name: "Arial",
  sizeDefault: 20,
  sizeTitle: 24,
  sizeSubtitle: 22,
  sizeSmall: 16,
};

// ========== IMAGENS ==========
const loadImageAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
};
const getImageDimensions = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });

// ========== PRIMITIVAS DE PARÁGRAFO ==========
function createSectionTitle(title: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: FONT.sizeTitle,
        color: COLORS.primary,
        font: FONT.name,
      }),
    ],
    spacing: { before: 300, after: 100 },
    border: {
      bottom: { color: COLORS.primary, size: 8, style: BorderStyle.SINGLE, space: 4 },
    },
  });
}

function createLabeledField(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        size: FONT.sizeDefault,
        color: COLORS.text,
        font: FONT.name,
      }),
      new TextRun({
        text: value,
        size: FONT.sizeDefault,
        color: COLORS.text,
        font: FONT.name,
      }),
    ],
    spacing: { after: 80 },
  });
}

function makeBodyParagraphs(text: string): Paragraph[] {
  const blocks = text.split("\n\n").filter((b) => b.trim().length > 0);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const runs: TextRun[] = [];
    lines.forEach((line, i) => {
      runs.push(
        new TextRun({
          text: line,
          size: FONT.sizeDefault,
          color: COLORS.text,
          font: FONT.name,
        }),
      );
      if (i < lines.length - 1) runs.push(new TextRun({ break: 1 }));
    });
    return new Paragraph({
      children: runs,
      alignment: AlignmentType.BOTH,
      spacing: { after: 120 },
    });
  });
}

// ========== MONTAGEM DA LINHA DE PERITO ==========
function buildPeritoIdLine(nomeRaw: string, crm: string): string | null {
  const nome = (nomeRaw || "").trim();
  const c = (crm || "").trim();
  if (!nome && !c) return null;
  const hasPrefix = /^dr[a]?\.?\s/i.test(nome);
  const nomeFmt = nome && !hasPrefix ? `Dr. ${nome}` : nome;
  let crmFmt = "";
  if (c) {
    const m1 = c.match(/^(\d+)\s*[\/\-]?\s*([A-Za-z]{2})$/);
    const m2 = !m1 ? c.match(/^([A-Za-z]{2})\s*[\/\-]?\s*(\d+)$/) : null;
    if (m1) crmFmt = `CRM/${m1[2].toUpperCase()} ${m1[1]}`;
    else if (m2) crmFmt = `CRM/${m2[1].toUpperCase()} ${m2[2]}`;
    else crmFmt = `CRM ${c}`;
  }
  return nomeFmt && crmFmt ? `${nomeFmt} \u2014 ${crmFmt}` : nomeFmt || crmFmt;
}

// ========== FUNÇÃO PRINCIPAL ==========
export async function generatePrevLaudoDOCX(laudo: LaudoPrev): Promise<void> {
  const l: any = laudo;
  const paragraphs: Paragraph[] = [];

  // ===== TIMBRADO =====
  const headerImageBuffer = await loadImageAsArrayBuffer("/timbrado-cabecalho.png");
  const footerImageBuffer = await loadImageAsArrayBuffer("/timbrado-rodape.png");

  let headerDimensions = { width: 595, height: 89 };
  let footerDimensions = { width: 595, height: 71 };
  try { headerDimensions = await getImageDimensions("/timbrado-cabecalho.png"); } catch {}
  try { footerDimensions = await getImageDimensions("/timbrado-rodape.png"); } catch {}

  // ===== INVOCAÇÃO AO JUÍZO =====
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA",
          bold: true,
          size: FONT.sizeSubtitle,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      spacing: { before: 400, after: 80 },
    }),
  );
  if (!isEmpty(l.processo_vara)) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: String(l.processo_vara).toUpperCase(),
            bold: true,
            size: FONT.sizeSubtitle,
            color: COLORS.text,
            font: FONT.name,
          }),
        ],
        spacing: { after: 300 },
      }),
    );
  }
  if (!isEmpty(l.processo_numero))
    paragraphs.push(createLabeledField("Processo nº", l.processo_numero));
  if (!isEmpty(l.reclamante))
    paragraphs.push(createLabeledField("Segurado(a)", l.reclamante));
  const requerido = !isEmpty(l.reclamada)
    ? l.reclamada
    : "INSTITUTO NACIONAL DO SEGURO SOCIAL — INSS";
  paragraphs.push(createLabeledField("Requerido(a)", requerido));

  const peritoLine = buildPeritoIdLine(l.perito_nome || "", l.perito_crm || "");
  if (peritoLine) paragraphs.push(createLabeledField("Perito Judicial", peritoLine));

  if (!isEmpty(l.data_pericia))
    paragraphs.push(createLabeledField("Data da perícia", formatDateBR(l.data_pericia)));
  if (!isEmpty(l.local_pericia))
    paragraphs.push(createLabeledField("Local da perícia", l.local_pericia));

  paragraphs.push(new Paragraph({ spacing: { after: 300 } }));

  // ===== TÍTULO DO LAUDO =====
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({
          text: "LAUDO PERICIAL MÉDICO — PERÍCIA PREVIDENCIÁRIA",
          bold: true,
          size: FONT.sizeTitle,
          color: COLORS.primary,
          font: FONT.name,
        }),
      ],
    }),
  );

  // ===== BLOCOS NUMERADOS DINAMICAMENTE =====
  const blocks = buildPrevBlocks(laudo);
  let sectionNumber = 1;
  for (const block of blocks) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. ${block.heading}`));
    for (const line of block.lines) {
      paragraphs.push(...makeBodyParagraphs(sanitizeText(line)));
    }
    sectionNumber++;
  }

  // ===== ASSINATURA =====
  if (peritoLine) {
    paragraphs.push(new Paragraph({ spacing: { before: 600 } }));
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "_______________________________________",
            size: FONT.sizeDefault,
            color: COLORS.text,
            font: FONT.name,
          }),
        ],
        spacing: { after: 80 },
      }),
    );
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: peritoLine,
            bold: true,
            size: FONT.sizeDefault,
            color: COLORS.text,
            font: FONT.name,
          }),
        ],
      }),
    );
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Perito Judicial",
            size: FONT.sizeDefault,
            color: COLORS.muted,
            font: FONT.name,
          }),
        ],
      }),
    );
  }

  // ===== HEADER/FOOTER IMAGENS (espelha trabalhista) =====
  const A4_WIDTH_PIXELS = 793;
  const FOOTER_SAFETY_MARGIN_MM = 12;
  const HEADER_WIDTH_RATIO = 0.924;
  const headerWidth = Math.round(A4_WIDTH_PIXELS * HEADER_WIDTH_RATIO);
  const headerHeight = Math.round(headerWidth * (headerDimensions.height / headerDimensions.width));
  const footerWidth = A4_WIDTH_PIXELS;
  const footerHeight = Math.round(footerWidth * (footerDimensions.height / footerDimensions.width));
  const footerHeightMm = Math.round(footerHeight * 0.265);
  const bottomMarginMm = footerHeightMm + FOOTER_SAFETY_MARGIN_MM;

  const headerContent: Paragraph[] = headerImageBuffer
    ? [
        new Paragraph({
          children: [
            new ImageRun({
              data: headerImageBuffer,
              transformation: { width: headerWidth, height: headerHeight },
              floating: {
                horizontalPosition: {
                  relative: HorizontalPositionRelativeFrom.PAGE,
                  offset: 8 * MM_TO_EMU,
                },
                verticalPosition: {
                  relative: VerticalPositionRelativeFrom.PAGE,
                  offset: 2 * MM_TO_EMU,
                },
                wrap: { type: TextWrappingType.NONE },
                behindDocument: false,
              },
              type: "png",
            }),
          ],
        }),
      ]
    : [];

  const footerContent: Paragraph[] = [];
  if (footerImageBuffer) {
    footerContent.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: footerImageBuffer,
            transformation: { width: footerWidth, height: footerHeight },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: 0,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                align: VerticalPositionAlign.BOTTOM,
              },
              wrap: { type: TextWrappingType.NONE },
              behindDocument: false,
            },
            type: "png",
          }),
        ],
      }),
    );
  }
  const pageNumberSpacingTwips = Math.round((footerHeightMm - 8) * 20 * 2);
  footerContent.push(
    new Paragraph({
      children: [
        new TextRun({
          children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
          size: FONT.sizeSmall,
          color: footerImageBuffer ? "FFFFFF" : COLORS.muted,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: pageNumberSpacingTwips },
    }),
  );

  const doc = new Document({
    compatibility: { doNotExpandShiftReturn: true },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: "45mm",
              bottom: `${bottomMarginMm}mm`,
              left: "20mm",
              right: "15mm",
              header: "0mm",
              footer: "0mm",
            },
          },
        },
        headers: { default: new Header({ children: headerContent }) },
        footers: { default: new Footer({ children: footerContent }) },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const proc = (l.processo_numero || "").replace(/[^0-9]/g, "") || "sem-numero";
  const segNome = (l.vitima_nome || l.reclamante || "segurado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  saveAs(blob, `laudo-previdenciario-${proc}-${segNome}.docx`);
}
