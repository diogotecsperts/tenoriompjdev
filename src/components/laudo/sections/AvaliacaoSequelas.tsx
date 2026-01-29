import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function AvaliacaoSequelas() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  // Check if laudo has an associated PDF for regeneration
  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.pdfFilePath || 
                       !!(currentLaudo.aiMetadata as any)?.importJobId ||
                       !!(currentLaudo.aiMetadata as any)?.extracted_content_path;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliação das Sequelas</CardTitle>
        <CardDescription>
          Análise de sequelas permanentes, dano estético e necessidade de auxílio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LaudoTextareaAIField
          id="tabelaSUSEP"
          label="Tabela SUSEP/DPVAT"
          value={currentLaudo.tabelaSUSEP || ""}
          onChange={(value) => updateLaudo({ tabelaSUSEP: value })}
          placeholder="Descreva o percentual de invalidez conforme tabela SUSEP/DPVAT, especificando o item aplicável..."
          rows={5}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="tabelaSUSEP"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
        <LaudoTextareaAIField
          id="danoEstetico"
          label="Dano Estético"
          value={currentLaudo.danoEstetico || ""}
          onChange={(value) => updateLaudo({ danoEstetico: value })}
          placeholder="Avalie a existência e grau de dano estético (leve, moderado, grave), descrevendo cicatrizes, deformidades..."
          rows={5}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="danoEstetico"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
        <LaudoTextareaAIField
          id="auxilioTerceiros"
          label="Necessidade de Auxílio de Terceiros"
          value={currentLaudo.auxilioTerceiros || ""}
          onChange={(value) => updateLaudo({ auxilioTerceiros: value })}
          placeholder="Avalie se o periciando necessita de auxílio permanente de terceiros para atividades da vida diária..."
          rows={5}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="auxilioTerceiros"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
