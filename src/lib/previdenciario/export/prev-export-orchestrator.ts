import { LaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { generatePrevLaudoDOCX } from "./docx-builder-prev";
import { generatePrevLaudoPDF } from "./pdf-builder-prev";

export type PrevExportFormat = "pdf" | "docx";

export async function exportPrevLaudo(
  laudo: LaudoPrev,
  format: PrevExportFormat,
): Promise<void> {
  if (format === "docx") {
    await generatePrevLaudoDOCX(laudo);
  } else {
    await generatePrevLaudoPDF(laudo);
  }
}
