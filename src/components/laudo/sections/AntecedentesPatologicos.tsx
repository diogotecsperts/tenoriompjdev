import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function AntecedentesPatologicos() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.ai_metadata as any)?.importJobId || !!(currentLaudo.ai_metadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Antecedentes Patológicos</CardTitle>
        <CardDescription>
          Histórico médico pessoal, familiar, tratamentos realizados e afastamentos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LaudoTextareaAIField
          id="antecedentes"
          label="Antecedentes Pessoais e Familiares"
          value={currentLaudo.antecedentes || ""}
          onChange={(value) => updateLaudo({ antecedentes: value })}
          placeholder="Doenças prévias, cirurgias anteriores, alergias, histórico familiar relevante..."
          rows={5}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="antecedentes"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
        <LaudoTextareaAIField
          id="tratamentos"
          label="Tratamentos Realizados"
          value={currentLaudo.tratamentos || ""}
          onChange={(value) => updateLaudo({ tratamentos: value })}
          placeholder="Medicações utilizadas, fisioterapia, cirurgias, procedimentos realizados..."
          rows={5}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="tratamentos"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
        <LaudoTextareaAIField
          id="afastamentos"
          label="Afastamentos do Trabalho"
          value={currentLaudo.afastamentos || ""}
          onChange={(value) => updateLaudo({ afastamentos: value })}
          placeholder="Períodos de afastamento, benefícios recebidos (auxílio-doença, auxílio-acidente)..."
          rows={4}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="afastamentos"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
