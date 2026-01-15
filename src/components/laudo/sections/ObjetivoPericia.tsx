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
          placeholder="Ex: O presente laudo tem por objetivo avaliar a existência de nexo causal entre as atividades laborais exercidas pelo(a) reclamante e as patologias alegadas, bem como quantificar eventuais sequelas..."
          rows={4}
          enableEnhance={true}
          enableRegenerate={false}
        />
      </CardContent>
    </Card>
  );
}
