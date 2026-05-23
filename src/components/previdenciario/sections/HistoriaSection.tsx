import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { AiStubButton } from "./AiStubButton";

export function HistoriaSection() {
  const { laudo, updateLaudo, updatePrevData } = useLaudoPrev();
  if (!laudo) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">História Clínica</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Queixa principal, evolução da doença e tratamentos realizados.
              </p>
            </div>
            <AiStubButton label="Gerar resumo clínico" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Resumo da história clínica (previdenciária)</Label>
            <Textarea
              rows={6}
              value={laudo.prev_data.historia_clinica_prev}
              onChange={(e) =>
                updatePrevData("historia_clinica_prev" as any, e.target.value as any)
              }
              placeholder="Síntese da história clínica atual relacionada à incapacidade alegada."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">História da doença atual</Label>
            <Textarea
              rows={4}
              value={laudo.historia_atual ?? ""}
              onChange={(e) => updateLaudo({ historia_atual: e.target.value } as any)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Antecedentes patológicos</Label>
            <Textarea
              rows={3}
              value={(laudo as any).antecedentes ?? ""}
              onChange={(e) => updateLaudo({ antecedentes: e.target.value } as any)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tratamentos realizados</Label>
            <Textarea
              rows={3}
              value={(laudo as any).tratamentos ?? ""}
              onChange={(e) => updateLaudo({ tratamentos: e.target.value } as any)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Afastamentos prévios</Label>
            <Textarea
              rows={3}
              value={(laudo as any).afastamentos ?? ""}
              onChange={(e) => updateLaudo({ afastamentos: e.target.value } as any)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">História Laboral</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Histórico ocupacional e exposição a fatores de risco.
              </p>
            </div>
            <AiStubButton label="Gerar resumo laboral" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Resumo da história laboral (previdenciária)</Label>
            <Textarea
              rows={5}
              value={laudo.prev_data.historia_laboral_prev}
              onChange={(e) =>
                updatePrevData("historia_laboral_prev" as any, e.target.value as any)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Histórico ocupacional detalhado</Label>
            <Textarea
              rows={4}
              value={(laudo as any).historico_ocupacional ?? ""}
              onChange={(e) =>
                updateLaudo({ historico_ocupacional: e.target.value } as any)
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
