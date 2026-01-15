import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

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
        <LaudoTextareaAIField
          id="exameFisico"
          label="Achados do Exame Físico"
          value={currentLaudo.exameFisico || ""}
          onChange={(value) => updateLaudo({ exameFisico: value })}
          placeholder="Descreva o estado geral, inspeção, palpação, testes especiais, amplitude de movimentos, força muscular, sinais e sintomas observados..."
          rows={12}
          enableEnhance={true}
          enableRegenerate={false}
        />
      </CardContent>
    </Card>
  );
}
