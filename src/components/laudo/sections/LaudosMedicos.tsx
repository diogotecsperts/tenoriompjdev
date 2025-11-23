import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionNavigation } from "../SectionNavigation";

interface LaudosMedicosProps {
  currentIndex: number;
  totalSections: number;
  onNext: () => void;
  onPrevious: () => void;
}

export function LaudosMedicos({ currentIndex, totalSections, onNext, onPrevious }: LaudosMedicosProps) {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laudos Médicos</CardTitle>
        <CardDescription>
          Transcrição e análise dos laudos médicos apresentados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="laudosMedicos">Descrição dos Laudos</Label>
        <Textarea
          id="laudosMedicos"
          value={currentLaudo.laudosMedicos}
          onChange={(e) => updateLaudo({ laudosMedicos: e.target.value })}
          placeholder="Transcreva os principais achados dos laudos médicos, diagnósticos apresentados, conclusões dos médicos assistentes..."
          rows={10}
        />
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
