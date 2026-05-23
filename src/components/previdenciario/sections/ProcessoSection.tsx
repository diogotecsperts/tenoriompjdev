import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";

export function ProcessoSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dados do Processo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Identificação do processo judicial e das partes (segurado x INSS).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Número do processo</Label>
            <Input
              value={laudo.processo_numero ?? ""}
              onChange={(e) => updateLaudo({ processo_numero: e.target.value })}
              placeholder="0000000-00.0000.0.00.0000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Vara / Juízo</Label>
            <Input
              value={laudo.processo_vara ?? ""}
              onChange={(e) => updateLaudo({ processo_vara: e.target.value })}
              placeholder="Ex.: 1ª Vara Federal de..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Segurado (parte autora)</Label>
            <Input
              value={laudo.reclamante ?? ""}
              onChange={(e) => updateLaudo({ reclamante: e.target.value })}
              placeholder="Nome do segurado"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Parte ré</Label>
            <Input
              value={laudo.reclamada ?? ""}
              onChange={(e) => updateLaudo({ reclamada: e.target.value })}
              placeholder="INSS"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
