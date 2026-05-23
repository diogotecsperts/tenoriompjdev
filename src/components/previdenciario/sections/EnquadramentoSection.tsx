import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { AiGenerateButton } from "./AiGenerateButton";

const LEIS = [
  { v: "Lei 8.213/91 art. 42 — Aposentadoria por invalidez", l: "Lei 8.213/91, art. 42 — Aposentadoria por invalidez" },
  { v: "Lei 8.213/91 art. 59 — Auxílio-doença", l: "Lei 8.213/91, art. 59 — Auxílio-doença" },
  { v: "Lei 8.213/91 art. 86 — Auxílio-acidente", l: "Lei 8.213/91, art. 86 — Auxílio-acidente" },
  { v: "Lei 8.213/91 art. 45 — Majoração de 25%", l: "Lei 8.213/91, art. 45 — Majoração de 25%" },
  { v: "LOAS — Lei 8.742/93 art. 20 — BPC", l: "LOAS — Lei 8.742/93, art. 20 — BPC" },
  { v: "Decreto 3.048/99 — Regulamento da Previdência Social", l: "Decreto 3.048/99 — Regulamento da Previdência Social" },
  { v: "Lei 7.713/88 art. 6º XIV — Isenção de IR doença grave", l: "Lei 7.713/88, art. 6º, XIV — Isenção de IR (doença grave)" },
];

export function EnquadramentoSection() {
  const { laudo, updatePrevData } = useLaudoPrev();
  if (!laudo) return null;
  const enq = laudo.prev_data.enquadramento;
  const checked = (v: string) => enq.leis_aplicaveis.includes(v);

  const toggle = (v: string) => {
    const next = checked(v)
      ? enq.leis_aplicaveis.filter((x) => x !== v)
      : [...enq.leis_aplicaveis, v];
    updatePrevData("enquadramento", { leis_aplicaveis: next });
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Enquadramento Legal</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dispositivos legais aplicáveis ao caso.
            </p>
          </div>
          <AiGenerateButton
            laudoId={laudo.id}
            campo="prev_enquadramento"
            disabledReason={
              !enq.leis_aplicaveis || enq.leis_aplicaveis.length === 0
                ? "Selecione ao menos uma lei aplicável antes de gerar a fundamentação."
                : null
            }
            label="Gerar fundamentação"
            onGenerated={(t) => updatePrevData("enquadramento", { fundamentacao: t })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Leis aplicáveis</Label>
          <div className="space-y-2">
            {LEIS.map((lei) => (
              <label
                key={lei.v}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  checked={checked(lei.v)}
                  onCheckedChange={() => toggle(lei.v)}
                  className="mt-0.5"
                />
                <span className="text-sm text-foreground">{lei.l}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Fundamentação técnico-jurídica</Label>
          <Textarea
            rows={6}
            value={enq.fundamentacao}
            onChange={(e) => updatePrevData("enquadramento", { fundamentacao: e.target.value })}
            placeholder="Articulação entre os achados periciais e os dispositivos legais selecionados."
          />
        </div>
      </CardContent>
    </Card>
  );
}
