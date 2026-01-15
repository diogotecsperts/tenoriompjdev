import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function LaudosMedicos() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.ai_metadata as any)?.importJobId || !!(currentLaudo.ai_metadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laudos Médicos</CardTitle>
        <CardDescription>
          Transcrição e análise dos laudos médicos apresentados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <LaudoTextareaAIField
          id="laudosMedicos"
          label="Descrição dos Laudos"
          value={currentLaudo.laudosMedicos || ""}
          onChange={(value) => updateLaudo({ laudosMedicos: value })}
          placeholder="Transcreva os principais achados dos laudos médicos, diagnósticos apresentados, conclusões dos médicos assistentes..."
          rows={10}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="laudosMedicos"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
