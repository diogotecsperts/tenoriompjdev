import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function AnaliseIncapacidade() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [loading, setLoading] = useState(false);

  if (!currentLaudo) return null;

  const gerarAnalise = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'incapacidade',
          contexto: {
            cids: currentLaudo.conclusaoCID,
            exameFisico: currentLaudo.exameFisico,
            examesComplementares: currentLaudo.examesComplementares,
            tratamentos: currentLaudo.tratamentos,
            atividadesLaborais: currentLaudo.descricaoAtividadesLaborais,
            postoTrabalho: currentLaudo.descricaoPostoTrabalho,
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        updateLaudo({ analiseIncapacidadeLaboral: data.texto });
        toast({
          title: "Análise gerada",
          description: "A análise da incapacidade laboral foi gerada com sucesso.",
        });
      }
    } catch (error: any) {
      console.error('Erro ao gerar análise:', error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar análise",
        description: error.message || "Tente novamente mais tarde.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Análise da Incapacidade Laboral</CardTitle>
            <CardDescription>
              Avaliação técnica da capacidade laboral do periciando
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={gerarAnalise}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Gerar com IA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="analiseIncapacidadeLaboral">Análise</Label>
          <Textarea
            id="analiseIncapacidadeLaboral"
            value={currentLaudo.analiseIncapacidadeLaboral || ""}
            onChange={(e) => updateLaudo({ analiseIncapacidadeLaboral: e.target.value })}
            placeholder={`Analise a capacidade laboral do periciando considerando:

- Tipo de incapacidade (parcial/total, temporária/permanente)
- Limitações funcionais identificadas
- Compatibilidade com a função exercida
- Possibilidade de reabilitação profissional
- Necessidade de readaptação de função
- Impacto nas atividades de vida diária...`}
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
