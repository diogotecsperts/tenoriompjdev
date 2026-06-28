/**
 * Export DOCX do Pré-Laudo Previdenciário — versão GUIA 23.06.
 * Texto corrido (sem títulos/subtítulos no corpo). Único título: "PRÉ-LAUDO
 * PERICIAL PREVIDENCIÁRIO" no topo, seguido do cabeçalho de Dados do processo.
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
  PageNumber,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  VerticalPositionAlign,
  TextWrappingType,
} from "docx";
import { saveAs } from "file-saver";
import type { PrelaudoData, StepId } from "../prelaudo-structure";
import {
  ALL_STEP_IDS,
  COMORBIDADES_FIXAS,
  COMORBIDADES_FIXAS_KEYS,
  EXAME_FISICO_TEXTOS,
  INCAPACIDADE_LABEL,
} from "../prelaudo-structure";
import {
  COLORS_HEX,
  FONT,
  MM_TO_EMU,
  loadImageAsArrayBuffer,
  getImageDimensions,
  buildPeritoIdLine,
  fmtDate,
  buildFilename,
  isFieldEmpty,
  stripLightMarkdown,
  resolveEnumValue,
} from "./_shared";

// ---------- builders ----------
const baseRun = (text: string, opts?: { bold?: boolean; italic?: boolean; color?: string }) =>
  new TextRun({
    text,
    bold: opts?.bold,
    italics: opts?.italic,
    size: FONT.sizeDefault,
    color: opts?.color || COLORS_HEX.text,
    font: FONT.name,
  });

const labeled = (label: string, value: string): Paragraph | null => {
  if (isFieldEmpty(value)) return null;
  return new Paragraph({
    children: [
      baseRun(`${label}: `, { bold: true }),
      baseRun(stripLightMarkdown(value)),
    ],
    spacing: { after: 80 },
  });
};

const paragraph = (text: string, opts?: { italic?: boolean }): Paragraph | null => {
  if (isFieldEmpty(text)) return null;
  return new Paragraph({
    children: [baseRun(stripLightMarkdown(text), { italic: opts?.italic })],
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
  });
};

// Frase de comorbidades com runs em vermelho para as marcadas
const comorbidadesParagraph = (queixa: any): Paragraph => {
  const fixas = queixa?.comorbidades_fixas || {};
  const extras: { marcado: boolean; texto: string }[] = Array.isArray(
    queixa?.comorbidades_extras,
  )
    ? queixa.comorbidades_extras
    : [];
  const marcadas: string[] = [];
  for (const k of COMORBIDADES_FIXAS_KEYS) {
    if (fixas[k]) {
      const def = COMORBIDADES_FIXAS.find((c) => c.key === k)!;
      marcadas.push(def.label);
    }
  }
  for (const e of extras) {
    if (e.marcado && e.texto?.trim()) marcadas.push(e.texto.trim());
  }
  const children: TextRun[] = [baseRun("Informa demais comorbidades: ")];
  if (marcadas.length === 0) {
    children.push(baseRun("nenhuma referida."));
  } else {
    marcadas.forEach((m, i) => {
      children.push(baseRun(m, { color: COLORS_HEX.red }));
      if (i < marcadas.length - 1) children.push(baseRun(", "));
    });
    children.push(baseRun("."));
  }
  return new Paragraph({
    children,
    spacing: { after: 140 },
    alignment: AlignmentType.JUSTIFIED,
  });
};

// ---------- Metadados ----------
export interface PrelaudoDocxMeta {
  periciado: string;
  dataPericia: string;
  local?: string;
  numeroProcesso?: string;
  peritoNome?: string;
  peritoCRM?: string;
}

// ---------- Função principal ----------
export const generatePrelaudoDocx = async (
  data: PrelaudoData,
  meta: PrelaudoDocxMeta,
  includedSteps?: StepId[],
): Promise<Blob> => {
  const included = new Set<StepId>(includedSteps ?? ALL_STEP_IDS);
  const id = data.identificacao || {};
  const paragraphs: Paragraph[] = [];

  // Título único
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO",
          bold: true,
          size: 28,
          color: COLORS_HEX.primary,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
    }),
  );

  // ----- Cabeçalho fixo: Dados do processo -----
  const peritoLine = buildPeritoIdLine({
    peritoNome: meta.peritoNome,
    peritoCRM: meta.peritoCRM,
  });
  [
    labeled("Nº do processo", id.numero_processo || meta.numeroProcesso || ""),
    labeled("Vara", id.vara || ""),
    labeled("Comarca", id.comarca || ""),
    labeled("Data da perícia", fmtDate(id.data_pericia || meta.dataPericia)),
    labeled("Benefício pleiteado", id.beneficio_pleiteado || ""),
    labeled("Local", meta.local || ""),
    peritoLine ? labeled("Identificação", peritoLine) : null,
  ].forEach((p) => p && paragraphs.push(p));
  paragraphs.push(new Paragraph({ spacing: { after: 160 } }));

  // ===== 1) Identificação =====
  if (included.has("identificacao")) {
    [
      labeled("Nome", id.nome || ""),
      labeled("CPF", id.cpf || ""),
      labeled("RG", id.rg || ""),
      labeled("Data de nascimento", fmtDate(id.data_nascimento)),
      labeled("Idade", id.idade || ""),
      labeled("Sexo", id.sexo || ""),
      labeled("Estado civil", resolveEnumValue(id.estado_civil, id.estado_civil_outros)),
      labeled("Escolaridade", resolveEnumValue(id.escolaridade, id.escolaridade_outros)),
      labeled("Profissão", id.profissao || ""),
      labeled("Última atividade", id.ultima_atividade || ""),
      labeled("Pessoas sob o mesmo teto", id.pessoas_mesmo_teto || ""),
      labeled("Tempo sem trabalhar", id.tempo_sem_trabalhar || ""),
    ].forEach((p) => p && paragraphs.push(p));
    paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
  }

  // ===== 2) Queixa principal + medicações + comorbidades =====
  if (included.has("queixa")) {
    const q = data.queixa || {};
    const queixaPar = paragraph(q.queixa_principal || "");
    if (queixaPar) paragraphs.push(queixaPar);

    if (q.medicacoes_uso && q.medicacoes_uso.trim()) {
      const medPar = paragraph(
        `Para os sintomas referidos, informa uso contínuo de medicações: ${q.medicacoes_uso.trim()}`,
      );
      if (medPar) paragraphs.push(medPar);
    }

    const fixedPar = paragraph(
      "Relata acompanhamento médico e realização regular de fisioterapia.",
    );
    if (fixedPar) paragraphs.push(fixedPar);

    paragraphs.push(comorbidadesParagraph(q));
  }

  // ===== 3) Exame físico (fixo + incapacidades) =====
  if (included.has("exame_fisico")) {
    [
      paragraph(EXAME_FISICO_TEXTOS.estado_mental),
      paragraph(EXAME_FISICO_TEXTOS.ectoscopia),
      paragraph(EXAME_FISICO_TEXTOS.inspecao_dinamica),
      paragraph(EXAME_FISICO_TEXTOS.complementacao),
    ].forEach((p) => p && paragraphs.push(p));

    const ex = data.exame_fisico || {};
    const fh = INCAPACIDADE_LABEL[ex.incap_funcao_habitual ?? ""];
    const vi = INCAPACIDADE_LABEL[ex.incap_vida_independente ?? ""];
    if (fh) {
      const p = paragraph(`Apresenta, para a sua função habitual: ${fh}.`);
      if (p) paragraphs.push(p);
    }
    if (vi) {
      const p = paragraph(`Apresenta, para a vida independente: ${vi}.`);
      if (p) paragraphs.push(p);
    }
  }

  // ===== 4) Resumo (texto fixo gerado pela IA) =====
  if (included.has("resumo")) {
    const resumo = (data.resumo?.texto || "").trim();
    if (resumo) {
      for (const block of resumo.split(/\n{2,}/)) {
        const p = paragraph(block.replace(/\n/g, " "));
        if (p) paragraphs.push(p);
      }
    }
  }

  // ----- Assinatura -----
  paragraphs.push(new Paragraph({ spacing: { before: 600 } }));
  paragraphs.push(
    new Paragraph({
      children: [baseRun("________________________________________")],
      alignment: AlignmentType.CENTER,
    }),
  );
  paragraphs.push(
    new Paragraph({
      children: [baseRun(meta.peritoNome || "Perito médico", { bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 80 },
    }),
  );
  paragraphs.push(
    new Paragraph({
      children: [baseRun("Médico Perito Judicial", { italic: true, color: COLORS_HEX.muted })],
      alignment: AlignmentType.CENTER,
    }),
  );

  // ========== Banner topo/rodapé ==========
  const headerBuffer = await loadImageAsArrayBuffer("/timbrado-cabecalho.png");
  const footerBuffer = await loadImageAsArrayBuffer("/timbrado-rodape.png");
  let headerDimensions = { width: 595, height: 89 };
  let footerDimensions = { width: 595, height: 71 };
  try { headerDimensions = await getImageDimensions("/timbrado-cabecalho.png"); } catch { /* fallback */ }
  try { footerDimensions = await getImageDimensions("/timbrado-rodape.png"); } catch { /* fallback */ }

  const A4_WIDTH_PIXELS = 793;
  const FOOTER_SAFETY_MARGIN_MM = 12;
  const HEADER_WIDTH_RATIO = 0.924;
  const headerWidth = Math.round(A4_WIDTH_PIXELS * HEADER_WIDTH_RATIO);
  const headerHeight = Math.round(headerWidth * (headerDimensions.height / headerDimensions.width));
  const footerWidth = A4_WIDTH_PIXELS;
  const footerHeight = Math.round(footerWidth * (footerDimensions.height / footerDimensions.width));
  const footerHeightMm = Math.round(footerHeight * 0.265);
  const bottomMarginMm = footerHeightMm + FOOTER_SAFETY_MARGIN_MM;

  const headerContent: Paragraph[] = [];
  if (headerBuffer) {
    headerContent.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: headerBuffer,
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
    );
  }

  const footerContent: Paragraph[] = [];
  if (footerBuffer) {
    footerContent.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: footerBuffer,
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
          color: "FFFFFF",
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

  return await Packer.toBlob(doc);
};

export const downloadPrelaudoDocx = async (
  data: PrelaudoData,
  meta: PrelaudoDocxMeta,
  includedSteps?: StepId[],
): Promise<void> => {
  const blob = await generatePrelaudoDocx(data, meta, includedSteps);
  saveAs(blob, buildFilename("docx", meta));
};
