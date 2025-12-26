import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function ResumoAutos() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [loadingPeticao, setLoadingPeticao] = useState(false);
  const [loadingContestacao, setLoadingContestacao] = useState(false);

  if (!currentLaudo) return null;

  const gerarResumoPeticao = async () => {
    if (!currentLaudo.resumoPeticaoInicial?.trim()) {
      toast({
        variant: "destructive",
        title: "Campo vazio",
        description: "Preencha o texto da petição inicial antes de gerar o resumo.",
      });
      return;
    }

    setLoadingPeticao(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'resumo_peticao',
          contexto: {
            peticaoInicial: currentLaudo.resumoPeticaoInicial,
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        updateLaudo({ resumoPeticaoInicial: data.texto });
        toast({
          title: "Resumo gerado",
          description: "O resumo da petição inicial foi gerado com sucesso.",
        });
      }
    } catch (error: any) {
      console.error('Erro ao gerar resumo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar resumo",
        description: error.message || "Tente novamente mais tarde.",
      });
    } finally {
      setLoadingPeticao(false);
    }
  };

  const gerarResumoContestacao = async () => {
    if (!currentLaudo.resumoContestacao?.trim()) {
      toast({
        variant: "destructive",
        title: "Campo vazio",
        description: "Preencha o texto da contestação antes de gerar o resumo.",
      });
      return;
    }

    setLoadingContestacao(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'resumo_contestacao',
          contexto: {
            contestacao: currentLaudo.resumoContestacao,
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        updateLaudo({ resumoContestacao: data.texto });
        toast({
          title: "Resumo gerado",
          description: "O resumo da contestação foi gerado com sucesso.",
        });
      }
    } catch (error: any) {
      console.error('Erro ao gerar resumo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar resumo",
        description: error.message || "Tente novamente mais tarde.",
      });
    } finally {
      setLoadingContestacao(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo dos Autos</CardTitle>
        <CardDescription>
          Resumo da petição inicial e contestação das partes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="resumoPeticaoInicial">Resumo da Petição Inicial</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={gerarResumoPeticao}
              disabled={loadingPeticao}
              className="gap-2"
            >
              {loadingPeticao ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Gerar com IA
            </Button>
          </div>
          <Textarea
            id="resumoPeticaoInicial"
            value={currentLaudo.resumoPeticaoInicial || ""}
            onChange={(e) => updateLaudo({ resumoPeticaoInicial: e.target.value })}
            placeholder="Cole o texto da petição inicial aqui e clique em 'Gerar com IA' para criar um resumo técnico..."
            rows={6}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="resumoContestacao">Resumo da Contestação</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={gerarResumoContestacao}
              disabled={loadingContestacao}
              className="gap-2"
            >
              {loadingContestacao ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Gerar com IA
            </Button>
          </div>
          <Textarea
            id="resumoContestacao"
            value={currentLaudo.resumoContestacao || ""}
            onChange={(e) => updateLaudo({ resumoContestacao: e.target.value })}
            placeholder="Cole o texto da contestação aqui e clique em 'Gerar com IA' para criar um resumo técnico..."
            rows={6}
          />
        </div>
      </CardContent>
    </Card>
  );
}
