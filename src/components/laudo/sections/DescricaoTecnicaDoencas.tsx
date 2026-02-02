import { useState, useEffect } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function DescricaoTecnicaDoencas() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [cidValue, setCidValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Reset estado local quando trocar de laudo (corrige bug de vazamento de dados)
  useEffect(() => {
    setCidValue("");
  }, [currentLaudo?.id]);

  if (!currentLaudo) return null;

  // Check if laudo has PDF source for regeneration
  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.pdfFilePath || 
                       !!(currentLaudo.aiMetadata as any)?.importJobId;

  // Nova lógica: Gerar descrição técnica via IA para os CIDs inseridos
  const handleGenerateCidDescription = async () => {
    if (!cidValue.trim()) {
      toast({
        variant: "destructive",
        title: "CID não informado",
        description: "Digite um ou mais códigos CID separados por vírgula (ex: M54.5, G56.0)",
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Chama a edge function para gerar descrição técnica dos CIDs
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'descricao_cid',
          contexto: {
            cids: cidValue.trim(),
            postoTrabalho: currentLaudo.descricaoAtividadesLaborais || '',
            historicoOcupacional: currentLaudo.historicoOcupacional || '',
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        // APPEND: Adiciona o novo texto ao final do campo existente
        const existingContent = currentLaudo.descricaoTecnicaDoencas || '';
        const separator = existingContent.trim() ? '\n\n---\n\n' : '';
        const newContent = existingContent + separator + data.texto;
        
        updateLaudo({ descricaoTecnicaDoencas: newContent });
        
        // Limpa o campo de CID após sucesso
        setCidValue("");
        
        toast({
          title: "Descrição gerada com sucesso",
          description: `Descrição técnica dos CIDs (${cidValue.trim()}) adicionada ao campo.`,
        });
      }
    } catch (error) {
      console.error("Erro ao gerar descrição de CID:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar descrição",
        description: error instanceof Error ? error.message : "Erro desconhecido ao buscar informações do CID.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Descrição Técnica das Doenças</CardTitle>
        <CardDescription>
          Insira os códigos CID para gerar automaticamente a descrição técnica das patologias
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CID Input Section - Nova lógica com geração via IA */}
        <div className="flex items-end gap-2 p-3 bg-muted/50 rounded-lg border">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="cidInput" className="text-sm font-medium">
              Inserir CID(s)
            </Label>
            <Input
              id="cidInput"
              value={cidValue}
              onChange={(e) => setCidValue(e.target.value)}
              placeholder="Ex: M54.5, G56.0, M75.1"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating && cidValue.trim()) {
                  handleGenerateCidDescription();
                }
              }}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateCidDescription}
            disabled={isGenerating || !cidValue.trim()}
            className="gap-2 h-9"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? "Gerando..." : "Gerar Descrição"}
          </Button>
        </div>

        <LaudoTextareaAIField
          id="descricaoTecnicaDoencas"
          label="Descrição Técnica"
          value={currentLaudo.descricaoTecnicaDoencas || ""}
          onChange={(value) => updateLaudo({ descricaoTecnicaDoencas: value })}
          placeholder="Use o campo acima para inserir códigos CID e gerar automaticamente a descrição técnica das doenças. Cada CID adicionado será empilhado aqui com sua definição, etiologia e características clínicas."
          rows={12}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="descricaoTecnicaDoencas"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
