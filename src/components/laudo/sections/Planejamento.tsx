import { useLaudo } from "@/contexts/LaudoContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionNavigation } from "../SectionNavigation";

const planejamentoOptions = [
  { id: "nexo-direto", label: "Nexo Causal Direto" },
  { id: "concausa", label: "Concausa" },
  { id: "agravamento", label: "Agravamento de Lesão Prévia" },
  { id: "sem-nexo", label: "Sem Nexo Causal" },
  { id: "incapacidade-total-temp", label: "Incapacidade Total Temporária" },
  { id: "incapacidade-parcial-perm", label: "Incapacidade Parcial Permanente" },
  { id: "incapacidade-total-perm", label: "Incapacidade Total Permanente" },
];

interface PlanejamentoProps {
  currentIndex: number;
  totalSections: number;
  onNext: () => void;
  onPrevious: () => void;
}

export function Planejamento({ currentIndex, totalSections, onNext, onPrevious }: PlanejamentoProps) {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const handlePlanejamentoChange = (itemId: string, checked: boolean) => {
    const current = currentLaudo.planejamento || [];
    const updated = checked
      ? [...current, itemId]
      : current.filter((p) => p !== itemId);
    updateLaudo({ planejamento: updated });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planejamento</CardTitle>
        <CardDescription>
          Marque os aspectos relevantes que serão considerados na conclusão do laudo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {planejamentoOptions.map((option) => (
          <div key={option.id} className="flex items-center space-x-2">
            <Checkbox
              id={option.id}
              checked={currentLaudo.planejamento?.includes(option.id)}
              onCheckedChange={(checked) => handlePlanejamentoChange(option.id, checked as boolean)}
            />
            <Label htmlFor={option.id} className="cursor-pointer font-normal">
              {option.label}
            </Label>
          </div>
        ))}
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
