import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionNavigation } from "../SectionNavigation";

interface DadosAcidenteProps {
  currentIndex: number;
  totalSections: number;
  onNext: () => void;
  onPrevious: () => void;
}

export function DadosAcidente({ currentIndex, totalSections, onNext, onPrevious }: DadosAcidenteProps) {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Acidente</CardTitle>
        <CardDescription>
          Histórico ocupacional e relato detalhado do acidente de trabalho
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="historicoOcupacional">Histórico Ocupacional</Label>
          <Textarea
            id="historicoOcupacional"
            value={currentLaudo.historicoOcupacional}
            onChange={(e) => updateLaudo({ historicoOcupacional: e.target.value })}
            placeholder="Descreva a trajetória profissional, funções exercidas, tempo de serviço e condições de trabalho..."
            rows={6}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="historiaAcidente">História do Acidente</Label>
          <Textarea
            id="historiaAcidente"
            value={currentLaudo.historiaAcidente}
            onChange={(e) => updateLaudo({ historiaAcidente: e.target.value })}
            placeholder="Relate detalhadamente como ocorreu o acidente, circunstâncias, mecanismo de trauma, local e testemunhas..."
            rows={8}
          />
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
