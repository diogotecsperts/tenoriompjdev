import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ExamesComplementares() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exames Complementares</CardTitle>
        <CardDescription>
          Resultados de exames laboratoriais, de imagem e outros procedimentos diagnósticos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="examesComplementares">Descrição dos Exames</Label>
        <Textarea
          id="examesComplementares"
          value={currentLaudo.examesComplementares}
          onChange={(e) => updateLaudo({ examesComplementares: e.target.value })}
          placeholder="Descreva os resultados de raio-X, tomografia, ressonância magnética, exames laboratoriais e outros exames realizados..."
          rows={10}
        />
      </CardContent>
    </Card>
  );
}
