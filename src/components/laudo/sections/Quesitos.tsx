import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function Quesitos() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.importJobId || !!(currentLaudo.aiMetadata as any)?.pdfFilePath;
  const hasExistingContent = !!(currentLaudo.quesitosJuizo?.trim()) || !!(currentLaudo.quesitosReclamante?.trim()) || !!(currentLaudo.quesitosReclamada?.trim());

  const handleGenerate = () => {
    if (hasExistingContent) {
      setShowConfirm(true);
    } else {
      executeGeneration();
    }
  };

  const executeGeneration = async () => {
    setShowConfirm(false);
    setIsGenerating(true);

    try {
      // Build context from current form state
      const contexto = {
        cids: currentLaudo.conclusaoCID || "",
        nexoCausal: currentLaudo.nexoCausalJustificativa || "",
        incapacidade: currentLaudo.analiseIncapacidadeLaboral || currentLaudo.conclusaoIncapacidade || "",
        conclusao: currentLaudo.conclusaoAnalise || "",
        historiaAtual: currentLaudo.historiaAtual || "",
        exameFisico: currentLaudo.exameFisico || "",
        examesComplementares: currentLaudo.examesComplementares || "",
        atividadesLaborais: currentLaudo.descricaoAtividadesLaborais || "",
        antecedentes: currentLaudo.antecedentes || "",
        laudosMedicos: currentLaudo.laudosMedicos || "",
      };

      const { data, error } = await supabase.functions.invoke("gerar-quesitos", {
        body: { laudoId: currentLaudo.id, contexto },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      updateLaudo({
        quesitosJuizo: data.quesitosJuizo || "",
        quesitosReclamante: data.quesitosReclamante || "",
        quesitosReclamada: data.quesitosReclamada || "",
      });

      toast({
        title: "Quesitos gerados com sucesso",
        description: "As respostas foram geradas com base nos dados clínicos do laudo.",
      });
    } catch (err: any) {
      console.error("[Quesitos] Generation error:", err);
      toast({
        title: "Erro ao gerar quesitos",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Quesitos</CardTitle>
            <CardDescription>
              Respostas aos quesitos formulados pelo Juízo e pelas partes
            </CardDescription>
          </div>
          {hasPdfSource && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-2"
              size="sm"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? "Gerando..." : "Gerar Respostas dos Quesitos"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="juizo" className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
            <TabsTrigger value="juizo">Do Juízo</TabsTrigger>
            <TabsTrigger value="reclamante">Do Reclamante</TabsTrigger>
            <TabsTrigger value="reclamada">Da Reclamada</TabsTrigger>
          </TabsList>
          <TabsContent value="juizo" className="space-y-2">
            <LaudoTextareaAIField
              id="quesitosJuizo"
              label="Quesitos do Juízo"
              value={currentLaudo.quesitosJuizo || ""}
              onChange={(value) => updateLaudo({ quesitosJuizo: value })}
              placeholder="Cole aqui os quesitos formulados pelo Juízo e suas respectivas respostas..."
              rows={12}
              enableEnhance={true}
              enableRegenerate={false}
              fieldKey="quesitosJuizo"
              laudoId={currentLaudo.id}
              hasPdfSource={hasPdfSource}
            />
          </TabsContent>
          <TabsContent value="reclamante" className="space-y-2">
            <LaudoTextareaAIField
              id="quesitosReclamante"
              label="Quesitos do Reclamante"
              value={currentLaudo.quesitosReclamante || ""}
              onChange={(value) => updateLaudo({ quesitosReclamante: value })}
              placeholder="Cole aqui os quesitos formulados pelo Reclamante e suas respectivas respostas..."
              rows={12}
              enableEnhance={true}
              enableRegenerate={false}
              fieldKey="quesitosReclamante"
              laudoId={currentLaudo.id}
              hasPdfSource={hasPdfSource}
            />
          </TabsContent>
          <TabsContent value="reclamada" className="space-y-2">
            <LaudoTextareaAIField
              id="quesitosReclamada"
              label="Quesitos da Reclamada"
              value={currentLaudo.quesitosReclamada || ""}
              onChange={(value) => updateLaudo({ quesitosReclamada: value })}
              placeholder="Cole aqui os quesitos formulados pela Reclamada e suas respectivas respostas..."
              rows={12}
              enableEnhance={true}
              enableRegenerate={false}
              fieldKey="quesitosReclamada"
              laudoId={currentLaudo.id}
              hasPdfSource={hasPdfSource}
            />
          </TabsContent>
        </Tabs>
      </CardContent>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescrever quesitos existentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Já existem respostas preenchidas nos quesitos. A geração substituirá todo o conteúdo atual dos 3 campos (Juízo, Reclamante e Reclamada). Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeGeneration}>
              Gerar e Sobrescrever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
