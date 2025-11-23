import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ExameFisico() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exame Físico Pericial</CardTitle>
        <CardDescription>
          Descrição detalhada do exame físico realizado durante a perícia
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="exameFisico">Achados do Exame Físico</Label>
        <Textarea
          id="exameFisico"
          value={currentLaudo.exameFisico}
          onChange={(e) => updateLaudo({ exameFisico: e.target.value })}
          placeholder="Descreva o estado geral, inspeção, palpação, testes especiais, amplitude de movimentos, força muscular, sinais e sintomas observados..."
          rows={12}
        />
      </CardContent>
    </Card>
  );
}
