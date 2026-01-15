import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function Anamnese() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.ai_metadata as any)?.importJobId || !!(currentLaudo.ai_metadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anamnese</CardTitle>
        <CardDescription>
          História da moléstia atual, queixas e sintomas apresentados pelo periciando
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <LaudoTextareaAIField
          id="historiaAtual"
          label="História da Moléstia Atual"
          value={currentLaudo.historiaAtual || ""}
          onChange={(value) => updateLaudo({ historiaAtual: value })}
          placeholder="Descreva o início dos sintomas, evolução do quadro, queixas atuais, localização e características da dor, limitações funcionais..."
          rows={10}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="historiaAtual"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
