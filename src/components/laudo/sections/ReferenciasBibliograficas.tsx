import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

const REFERENCIAS_PADRAO = `- BARROS, B. T. Perícia Médica. São Paulo: Editora LTR, 2023.
- BRASIL. Ministério do Trabalho e Emprego. Normas Regulamentadoras.
- MENDES, René. Patologia do trabalho. São Paulo: Atheneu, 2005.
- VIEIRA, Sebastião Ivone. Manual de saúde e segurança do trabalho. São Paulo: LTr, 2005.
- OMS. Classificação Internacional de Doenças - CID-10.
- CFM. Código de Ética Médica - Resolução CFM 2.217/2018.`;

export function ReferenciasBibliograficas() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const handleRestaurarPadrao = () => {
    updateLaudo({ referenciasBibliograficas: REFERENCIAS_PADRAO });
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
              variant="ghost" 
              size="sm" 
              onClick={handleRestaurarPadrao}
              className="h-8 text-xs"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Restaurar padrão
            </Button>
          </div>
          <Textarea
            id="referenciasBibliograficas"
            value={currentLaudo.referenciasBibliograficas || ""}
            onChange={(e) => updateLaudo({ referenciasBibliograficas: e.target.value })}
            placeholder="Liste as referências bibliográficas utilizadas..."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
