import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
        <div className="space-y-2">
          <Label htmlFor="objetivoPericia">Objetivo</Label>
          <Textarea
            id="objetivoPericia"
            value={currentLaudo.objetivoPericia || ""}
            onChange={(e) => updateLaudo({ objetivoPericia: e.target.value })}
            placeholder="Ex: O presente laudo tem por objetivo avaliar a existência de nexo causal entre as atividades laborais exercidas pelo(a) reclamante e as patologias alegadas, bem como quantificar eventuais sequelas..."
            rows={4}
          />
        </div>
      </CardContent>
    </Card>
  );
}
