import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import type { ResumoData } from "../../lib/prelaudo-structure";
import { Header } from "./Step01Identificacao";

interface Props {
  value: Partial<ResumoData>;
  onChange: (patch: Partial<ResumoData>) => void;
}

/**
 * Etapa 4 — Resumo dos exames extraídos do processo pela IA.
 * Texto somente leitura: sai exatamente igual no DOCX/PDF.
 */
export function Step04Resumo({ value }: Props) {
  const texto = value.texto ?? "";

  return (
    <div className="space-y-4">
      <Header
        title="4. Resumo"
        subtitle="Extração objetiva dos laudos de exames (US, TC, RX, RM, ENMG) presentes no processo. Conteúdo somente leitura."
      />

      {!texto ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center">
          <Sparkles className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum resumo gerado. Processe o PDF na pauta para que a IA extraia os laudos de exames
            do processo.
          </p>
        </div>
      ) : (
        <Textarea
          value={texto}
          readOnly
          rows={24}
          className="resize-y font-mono text-[12.5px] leading-relaxed bg-muted/30"
        />
      )}
    </div>
  );
}
