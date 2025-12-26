import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function NexoCausal() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [loading, setLoading] = useState(false);

  if (!currentLaudo) return null;

  const gerarAnalise = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'nexo_causal',
          contexto: {
            cids: currentLaudo.conclusaoCID,
            postoTrabalho: currentLaudo.descricaoPostoTrabalho,
            atividadesLaborais: currentLaudo.descricaoAtividadesLaborais,
            historicoOcupacional: currentLaudo.historicoOcupacional,
            historiaAcidente: currentLaudo.historiaAcidente,
            historiaAtual: currentLaudo.historiaAtual,
            exameFisico: currentLaudo.exameFisico,
            examesComplementares: currentLaudo.examesComplementares,
            antecedentes: currentLaudo.antecedentes,
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        updateLaudo({ nexoCausalJustificativa: data.texto });
        toast({
          title: "Análise gerada",
          description: "A análise do nexo causal foi gerada com sucesso.",
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
            <CardTitle>Nexo Causal</CardTitle>
            <CardDescription>
              Análise da relação entre a lesão/doença e o acidente/condições de trabalho
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
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nexoCausalTipo">Tipo de Nexo</Label>
          <Select
            value={currentLaudo.nexoCausalTipo}
            onValueChange={(value) => updateLaudo({ nexoCausalTipo: value })}
          >
            <SelectTrigger id="nexoCausalTipo">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direto">Nexo Causal Direto</SelectItem>
              <SelectItem value="concausa">Concausa</SelectItem>
              <SelectItem value="agravamento">Agravamento</SelectItem>
              <SelectItem value="sem-nexo">Sem Nexo Causal</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nexoCausalJustificativa">Justificativa</Label>
          <Textarea
            id="nexoCausalJustificativa"
            value={currentLaudo.nexoCausalJustificativa}
            onChange={(e) => updateLaudo({ nexoCausalJustificativa: e.target.value })}
            placeholder="Fundamente tecnicamente a conclusão sobre o nexo causal, citando evidências clínicas, documentais e literatura médica relevante..."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
