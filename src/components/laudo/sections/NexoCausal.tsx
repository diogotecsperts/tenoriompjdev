import { useLaudo } from "@/contexts/LaudoContext";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function NexoCausal() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  // Check if laudo has PDF source for regeneration
  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.pdfFilePath || 
                       !!(currentLaudo.aiMetadata as any)?.importJobId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nexo Causal</CardTitle>
        <CardDescription>
          Análise da relação entre a lesão/doença e o acidente/condições de trabalho
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nexoCausalTipo">Tipo de Nexo</Label>
          <Select
            value={currentLaudo.nexoCausalTipo}
            onValueChange={(value) => updateLaudo({ nexoCausalTipo: value })}
          >
            <SelectTrigger id="nexoCausalTipo">
              <SelectValue placeholder="Selecione o tipo de nexo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nexo_causal">Nexo Causal</SelectItem>
              <SelectItem value="concausal">Concausal</SelectItem>
              <SelectItem value="ausencia">Ausência de Nexo Causal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <LaudoTextareaAIField
          id="nexoCausalJustificativa"
          label="Justificativa do Nexo"
          value={currentLaudo.nexoCausalJustificativa}
          onChange={(value) => updateLaudo({ nexoCausalJustificativa: value })}
          placeholder="Fundamente tecnicamente a conclusão sobre o nexo causal, citando evidências clínicas, documentais e literatura médica relevante..."
          rows={8}
          enableEnhance={true}
          enableRegenerate={false}
          fieldKey="nexoCausalJustificativa"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
