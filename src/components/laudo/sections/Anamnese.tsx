import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Anamnese() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anamnese</CardTitle>
        <CardDescription>
          História da moléstia atual, queixas e sintomas apresentados pelo periciando
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="historiaAtual">História da Moléstia Atual</Label>
        <Textarea
          id="historiaAtual"
          value={currentLaudo.historiaAtual}
          onChange={(e) => updateLaudo({ historiaAtual: e.target.value })}
          placeholder="Descreva o início dos sintomas, evolução do quadro, queixas atuais, localização e características da dor, limitações funcionais..."
          rows={10}
        />
      </CardContent>
    </Card>
  );
}
