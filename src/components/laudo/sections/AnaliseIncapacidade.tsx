import { useLaudo } from "@/contexts/LaudoContext";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

const incapacidadeOptions = [
  { value: "total_temporaria", label: "Incapacidade Total Temporária" },
  { value: "parcial_permanente", label: "Incapacidade Parcial Permanente" },
  { value: "parcial_temporaria", label: "Incapacidade Parcial Temporária" },
  { value: "ausencia", label: "Ausência de Incapacidade Laboral" },
  { value: "total_permanente", label: "Incapacidade Total Permanente" },
];

export function AnaliseIncapacidade() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  // Check if laudo has PDF source for regeneration
  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.pdfFilePath || 
                       !!(currentLaudo.aiMetadata as any)?.importJobId;

  // Map old conclusaoStatus values to new incapacidadeTipo values
  const getIncapacidadeTipo = (): string => {
    // First check if new field exists
    if ((currentLaudo as any).incapacidadeTipo) {
      return (currentLaudo as any).incapacidadeTipo;
    }
    // Fall back to mapping from old conclusaoStatus
    const statusMap: Record<string, string> = {
      'total-temp': 'total_temporaria',
      'parcial-temp': 'parcial_temporaria',
      'total-perm': 'total_permanente',
      'parcial-perm': 'parcial_permanente',
      'nenhuma': 'ausencia',
    };
    return statusMap[currentLaudo.conclusaoStatus] || '';
  };

  const handleIncapacidadeChange = (value: string) => {
    updateLaudo({ 
      // Update both fields for compatibility
      conclusaoStatus: value,
      // Use type assertion since we're adding a new field
    } as any);
  };

  const getJustificativa = (): string => {
    // First check new field, then fall back to old analiseIncapacidadeLaboral
    return (currentLaudo as any).incapacidadeJustificativa || currentLaudo.analiseIncapacidadeLaboral || '';
  };

  const handleJustificativaChange = (value: string) => {
    updateLaudo({ 
      analiseIncapacidadeLaboral: value,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise da Incapacidade Laboral</CardTitle>
        <CardDescription>
          Avaliação técnica da capacidade laboral do periciando
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Tipo de Incapacidade</Label>
          <RadioGroup
            value={getIncapacidadeTipo()}
            onValueChange={handleIncapacidadeChange}
            className="space-y-2"
          >
            {incapacidadeOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`incap-${option.value}`} />
                <Label 
                  htmlFor={`incap-${option.value}`} 
                  className="font-normal cursor-pointer"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        
        <LaudoTextareaAIField
          id="incapacidadeJustificativa"
          label="Justificativa da Incapacidade"
          value={getJustificativa()}
          onChange={handleJustificativaChange}
          placeholder="Fundamente a análise da incapacidade, descrevendo as limitações funcionais identificadas, compatibilidade com a função exercida, possibilidade de reabilitação..."
          rows={8}
          enableEnhance={true}
          enableRegenerate={false}
          fieldKey="analiseIncapacidadeLaboral"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
