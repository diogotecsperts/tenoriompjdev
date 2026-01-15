import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";
import { toast } from "@/hooks/use-toast";
import { Replace, Loader2 } from "lucide-react";

// Fields that should be searched for SID replacement
const SID_REPLACEABLE_FIELDS = [
  'descricaoTecnicaDoencas',
  'conclusaoCID',
  'conclusaoAnalise',
  'nexoCausalJustificativa',
  'analiseIncapacidadeLaboral',
  'exameFisico',
  'examesComplementares',
  'laudosMedicos',
  'antecedentes',
  'tratamentos',
  'historiaAtual',
  'historicoOcupacional',
  'resumoPeticaoInicial',
  'resumoContestacao',
] as const;

export function DescricaoTecnicaDoencas() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [sidValue, setSidValue] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  if (!currentLaudo) return null;

  // Check if laudo has PDF source for regeneration
  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.pdfFilePath || 
                       !!(currentLaudo.aiMetadata as any)?.importJobId;

  const handleApplySid = () => {
    if (!sidValue.trim()) {
      toast({
        variant: "destructive",
        title: "SID não informado",
        description: "Digite o código SID antes de aplicar.",
      });
      return;
    }

    setIsApplying(true);

    try {
      // Regex patterns to match SID variations: {SID}, {{SID}}, or SID as isolated word
      const patterns = [
        /\{SID\}/gi,
        /\{\{SID\}\}/gi,
        /\bSID\b/g, // Word boundary to avoid replacing partial matches
      ];

      let replacementsCount = 0;
      const updates: Partial<typeof currentLaudo> = {};

      SID_REPLACEABLE_FIELDS.forEach((field) => {
        const fieldValue = (currentLaudo as any)[field];
        if (typeof fieldValue === 'string' && fieldValue) {
          let newValue = fieldValue;
          patterns.forEach((pattern) => {
            const matches = newValue.match(pattern);
            if (matches) {
              replacementsCount += matches.length;
              newValue = newValue.replace(pattern, sidValue.trim());
            }
          });
          if (newValue !== fieldValue) {
            (updates as any)[field] = newValue;
          }
        }
      });

      if (Object.keys(updates).length > 0) {
        updateLaudo(updates);
        toast({
          title: "SID aplicado",
          description: `${replacementsCount} ocorrência(s) de "SID" substituída(s) por "${sidValue.trim()}".`,
        });
      } else {
        toast({
          title: "Nenhuma ocorrência encontrada",
          description: "Não foi encontrado 'SID' nos campos do laudo.",
        });
      }
    } catch (error) {
      console.error("Erro ao aplicar SID:", error);
      toast({
        variant: "destructive",
        title: "Erro ao aplicar SID",
        description: "Ocorreu um erro ao substituir o SID.",
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Descrição Técnica das Doenças</CardTitle>
        <CardDescription>
          Descrição técnica detalhada das patologias identificadas, incluindo CID, definição, etiologia e características
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SID Input Section */}
        <div className="flex items-end gap-2 p-3 bg-muted/50 rounded-lg border">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="sidInput" className="text-sm font-medium">
              Inserir SID
            </Label>
            <Input
              id="sidInput"
              value={sidValue}
              onChange={(e) => setSidValue(e.target.value)}
              placeholder="Ex: M75.1"
              className="h-9"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleApplySid}
            disabled={isApplying || !sidValue.trim()}
            className="gap-2 h-9"
          >
            {isApplying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Replace className="h-4 w-4" />
            )}
            Aplicar
          </Button>
        </div>

        <LaudoTextareaAIField
          id="descricaoTecnicaDoencas"
          label="Descrição Técnica"
          value={currentLaudo.descricaoTecnicaDoencas || ""}
          onChange={(value) => updateLaudo({ descricaoTecnicaDoencas: value })}
          placeholder={`Exemplo:

TENDINITE DO SUPRAESPINHOSO (CID-10: M75.1)
A tendinite do supraespinhoso é uma condição inflamatória que afeta o tendão do músculo supraespinhoso, localizado no ombro. Este tendão faz parte do manguito rotador e é essencial para a elevação e rotação do braço.

Etiologia: A tendinite do supraespinhoso pode ser causada por uso excessivo, especialmente em atividades que requerem movimentos repetitivos de elevação do braço, como ocorre em determinadas profissões...

Sintomas: Dor no ombro, especialmente ao levantar o braço acima da cabeça, fraqueza muscular, dificuldade para dormir sobre o lado afetado...`}
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
