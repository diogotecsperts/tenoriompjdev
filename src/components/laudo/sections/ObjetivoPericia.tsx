import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function ObjetivoPericia() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivo da Perícia</CardTitle>
        <CardDescription>
          Descreva o objetivo principal da perícia médica
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LaudoTextareaAIField
          id="objetivoPericia"
          label="Objetivo"
          value={currentLaudo.objetivoPericia || ""}
          onChange={(value) => updateLaudo({ objetivoPericia: value })}
          placeholder="Texto padrão preenchido automaticamente. Edite se necessário."
          rows={6}
          enableEnhance={false}
          enableRegenerate={false}
        />
      </CardContent>
    </Card>
  );
}
