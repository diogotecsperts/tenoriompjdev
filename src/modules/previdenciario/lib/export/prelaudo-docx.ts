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
  ESTADO_CIVIL_OPCOES,
  ESCOLARIDADE_OPCOES,
  EXAME_FISICO_TEXTOS,
  INCAPACIDADE_LABEL,
  INCAPACIDADE_OPCOES,
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
  buildOptionRows,
  buildMultiOptionRows,
  type OptionRow,
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

// Título de seção discreto: mesmo tamanho do corpo, apenas negrito.
const sectionTitle = (text: string): Paragraph =>
  new Paragraph({
    children: [baseRun(text, { bold: true })],
    spacing: { before: 120, after: 80 },
  });

// "Prova escolar": título + lista vertical de opções. Marcadas em vermelho/negrito.
// Quando showMarkers = false, omite os prefixos "(X)" / "(  )" (usado em comorbidades).
const optionsBlock = (
  title: string,
  rows: OptionRow[],
  opts?: { showMarkers?: boolean },
): Paragraph[] => {
  const showMarkers = opts?.showMarkers !== false;
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      children: [baseRun(`${title}:`, { bold: true })],
      spacing: { before: 60, after: 60 },
    }),
  );
  for (const r of rows) {
    const children = showMarkers
      ? [
          baseRun(`${r.marked ? "(X)" : "(  )"} `, {
            bold: r.marked,
            color: r.marked ? COLORS_HEX.red : undefined,
          }),
          baseRun(r.label, {
            bold: r.marked,
            color: r.marked ? COLORS_HEX.red : undefined,
          }),
        ]
      : [
          baseRun(r.label, {
            bold: r.marked,
            color: r.marked ? COLORS_HEX.red : undefined,
          }),
        ];
    out.push(
      new Paragraph({
        children,
        spacing: { after: 40 },
        indent: { left: 200 },
      }),
    );
  }
  return out;
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
    ].forEach((p) => p && paragraphs.push(p));

    // Estado civil — lista (X)/( ) com todas as opções
    optionsBlock(
      "Estado civil",
      buildOptionRows(ESTADO_CIVIL_OPCOES, id.estado_civil, id.estado_civil_outros),
    ).forEach((p) => paragraphs.push(p));

    // Escolaridade — lista (X)/( ) com todas as opções
    optionsBlock(
      "Escolaridade",
      buildOptionRows(ESCOLARIDADE_OPCOES, id.escolaridade, id.escolaridade_outros),
    ).forEach((p) => paragraphs.push(p));

    [
      labeled("Profissão", id.profissao || ""),
      labeled("Última atividade", id.ultima_atividade || ""),
      labeled("Pessoas sob o mesmo teto", id.pessoas_mesmo_teto || ""),
    ].forEach((p) => p && paragraphs.push(p));

    paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
  }

  // ===== 2) Queixa principal + medicações + comorbidades =====
  if (included.has("queixa")) {
    const q = data.queixa || {};

    // "Tempo que está sem trabalhar" — sempre visível, mesmo vazio
    paragraphs.push(
      new Paragraph({
        children: [
          baseRun("Tempo que está sem trabalhar: ", { bold: true }),
          baseRun(stripLightMarkdown(id.tempo_sem_trabalhar || "")),
        ],
        spacing: { after: 120 },
      }),
    );

    // Título "Queixa principal" + parágrafo em branco antes do texto
    paragraphs.push(sectionTitle("Queixa principal"));
    paragraphs.push(new Paragraph({ spacing: { after: 80 } }));

    const queixaPar = paragraph(q.queixa_principal || "");
    if (queixaPar) paragraphs.push(queixaPar);

    // Prefixo FIXO das medicações (sempre presente) + conteúdo dinâmico
    const medRaw = (q.medicacoes_uso || "").trim();
    const medText = medRaw
      ? `Para os sintomas referidos, informa uso contínuo de medicações: ${medRaw}`
      : `Para os sintomas referidos, informa uso contínuo de medicações:`;
    const medPar = new Paragraph({
      children: [baseRun(stripLightMarkdown(medText))],
      spacing: { after: 120 },
      alignment: AlignmentType.JUSTIFIED,
    });
    paragraphs.push(medPar);
    paragraphs.push(new Paragraph({ spacing: { after: 80 } }));

    const fixedPar = paragraph(
      "Relata acompanhamento médico e realização regular de fisioterapia.",
    );
    if (fixedPar) paragraphs.push(fixedPar);

    // Comorbidades: SEM parênteses, mantendo grifo em vermelho/negrito
    optionsBlock(
      "Informa demais comorbidades",
      buildMultiOptionRows(
        COMORBIDADES_FIXAS,
        (q.comorbidades_fixas || {}) as Record<string, boolean | undefined>,
        Array.isArray(q.comorbidades_extras) ? q.comorbidades_extras : [],
      ),
      { showMarkers: false },
    ).forEach((p) => paragraphs.push(p));
  }

  // ===== 3) Exame físico (fixo + incapacidades) =====
  if (included.has("exame_fisico")) {
    paragraphs.push(sectionTitle("Exame físico"));
    [
      paragraph(EXAME_FISICO_TEXTOS.estado_mental),
      paragraph(EXAME_FISICO_TEXTOS.ectoscopia),
      paragraph(EXAME_FISICO_TEXTOS.inspecao_dinamica),
    ].forEach((p) => p && paragraphs.push(p));

    paragraphs.push(sectionTitle("Conclusão"));
    const complementPar = paragraph(EXAME_FISICO_TEXTOS.complementacao);
    if (complementPar) paragraphs.push(complementPar);

    const ex = data.exame_fisico || {};
    const incapLabels = INCAPACIDADE_OPCOES.map((o) => o.label);
    const fhLabel = INCAPACIDADE_LABEL[ex.incap_funcao_habitual ?? ""] || "";
    const viLabel = INCAPACIDADE_LABEL[ex.incap_vida_independente ?? ""] || "";
    const fhSelected = incapLabels.find((l) => l.toLowerCase() === fhLabel.toLowerCase());
    const viSelected = incapLabels.find((l) => l.toLowerCase() === viLabel.toLowerCase());
    optionsBlock(
      "Incapacidade para sua função habitual",
      buildOptionRows(incapLabels, fhSelected),
    ).forEach((p) => paragraphs.push(p));
    optionsBlock(
      "Incapacidade para a vida independente",
      buildOptionRows(incapLabels, viSelected),
    ).forEach((p) => paragraphs.push(p));
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
