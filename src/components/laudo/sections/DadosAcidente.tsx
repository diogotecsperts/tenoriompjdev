import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function DadosAcidente() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.ai_metadata as any)?.importJobId || !!(currentLaudo.ai_metadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Acidente</CardTitle>
        <CardDescription>
          Histórico ocupacional e relato detalhado do acidente de trabalho
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LaudoTextareaAIField
          id="historicoOcupacional"
          label="Histórico Ocupacional"
          value={currentLaudo.historicoOcupacional || ""}
          onChange={(value) => updateLaudo({ historicoOcupacional: value })}
          placeholder="Descreva a trajetória profissional, funções exercidas, tempo de serviço e condições de trabalho..."
          rows={6}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="historicoOcupacional"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
        <LaudoTextareaAIField
          id="historiaAcidente"
          label="História do Acidente"
          value={currentLaudo.historiaAcidente || ""}
          onChange={(value) => updateLaudo({ historiaAcidente: value })}
          placeholder="Relate detalhadamente como ocorreu o acidente, circunstâncias, mecanismo de trauma, local e testemunhas..."
          rows={8}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="historiaAcidente"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
