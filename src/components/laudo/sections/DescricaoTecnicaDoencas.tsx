import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DescricaoTecnicaDoencas() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Descrição Técnica das Doenças</CardTitle>
        <CardDescription>
          Descrição técnica detalhada das patologias identificadas, incluindo CID, definição, etiologia e características
        </CardDescription>
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
