import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function NexoCausal() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [isGenerating, setIsGenerating] = useState(false);

  if (!currentLaudo) return null;

  const handleGenerate = async () => {
    if (!currentLaudo.nexoCausalTipo) {
      toast({
        variant: "destructive",
        title: "Selecione o tipo de nexo",
        description: "Escolha o tipo de nexo antes de gerar a justificativa.",
      });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-justificativa-medica', {
        body: {
          laudoId: currentLaudo.id,
          campo: 'nexo_causal',
          escolha: currentLaudo.nexoCausalTipo,
        }
      });
      if (error) throw error;
      if (data?.texto) {
        updateLaudo({ nexoCausalJustificativa: data.texto });
        toast({ title: "Justificativa gerada", description: "Texto técnico redigido conforme sua decisão." });
      }
    } catch (err) {
      console.error("Erro ao gerar justificativa de nexo:", err);
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
        <CardTitle>Nexo Causal</CardTitle>
        <CardDescription>
          Você (médico) escolhe o tipo de nexo. A IA apenas redige o texto técnico defendendo a sua escolha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
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
          <Button
            type="button"
            variant="secondary"
            onClick={handleGenerate}
            disabled={isGenerating || !currentLaudo.nexoCausalTipo}
            className="gap-2"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? "Gerando..." : "Gerar Justificativa"}
          </Button>
        </div>

        <LaudoTextareaAIField
          id="nexoCausalJustificativa"
          label="Justificativa do Nexo"
          value={currentLaudo.nexoCausalJustificativa}
          onChange={(value) => updateLaudo({ nexoCausalJustificativa: value })}
          placeholder="Selecione o tipo de nexo acima e clique em Gerar Justificativa, ou redija manualmente."
          rows={8}
          enableEnhance={true}
          enableRegenerate={false}
          fieldKey="nexoCausalJustificativa"
          laudoId={currentLaudo.id}
          hasPdfSource={false}
        />
      </CardContent>
    </Card>
  );
}
