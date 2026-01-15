import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

const METODOLOGIA_PADRAO = `Este laudo foi elaborado com base no estudo das peças contidas nos autos do processo; exame pericial do(a) reclamante, conforme parâmetros técnicos utilizados pela especialidade de Medicina do Trabalho. Análise criteriosa e imparcial das informações coligidas durante a perícia e nos autos do processo, que é exigida pelo CÓDIGO DE ÉTICA MÉDICA (Res. CFM 2.217/2018), em seus artigos 93 e 98. A literatura especializada que serviu de embasamento técnico científico das conclusões está relacionada nas referências bibliográficas (ao final).`;

export function MetodologiaPericial() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const handleRestaurarPadrao = () => {
    updateLaudo({ metodologiaPericial: METODOLOGIA_PADRAO });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metodologia Pericial</CardTitle>
        <CardDescription>
          Descrição da metodologia utilizada na elaboração do laudo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-end mb-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRestaurarPadrao}
              className="h-8 text-xs"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Restaurar padrão
            </Button>
          </div>
          <LaudoTextareaAIField
            id="metodologiaPericial"
            label="Metodologia"
            value={currentLaudo.metodologiaPericial || ""}
            onChange={(value) => updateLaudo({ metodologiaPericial: value })}
            placeholder="Descreva a metodologia utilizada para elaboração do laudo..."
            rows={6}
            enableEnhance={true}
            enableRegenerate={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}
