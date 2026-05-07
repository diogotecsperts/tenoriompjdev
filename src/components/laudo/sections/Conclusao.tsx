import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function Conclusao() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [isGenerating, setIsGenerating] = useState(false);

  if (!currentLaudo) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // 1) Conclusão
      const concl = await supabase.functions.invoke('gerar-justificativa-medica', {
        body: { laudoId: currentLaudo.id, campo: 'conclusao' }
      });
      if (concl.error) throw concl.error;
      const textoConclusao = (concl.data as any)?.texto || '';

      // 2) Destino sugerido
      const dest = await supabase.functions.invoke('gerar-justificativa-medica', {
        body: { laudoId: currentLaudo.id, campo: 'destino' }
      });
      const textoDestino = !dest.error ? ((dest.data as any)?.texto || '') : '';

      const updates: Partial<typeof currentLaudo> = {};
      if (textoConclusao) updates.conclusaoAnalise = textoConclusao;
      if (textoDestino) updates.conclusaoDestino = textoDestino;

      if (Object.keys(updates).length > 0) {
        updateLaudo(updates);
        toast({
          title: "Conclusão gerada",
          description: "Texto final amarrando suas decisões clínicas.",
        });
      }
    } catch (err) {
      console.error("Erro ao gerar conclusão:", err);
      toast({
        variant: "destructive",
        title: "Erro ao gerar conclusão",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conclusão do Laudo</CardTitle>
        <CardDescription>
          Conclusões finais sobre diagnóstico e recomendações. Use Gerar Conclusão depois de definir CIDs, Nexo e Incapacidade.
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

        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-2"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? "Gerando..." : "Gerar Conclusão"}
          </Button>
        </div>

        <LaudoTextareaAIField
          id="conclusaoAnalise"
          label="Análise Conclusiva"
          value={currentLaudo.conclusaoAnalise}
          onChange={(value) => updateLaudo({ conclusaoAnalise: value })}
          placeholder="Síntese dos achados, diagnóstico final, análise crítica dos elementos avaliados..."
          rows={6}
          enableEnhance={true}
          enableRegenerate={false}
          fieldKey="conclusaoAnalise"
          laudoId={currentLaudo.id}
          hasPdfSource={false}
        />
      </CardContent>
    </Card>
  );
}
