import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionNavigation } from "../SectionNavigation";

interface DadosProcessoProps {
  currentIndex: number;
  totalSections: number;
  onNext: () => void;
  onPrevious: () => void;
}

export function DadosProcesso({ currentIndex, totalSections, onNext, onPrevious }: DadosProcessoProps) {
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
      <CardContent className="space-y-4">
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dataAcidente">Data do Acidente</Label>
            <Input
              id="dataAcidente"
              type="date"
              value={currentLaudo.dataAcidente}
              onChange={(e) => updateLaudo({ dataAcidente: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataPericia">Data da Perícia</Label>
            <Input
              id="dataPericia"
              type="date"
              value={currentLaudo.dataPericia}
              onChange={(e) => updateLaudo({ dataPericia: e.target.value })}
            />
          </div>
        </div>
        <SectionNavigation
          currentIndex={currentIndex}
          totalSections={totalSections}
          onNext={onNext}
          onPrevious={onPrevious}
        />
      </CardContent>
    </Card>
  );
}
