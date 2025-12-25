import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AnaliseIncapacidade() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise da Incapacidade Laboral</CardTitle>
        <CardDescription>
          Avaliação técnica da capacidade laboral do periciando
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="analiseIncapacidadeLaboral">Análise</Label>
          <Textarea
            id="analiseIncapacidadeLaboral"
            value={currentLaudo.analiseIncapacidadeLaboral || ""}
            onChange={(e) => updateLaudo({ analiseIncapacidadeLaboral: e.target.value })}
            placeholder={`Analise a capacidade laboral do periciando considerando:

- Tipo de incapacidade (parcial/total, temporária/permanente)
- Limitações funcionais identificadas
- Compatibilidade com a função exercida
- Possibilidade de reabilitação profissional
- Necessidade de readaptação de função
- Impacto nas atividades de vida diária...`}
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
