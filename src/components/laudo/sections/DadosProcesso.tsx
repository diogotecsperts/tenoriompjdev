import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DadosProcesso() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Processo Trabalhista</CardTitle>
        <CardDescription>
          Informações sobre o processo judicial e as partes envolvidas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dados básicos do processo */}
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="processoNumero">Número do Processo</Label>
            <Input
              id="processoNumero"
              value={currentLaudo.processoNumero}
              onChange={(e) => updateLaudo({ processoNumero: e.target.value })}
              placeholder="0000000-00.0000.0.00.0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="processoVara">Vara</Label>
            <Input
              id="processoVara"
              value={currentLaudo.processoVara}
              onChange={(e) => updateLaudo({ processoVara: e.target.value })}
              placeholder="1ª Vara do Trabalho"
            />
          </div>
        </div>

        {/* Partes */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reclamante">Reclamante</Label>
            <Input
              id="reclamante"
              value={currentLaudo.reclamante}
              onChange={(e) => updateLaudo({ reclamante: e.target.value })}
              placeholder="Nome do reclamante"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reclamada">Reclamada</Label>
            <Input
              id="reclamada"
              value={currentLaudo.reclamada}
              onChange={(e) => updateLaudo({ reclamada: e.target.value })}
              placeholder="Nome da empresa reclamada"
            />
          </div>
        </div>

        {/* Assistentes Técnicos */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Assistentes Técnicos
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assistenteTecnicoReclamante">Assistente Técnico do Reclamante</Label>
              <Input
                id="assistenteTecnicoReclamante"
                value={currentLaudo.assistenteTecnicoReclamante || ""}
                onChange={(e) => updateLaudo({ assistenteTecnicoReclamante: e.target.value })}
                placeholder="Nome e CRM do assistente técnico"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistenteTecnicoReclamada">Assistente Técnico da Reclamada</Label>
              <Input
                id="assistenteTecnicoReclamada"
                value={currentLaudo.assistenteTecnicoReclamada || ""}
                onChange={(e) => updateLaudo({ assistenteTecnicoReclamada: e.target.value })}
                placeholder="Nome e CRM do assistente técnico"
              />
            </div>
          </div>
        </div>

        {/* Data e Local da Perícia */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Perícia
          </h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dataPericia">Data da Perícia</Label>
              <Input
                id="dataPericia"
                type="date"
                value={currentLaudo.dataPericia}
                onChange={(e) => updateLaudo({ dataPericia: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataAcidente">Data do Acidente</Label>
              <Input
                id="dataAcidente"
                type="date"
                value={currentLaudo.dataAcidente}
                onChange={(e) => updateLaudo({ dataAcidente: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="localPericia">Local da Perícia</Label>
              <Input
                id="localPericia"
                value={currentLaudo.localPericia || ""}
                onChange={(e) => updateLaudo({ localPericia: e.target.value })}
                placeholder="Endereço do local da perícia"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
