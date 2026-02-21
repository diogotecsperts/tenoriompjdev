import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function Conclusao() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  // Check if laudo has PDF source for regeneration
  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.pdfFilePath || 
                       !!(currentLaudo.aiMetadata as any)?.importJobId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conclusão do Laudo</CardTitle>
        <CardDescription>
          Conclusões finais sobre diagnóstico e recomendações
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="conclusaoCID">CID-10 / Diagnóstico</Label>
          <Input
            id="conclusaoCID"
            value={currentLaudo.conclusaoCID}
            onChange={(e) => updateLaudo({ conclusaoCID: e.target.value })}
            placeholder="Ex: M75.1 - Síndrome do Manguito Rotador"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="conclusaoDestino">Destino Sugerido</Label>
          <Input
            id="conclusaoDestino"
            value={currentLaudo.conclusaoDestino}
            onChange={(e) => updateLaudo({ conclusaoDestino: e.target.value })}
            placeholder="Ex: Alta Médica, Reabilitação Profissional, Aposentadoria por Invalidez"
          />
        </div>
        
        <LaudoTextareaAIField
          id="conclusaoAnalise"
          label="Análise Conclusiva"
          value={currentLaudo.conclusaoAnalise}
          onChange={(value) => updateLaudo({ conclusaoAnalise: value })}
          placeholder="Síntese dos achados, diagnóstico final, análise crítica dos elementos avaliados..."
          rows={6}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="conclusaoAnalise"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
