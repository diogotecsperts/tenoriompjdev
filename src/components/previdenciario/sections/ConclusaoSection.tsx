import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { AiStubButton } from "./AiStubButton";

const PARECERES = [
  { v: "apto", l: "Apto — sem incapacidade laboral" },
  { v: "incapaz_temporario", l: "Incapaz temporariamente" },
  { v: "incapaz_permanente_parcial", l: "Incapaz permanente — parcial" },
  { v: "incapaz_permanente_total", l: "Incapaz permanente — total" },
  { v: "inconclusivo", l: "Inconclusivo" },
];

export function ConclusaoSection() {
  const { laudo, updatePrevData } = useLaudoPrev();
  if (!laudo) return null;
  const c = laudo.prev_data.conclusao_prev;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Conclusão Previdenciária</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Parecer final sintetizando a análise pericial.
            </p>
          </div>
          <AiStubButton label="Gerar conclusão" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Parecer final</Label>
            <Select
              value={c.parecer || undefined}
              onValueChange={(v) => updatePrevData("conclusao_prev", { parecer: v as any })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {PARECERES.map((p) => (
                  <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Benefício recomendado</Label>
            <Input
              value={c.beneficio_recomendado}
              onChange={(e) =>
                updatePrevData("conclusao_prev", { beneficio_recomendado: e.target.value })
              }
              placeholder="Ex.: B31 — Auxílio-doença comum por 6 meses"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Texto final da conclusão</Label>
          <Textarea
            rows={8}
            value={c.texto_final}
            onChange={(e) =>
              updatePrevData("conclusao_prev", { texto_final: e.target.value })
            }
            placeholder="Síntese técnica do parecer pericial conclusivo."
          />
        </div>
      </CardContent>
    </Card>
  );
}
