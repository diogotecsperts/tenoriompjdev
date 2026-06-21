/**
 * Export DOCX do Pré-Laudo Previdenciário.
 * "Esqueleto" (cabeçalho/rodapé/numeração/margens/fonte) idêntico ao
 * generateLaudoDOCX.ts do Trabalhista — sem importar nada dele.
 * Conteúdo: os 10 steps de PrelaudoData.
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
import type {
  PrelaudoData,
  CidItem,
  MedicacaoItem,
  StepId,
} from "../prelaudo-structure";
import { ALL_STEP_IDS } from "../prelaudo-structure";
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
} from "./_shared";

// ---------- builders ----------
const sectionTitle = (n: number, title: string) =>
  new Paragraph({
    children: [
      new TextRun({
        text: `${n}. ${title.toUpperCase()}`,
        bold: true,
        size: FONT.sizeTitle,
        color: COLORS_HEX.primary,
        font: FONT.name,
      }),
    ],
    spacing: { before: 320, after: 160 },
    border: {
      bottom: { color: COLORS_HEX.primary, size: 6, style: BorderStyle.SINGLE, space: 1 },
    },
  });

const subtitle = (text: string) =>
  new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: FONT.sizeSubtitle,
        color: COLORS_HEX.secondary,
        font: FONT.name,
      }),
    ],
    spacing: { before: 160, after: 80 },
  });

const labeled = (label: string, value: string): Paragraph | null => {
  if (isFieldEmpty(value)) return null;
  return new Paragraph({
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        size: FONT.sizeDefault,
        color: COLORS_HEX.text,
        font: FONT.name,
      }),
      new TextRun({
        text: stripLightMarkdown(value),
        size: FONT.sizeDefault,
        color: COLORS_HEX.text,
        font: FONT.name,
      }),
    ],
    spacing: { after: 80 },
  });
};

const paragraph = (text: string): Paragraph | null => {
  if (isFieldEmpty(text)) return null;
  return new Paragraph({
    children: [
      new TextRun({
        text: stripLightMarkdown(text),
        size: FONT.sizeDefault,
        color: COLORS_HEX.text,
        font: FONT.name,
      }),
    ],
    spacing: { after: 100 },
    alignment: AlignmentType.JUSTIFIED,
  });
};

const emptyNote = () =>
  new Paragraph({
    children: [
      new TextRun({
        text: "— Não informado.",
        italics: true,
        size: FONT.sizeDefault,
        color: COLORS_HEX.muted,
        font: FONT.name,
      }),
    ],
    spacing: { after: 100 },
  });

const hasAny = (obj: any) =>
  obj && Object.values(obj).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

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
  let sectionNo = 0;
  const nextN = () => ++sectionNo;

  const paragraphs: Paragraph[] = [];

  // ----- Cabeçalho do documento (interno, não é o banner) -----
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO",
          bold: true,
          size: 28, // 14pt
          color: COLORS_HEX.primary,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
    }),
  );
  const peritoLine = buildPeritoIdLine({
    peritoNome: meta.peritoNome,
    peritoCRM: meta.peritoCRM,
  });
  [
    labeled("Local", meta.local || ""),
    labeled("Data da perícia", fmtDate(meta.dataPericia)),
    labeled("Nº do processo", meta.numeroProcesso || ""),
    peritoLine ? labeled("Identificação", peritoLine) : null,
  ].forEach((p) => p && paragraphs.push(p));
  paragraphs.push(new Paragraph({ spacing: { after: 200 } }));

  // Helper para empilhar seção
  const pushSection = (n: number, title: string, items: (Paragraph | null)[]) => {
    paragraphs.push(sectionTitle(n, title));
    const real = items.filter((p): p is Paragraph => !!p);
    if (real.length === 0) paragraphs.push(emptyNote());
    else paragraphs.push(...real);
  };

  // ----- 1. Identificação -----
  if (included.has("identificacao")) {
    const id = data.identificacao || {};
    pushSection(nextN(), "Identificação", [
      labeled("Nome", id.nome || ""),
      labeled("CPF", id.cpf || ""),
      labeled("RG", id.rg || ""),
      labeled("Data de nascimento", fmtDate(id.data_nascimento)),
      labeled("Idade", id.idade || ""),
      labeled("Sexo", id.sexo || ""),
      labeled("Estado civil", id.estado_civil || ""),
      labeled("Escolaridade", id.escolaridade || ""),
      labeled("Profissão", id.profissao || ""),
      labeled("Última atividade", id.ultima_atividade || ""),
      labeled("Endereço", id.endereco || ""),
      labeled("Telefone", id.telefone || ""),
    ]);
    if (id.numero_processo || id.vara || id.comarca || id.beneficio_pleiteado) {
      paragraphs.push(subtitle("Dados do processo"));
      [
        labeled("Nº do processo", id.numero_processo || ""),
        labeled("Vara", id.vara || ""),
        labeled("Comarca", id.comarca || ""),
        labeled("Benefício pleiteado", id.beneficio_pleiteado || ""),
      ].forEach((p) => p && paragraphs.push(p));
    }
  }

  // ----- 2. Queixa -----
  if (included.has("queixa")) {
    const q = data.queixa || {};
    pushSection(nextN(), "Queixa principal", [
      paragraph(q.queixa_principal || ""),
      labeled("Início dos sintomas", q.inicio_sintomas || ""),
      labeled("Evolução", q.evolucao || ""),
      labeled("Lateralidade", q.lateralidade || ""),
      labeled("Fatores agravantes", q.fatores_agravantes || ""),
    ]);
  }

  // ----- 3. Medicação -----
  if (included.has("medicacao")) {
    const meds = data.medicacao?.itens ?? [];
    paragraphs.push(sectionTitle(nextN(), "Medicação em uso"));
    if (meds.length === 0 && !data.medicacao?.observacoes) paragraphs.push(emptyNote());
    else {
      meds.forEach((m: MedicacaoItem) => {
        const parts = [m.nome, m.dose, m.frequencia].filter(Boolean).join(" — ");
        const status = m.em_uso === false ? " (suspensa)" : "";
        const p = paragraph(`• ${parts}${status}`);
        if (p) paragraphs.push(p);
      });
      const obs = labeled("Observações", data.medicacao?.observacoes || "");
      if (obs) paragraphs.push(obs);
    }
  }

  // ----- 4. Acompanhamento -----
  if (included.has("acompanhamento")) {
    const a = data.acompanhamento || {};
    pushSection(nextN(), "Acompanhamento médico", [
      labeled(
        "Faz acompanhamento",
        a.faz_acompanhamento === "sim" ? "Sim" : a.faz_acompanhamento === "nao" ? "Não" : "",
      ),
      labeled("Especialistas", a.especialistas || ""),
      labeled("Frequência", a.frequencia || ""),
      labeled("Última consulta", a.ultima_consulta || ""),
      labeled("Observações", a.observacoes || ""),
    ]);
  }

  // ----- 5. Comorbidades -----
  if (included.has("comorbidades")) {
    const c = data.comorbidades || {};
    pushSection(nextN(), "Comorbidades", [
      c.lista && c.lista.length > 0 ? paragraph(c.lista.join(" • ")) : null,
      paragraph(c.texto || ""),
      labeled("Cirurgias prévias", c.cirurgias_previas || ""),
      labeled("Internações", c.internacoes || ""),
      labeled("Histórico familiar", c.historico_familiar || ""),
    ]);
  }

  // ----- 6. Estado mental -----
  if (included.has("estado_mental")) {
    const em = data.estado_mental || {};
    pushSection(nextN(), "Estado mental", [
      labeled("Orientação", em.orientacao || ""),
      labeled("Humor", em.humor || ""),
      labeled("Afeto", em.afeto || ""),
      labeled("Pensamento", em.pensamento || ""),
      labeled("Memória", em.memoria || ""),
      labeled("Atenção", em.atencao || ""),
      labeled("Juízo e crítica", em.juizo_critica || ""),
      labeled("Observações", em.observacoes || ""),
    ]);
  }

  // ----- 7. Ectoscopia -----
  if (included.has("ectoscopia")) {
    const ec = data.ectoscopia || {};
    pushSection(nextN(), "Ectoscopia / Exame geral", [
      labeled("Estado geral", ec.estado_geral || ""),
      labeled("Hidratação", ec.hidratacao || ""),
      labeled("Corado", ec.corado || ""),
      labeled("Acianótico", ec.acianotico || ""),
      labeled("Anictérico", ec.anicterico || ""),
      labeled("Marcha", ec.marcha || ""),
      labeled("Postura", ec.postura || ""),
      labeled("Peso", ec.peso || ""),
      labeled("Altura", ec.altura || ""),
      labeled("IMC", ec.imc || ""),
      labeled("Pressão arterial", ec.pressao_arterial || ""),
      labeled("Observações", ec.observacoes || ""),
    ]);
  }

  // ----- 8. Ortopédico -----
  if (included.has("exame_ortopedico")) {
    const ort = data.exame_ortopedico || {};
    pushSection(nextN(), "Exame ortopédico", [
      labeled("Segmento avaliado", ort.segmento_avaliado || ""),
      labeled("Inspeção", ort.inspecao || ""),
      labeled("Palpação", ort.palpacao || ""),
      labeled("Amplitude de movimento", ort.amplitude_movimento || ""),
      labeled("Força muscular", ort.forca_muscular || ""),
      labeled("Reflexos", ort.reflexos || ""),
      labeled("Testes especiais", ort.testes_especiais || ""),
      labeled("Manobras", ort.manobras || ""),
      labeled("Observações", ort.observacoes || ""),
    ]);
  }

  // ----- 9. CID -----
  if (included.has("cid")) {
    paragraphs.push(sectionTitle(nextN(), "CID-10"));
    const cid = data.cid;
    if (!cid?.itens || cid.itens.length === 0) paragraphs.push(emptyNote());
    else {
      cid.itens.forEach((it: CidItem) => {
        const prefix = it.principal ? "★ " : "• ";
        const desc = it.descricao ? ` — ${it.descricao}` : "";
        const p = paragraph(`${prefix}${it.codigo}${desc}`);
        if (p) paragraphs.push(p);
      });
      const obs = labeled("Observações", cid.observacoes || "");
      if (obs) paragraphs.push(obs);
    }
  }

  // ----- 10. Conclusão -----
  if (included.has("conclusao")) {
    const con = data.conclusao || {};
    const nexoMap: Record<string, string> = { sim: "Sim", nao: "Não", parcial: "Parcial" };
    const incMap: Record<string, string> = { total: "Total", parcial: "Parcial", ausente: "Ausente" };
    const tempMap: Record<string, string> = { temporaria: "Temporária", permanente: "Permanente" };
    pushSection(nextN(), "Conclusão", [
      labeled("Diagnóstico", con.diagnostico || ""),
      labeled("Nexo causal", nexoMap[con.nexo_causal || ""] || ""),
      labeled("Justificativa do nexo", con.nexo_justificativa || ""),
      labeled("Incapacidade", incMap[con.incapacidade || ""] || ""),
      labeled("Temporalidade", tempMap[con.temporalidade || ""] || ""),
      labeled("Data de início da incapacidade (DII)", fmtDate(con.data_inicio_incapacidade)),
      labeled("Prazo para reavaliação", con.prazo_reavaliacao || ""),
      labeled(
        "Reabilitação indicada",
        con.reabilitacao_indicada === "sim" ? "Sim" : con.reabilitacao_indicada === "nao" ? "Não" : "",
      ),
      labeled("Considerações finais", con.consideracoes_finais || ""),
    ]);
  }

  // ----- Assinatura -----
  paragraphs.push(new Paragraph({ spacing: { before: 600 } }));
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "________________________________________",
          size: FONT.sizeDefault,
          color: COLORS_HEX.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  );
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: meta.peritoNome || "Perito médico",
          bold: true,
          size: FONT.sizeDefault,
          color: COLORS_HEX.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 80 },
    }),
  );
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Médico Perito Judicial",
          italics: true,
          size: FONT.sizeDefault,
          color: COLORS_HEX.muted,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  );

  // ========== Banner topo/rodapé (idêntico ao Trabalhista) ==========
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
