import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function DescricaoTecnicaDoencas() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [loading, setLoading] = useState(false);

  if (!currentLaudo) return null;

  const gerarDescricao = async () => {
    if (!currentLaudo.conclusaoCID?.trim()) {
      toast({
        variant: "destructive",
        title: "CID não informado",
        description: "Preencha o campo de CID na seção Conclusão antes de gerar a descrição.",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'descricao_doencas',
          contexto: {
            cids: currentLaudo.conclusaoCID,
            postoTrabalho: currentLaudo.descricaoPostoTrabalho,
            atividadesLaborais: currentLaudo.descricaoAtividadesLaborais,
            historicoOcupacional: currentLaudo.historicoOcupacional,
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        updateLaudo({ descricaoTecnicaDoencas: data.texto });
        toast({
          title: "Descrição gerada",
          description: "A descrição técnica das doenças foi gerada com sucesso.",
        });
      }
    } catch (error: any) {
      console.error('Erro ao gerar descrição:', error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar descrição",
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
            <CardTitle>Descrição Técnica das Doenças</CardTitle>
            <CardDescription>
              Descrição técnica detalhada das patologias identificadas, incluindo CID, definição, etiologia e características
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={gerarDescricao}
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
          <Label htmlFor="descricaoTecnicaDoencas">Descrição Técnica</Label>
          <Textarea
            id="descricaoTecnicaDoencas"
            value={currentLaudo.descricaoTecnicaDoencas || ""}
            onChange={(e) => updateLaudo({ descricaoTecnicaDoencas: e.target.value })}
            placeholder={`Exemplo:

TENDINITE DO SUPRAESPINHOSO (CID-10: M75.1)
A tendinite do supraespinhoso é uma condição inflamatória que afeta o tendão do músculo supraespinhoso, localizado no ombro. Este tendão faz parte do manguito rotador e é essencial para a elevação e rotação do braço.

Etiologia: A tendinite do supraespinhoso pode ser causada por uso excessivo, especialmente em atividades que requerem movimentos repetitivos de elevação do braço, como ocorre em determinadas profissões...

Sintomas: Dor no ombro, especialmente ao levantar o braço acima da cabeça, fraqueza muscular, dificuldade para dormir sobre o lado afetado...`}
            rows={12}
          />
        </div>
      </CardContent>
    </Card>
  );
}
