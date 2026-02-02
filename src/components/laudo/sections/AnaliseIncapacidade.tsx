import { useLaudo } from "@/contexts/LaudoContext";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

  // Parse conclusaoStatus como array (pode ser JSON array ou string legada)
  const getSelectedTypes = (): string[] => {
    const status = currentLaudo.conclusaoStatus;
    if (!status) return [];
    
    // Tenta parsear como JSON array
    try {
      const parsed = JSON.parse(status);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Se não for JSON, trata como string única (compatibilidade legada)
    }
    
    // Mapeia valores antigos para novos
    const legacyMap: Record<string, string> = {
      'total-temp': 'total_temporaria',
      'parcial-temp': 'parcial_temporaria',
      'total-perm': 'total_permanente',
      'parcial-perm': 'parcial_permanente',
      'nenhuma': 'ausencia',
    };
    
    const mapped = legacyMap[status] || status;
    return mapped ? [mapped] : [];
  };

  const handleCheckboxChange = (value: string, checked: boolean) => {
    const currentSelected = getSelectedTypes();
    let newSelected: string[];
    
    if (checked) {
      // Adiciona ao array se não existir
      newSelected = currentSelected.includes(value) 
        ? currentSelected 
        : [...currentSelected, value];
    } else {
      // Remove do array
      newSelected = currentSelected.filter(v => v !== value);
    }
    
    // Salva como JSON array
    updateLaudo({ 
      conclusaoStatus: JSON.stringify(newSelected)
    });
  };

  const selectedTypes = getSelectedTypes();

  const getJustificativa = (): string => {
    return currentLaudo.analiseIncapacidadeLaboral || '';
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
          Avaliação técnica da capacidade laboral do periciando (permite seleção múltipla)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Tipo(s) de Incapacidade</Label>
          <div className="space-y-3">
            {incapacidadeOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-3">
                <Checkbox
                  id={`incap-${option.value}`}
                  checked={selectedTypes.includes(option.value)}
                  onCheckedChange={(checked) => 
                    handleCheckboxChange(option.value, checked === true)
                  }
                />
                <Label 
                  htmlFor={`incap-${option.value}`} 
                  className="font-normal cursor-pointer"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
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
