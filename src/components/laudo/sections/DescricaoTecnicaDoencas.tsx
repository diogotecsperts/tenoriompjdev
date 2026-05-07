import { useState, useEffect } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function DescricaoTecnicaDoencas() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [cidValue, setCidValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setCidValue("");
  }, [currentLaudo?.id]);

  if (!currentLaudo) return null;

  const cidsSelecionados = currentLaudo.cidsSelecionados ?? [];

  const parseCidsInput = (raw: string): string[] => {
    return raw
      .split(/[,;\n]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length > 0);
  };

  const addCidsFromInput = () => {
    const novos = parseCidsInput(cidValue);
    if (novos.length === 0) return;
    const existentes = new Set(cidsSelecionados.map((c) => c.codigo.toUpperCase()));
    const merged = [
      ...cidsSelecionados,
      ...novos
        .filter((codigo) => !existentes.has(codigo))
        .map((codigo) => ({ codigo })),
    ];
    updateLaudo({ cidsSelecionados: merged });
    setCidValue("");
  };

  const removeCid = (codigo: string) => {
    updateLaudo({
      cidsSelecionados: cidsSelecionados.filter(
        (c) => c.codigo.toUpperCase() !== codigo.toUpperCase()
      ),
    });
  };

  const handleGenerateCidDescription = async () => {
    // Permitir gerar com base na lista persistida OU no input atual
    const fromInput = parseCidsInput(cidValue);
    const cidsParaEnviar = fromInput.length > 0
      ? fromInput
      : cidsSelecionados.map((c) => c.codigo);

    if (cidsParaEnviar.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum CID informado",
        description: "Digite um ou mais códigos CID (separe por vírgula) ou adicione na lista antes de gerar.",
      });
      return;
    }

    // Se veio do input, persiste antes de chamar a IA
    if (fromInput.length > 0) {
      const existentes = new Set(cidsSelecionados.map((c) => c.codigo.toUpperCase()));
      const merged = [
        ...cidsSelecionados,
        ...fromInput
          .filter((codigo) => !existentes.has(codigo))
          .map((codigo) => ({ codigo })),
      ];
      updateLaudo({ cidsSelecionados: merged });
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-justificativa-medica', {
        body: {
          laudoId: currentLaudo.id,
          campo: 'cid_descricao',
          cidsManuais: cidsParaEnviar,
        }
      });

      if (error) throw error;

      if (data?.texto) {
        const existingContent = currentLaudo.descricaoTecnicaDoencas || '';
        const separator = existingContent.trim() ? '\n\n---\n\n' : '';
        const newContent = existingContent + separator + data.texto;
        updateLaudo({ descricaoTecnicaDoencas: newContent });
        setCidValue("");
        toast({
          title: "Descrição gerada",
          description: `Descrição técnica adicionada para: ${cidsParaEnviar.join(', ')}.`,
        });
      }
    } catch (error) {
      console.error("Erro ao gerar descrição de CID:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar descrição",
        description: error instanceof Error ? error.message : "Erro desconhecido.",
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
          Você (médico) digita os CIDs aplicáveis. A IA apenas redige a descrição técnica dos códigos informados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-end gap-2">
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
                  if (e.key === 'Enter' && cidValue.trim()) {
                    e.preventDefault();
                    addCidsFromInput();
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addCidsFromInput}
              disabled={!cidValue.trim()}
              className="gap-1 h-9"
              type="button"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateCidDescription}
              disabled={isGenerating || (cidsSelecionados.length === 0 && !cidValue.trim())}
              className="gap-2 h-9"
              type="button"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? "Gerando..." : "Gerar Descrição"}
            </Button>
          </div>

          {cidsSelecionados.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cidsSelecionados.map((cid) => (
                <Badge key={cid.codigo} variant="secondary" className="gap-1 pr-1">
                  <span>{cid.codigo}</span>
                  <button
                    type="button"
                    onClick={() => removeCid(cid.codigo)}
                    className="rounded-full p-0.5 hover:bg-destructive/20"
                    aria-label={`Remover ${cid.codigo}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <LaudoTextareaAIField
          id="descricaoTecnicaDoencas"
          label="Descrição Técnica"
          value={currentLaudo.descricaoTecnicaDoencas || ""}
          onChange={(value) => updateLaudo({ descricaoTecnicaDoencas: value })}
          placeholder="Adicione CIDs acima e clique em Gerar Descrição. O texto técnico será acumulado neste campo."
          rows={12}
          enableEnhance={true}
          enableRegenerate={false}
          fieldKey="descricaoTecnicaDoencas"
          laudoId={currentLaudo.id}
          hasPdfSource={false}
        />
      </CardContent>
    </Card>
  );
}
