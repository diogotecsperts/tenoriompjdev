import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function ExamesComplementares() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.importJobId || !!(currentLaudo.aiMetadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exames Complementares</CardTitle>
        <CardDescription>
          Resultados de exames laboratoriais, de imagem e outros procedimentos diagnósticos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <LaudoTextareaAIField
          id="examesComplementares"
          label="Descrição dos Exames"
          value={currentLaudo.examesComplementares || ""}
          onChange={(value) => updateLaudo({ examesComplementares: value })}
          placeholder="Descreva os resultados de raio-X, tomografia, ressonância magnética, exames laboratoriais e outros exames realizados..."
          rows={10}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="examesComplementares"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
