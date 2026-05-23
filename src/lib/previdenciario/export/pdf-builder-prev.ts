import { jsPDF } from "jspdf";
import { LaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { buildPrevBlocks } from "./prev-export-blocks";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 20;
const MARGIN_R = 15;
const MARGIN_T = 20;
const MARGIN_B = 20;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

export async function generatePrevLaudoPDF(laudo: LaudoPrev): Promise<void> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN_T;

  const ensureSpace = (h: number) => {
    if (y + h > PAGE_H - MARGIN_B) {
      pdf.addPage();
      y = MARGIN_T;
    }
  };

  const writeWrapped = (text: string, opts: { size: number; bold?: boolean; lh?: number }) => {
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(opts.size);
    const lh = opts.lh ?? opts.size * 0.5;
    const lines = pdf.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
      ensureSpace(lh);
      pdf.text(line, MARGIN_L, y);
      y += lh;
    }
  };

  // Cabeçalho
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  const title = "LAUDO PERICIAL MÉDICO — PERÍCIA PREVIDENCIÁRIA";
  const titleW = pdf.getTextWidth(title);
  pdf.text(title, (PAGE_W - titleW) / 2, y);
  y += 10;
  pdf.setDrawColor(120);
  pdf.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  y += 6;

  const blocks = buildPrevBlocks(laudo);

  for (const block of blocks) {
    ensureSpace(10);
    y += 2;
    writeWrapped(block.heading.toUpperCase(), { size: 11, bold: true, lh: 6 });
    y += 1;
    for (const line of block.lines) {
      // Cada linha pode conter quebras de linha internas
      const segments = line.split("\n");
      for (const seg of segments) {
        if (seg.trim() === "") {
          y += 3;
          continue;
        }
        writeWrapped(seg, { size: 10, lh: 4.8 });
      }
      y += 1.5;
    }
  }

  // Numeração de páginas
  const total = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`Página ${i} de ${total}`, PAGE_W - MARGIN_R, PAGE_H - 8, { align: "right" });
  }

  const filename = `laudo-previdenciario-${(laudo as any).processo_numero || laudo.id}.pdf`;
  pdf.save(filename.replace(/[^a-zA-Z0-9.\-_]/g, "_"));
}
