import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  convertInchesToTwip,
} from "docx";
import { saveAs } from "file-saver";
import { LaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { buildPrevBlocks } from "./prev-export-blocks";

function makeParagraphs(text: string): Paragraph[] {
  return text.split("\n").map(
    (line) =>
      new Paragraph({
        spacing: { after: 120, line: 300 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: line, size: 22, font: "Calibri" })],
      }),
  );
}

export async function generatePrevLaudoDOCX(laudo: LaudoPrev): Promise<void> {
  const blocks = buildPrevBlocks(laudo);

  const children: Paragraph[] = [];

  // Cabeçalho
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "LAUDO PERICIAL MÉDICO — PERÍCIA PREVIDENCIÁRIA",
          bold: true,
          size: 28,
          font: "Calibri",
        }),
      ],
    }),
  );

  for (const block of blocks) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: block.heading.toUpperCase(),
            bold: true,
            size: 24,
            font: "Calibri",
          }),
        ],
      }),
    );
    for (const line of block.lines) {
      children.push(...makeParagraphs(line));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `laudo-previdenciario-${(laudo as any).processo_numero || laudo.id}.docx`;
  saveAs(blob, filename.replace(/[^a-zA-Z0-9.\-_]/g, "_"));
}
