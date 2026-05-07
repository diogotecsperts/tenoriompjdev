import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const incapacidadeOptions = [
  { value: "total_temporaria", label: "Incapacidade Total Temporária" },
  { value: "parcial_permanente", label: "Incapacidade Parcial Permanente" },
  { value: "parcial_temporaria", label: "Incapacidade Parcial Temporária" },
  { value: "ausencia", label: "Ausência de Incapacidade Laboral" },
  { value: "total_permanente", label: "Incapacidade Total Permanente" },
];

export function AnaliseIncapacidade() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [isGenerating, setIsGenerating] = useState(false);

  if (!currentLaudo) return null;

  const getSelectedTypes = (): string[] => {
    const status = currentLaudo.conclusaoStatus;
    if (!status) return [];
    try {
      const parsed = JSON.parse(status);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* legacy string */
    }
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
    const current = getSelectedTypes();
    const next = checked
      ? (current.includes(value) ? current : [...current, value])
      : current.filter((v) => v !== value);
    updateLaudo({ conclusaoStatus: JSON.stringify(next) });
  };

  const selectedTypes = getSelectedTypes();
  const labelMap = Object.fromEntries(incapacidadeOptions.map((o) => [o.value, o.label]));
  const escolhaLegivel = selectedTypes.map((v) => labelMap[v] || v).join('; ');

  const handleGenerate = async () => {
    if (selectedTypes.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum tipo selecionado",
        description: "Marque ao menos um tipo de incapacidade antes de gerar a justificativa.",
      });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-justificativa-medica', {
        body: {
          laudoId: currentLaudo.id,
          campo: 'incapacidade',
          escolha: escolhaLegivel,
        }
      });
      if (error) throw error;
      if (data?.texto) {
        updateLaudo({ analiseIncapacidadeLaboral: data.texto });
        toast({ title: "Justificativa gerada", description: "Texto técnico redigido conforme sua decisão." });
      }
    } catch (err) {
      console.error("Erro ao gerar justificativa de incapacidade:", err);
      toast({
        variant: "destructive",
        title: "Erro ao gerar justificativa",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise da Incapacidade Laboral</CardTitle>
        <CardDescription>
          Você (médico) define o(s) tipo(s) de incapacidade. A IA apenas redige a fundamentação técnica defendendo a sua escolha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Tipo(s) de Incapacidade</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating || selectedTypes.length === 0}
              className="gap-2"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "Gerando..." : "Gerar Justificativa"}
            </Button>
          </div>
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
          value={currentLaudo.analiseIncapacidadeLaboral || ''}
          onChange={(value) => updateLaudo({ analiseIncapacidadeLaboral: value })}
          placeholder="Selecione o(s) tipo(s) acima e clique em Gerar Justificativa, ou redija manualmente."
          rows={8}
          enableEnhance={true}
          enableRegenerate={false}
          fieldKey="analiseIncapacidadeLaboral"
          laudoId={currentLaudo.id}
          hasPdfSource={false}
        />
      </CardContent>
    </Card>
  );
}
