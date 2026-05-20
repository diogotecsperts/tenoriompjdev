import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ReferenciasBibliograficas() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [isLoading, setIsLoading] = useState(false);

  if (!currentLaudo) return null;

  const handleGerarReferencias = async () => {
    if (!currentLaudo.id) {
      toast.error("Salve o laudo antes de gerar as referências.");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-justificativa-medica', {
        body: {
          laudoId: currentLaudo.id,
          campo: 'referencias',
        }
      });

      if (error) {
        // Edge function pode retornar 400 com message contextual
        const msg = (error as any)?.context?.error || (error as any)?.message || 'Erro ao gerar referências.';
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.texto) {
        updateLaudo({ referenciasBibliograficas: data.texto });
        toast.success('Referências geradas com sucesso!');
      } else {
        throw new Error('Resposta vazia da IA');
      }
    } catch (error) {
      console.error('Erro ao gerar referências:', error);
      const message = error instanceof Error ? error.message : 'Erro ao gerar referências. Tente novamente.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referências Bibliográficas</CardTitle>
        <CardDescription>
          Clique em "Gerar Referências" para que a IA produza referências reais e específicas ao contexto clínico do laudo. A IA usa CIDs, Anamnese, Exame Físico e Conclusão como contexto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="referenciasBibliograficas">Referências</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGerarReferencias}
              disabled={isLoading}
              className="h-8 text-xs"
            >
              {isLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Gerar Referências
            </Button>
          </div>
          <Textarea
            id="referenciasBibliograficas"
            value={currentLaudo.referenciasBibliograficas || ""}
            onChange={(e) => updateLaudo({ referenciasBibliograficas: e.target.value })}
            placeholder="Preencha ao menos os CIDs ou a Conclusão e clique em Gerar Referências, ou redija manualmente."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
