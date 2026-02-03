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

  const handleBuscarNovamente = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'referencias_bibliograficas',
          contexto: {
            cids: currentLaudo.conclusaoCID || '',
            postoTrabalho: currentLaudo.descricaoAtividadesLaborais || '',
            atividadesLaborais: currentLaudo.descricaoAtividadesLaborais || '',
            historicoOcupacional: currentLaudo.historicoOcupacional || '',
            tratamentos: currentLaudo.tratamentos || '',
            examesComplementares: currentLaudo.examesComplementares || '',
            nexoCausal: currentLaudo.nexoCausalJustificativa || '',
            conclusao: currentLaudo.conclusaoAnalise || '',
            metodologia: currentLaudo.metodologiaPericial || '',
          }
        }
      });

      if (error) throw error;
      
      if (data?.texto) {
        updateLaudo({ referenciasBibliograficas: data.texto });
        toast.success('Referências atualizadas com sucesso!');
      } else {
        throw new Error('Resposta vazia da IA');
      }
    } catch (error) {
      console.error('Erro ao gerar referências:', error);
      toast.error('Erro ao gerar referências. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referências Bibliográficas</CardTitle>
        <CardDescription>
          Literatura técnico-científica utilizada como embasamento do laudo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="referenciasBibliograficas">Referências</Label>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBuscarNovamente}
              disabled={isLoading}
              className="h-8 text-xs"
            >
              {isLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Buscar novamente
            </Button>
          </div>
          <Textarea
            id="referenciasBibliograficas"
            value={currentLaudo.referenciasBibliograficas || ""}
            onChange={(e) => updateLaudo({ referenciasBibliograficas: e.target.value })}
            placeholder="As referências serão geradas automaticamente após importar um PDF ou clique em 'Buscar novamente'..."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
