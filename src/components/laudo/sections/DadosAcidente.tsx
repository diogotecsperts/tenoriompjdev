import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DadosAcidente() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Acidente</CardTitle>
        <CardDescription>
          Histórico ocupacional e relato detalhado do acidente de trabalho
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="historicoOcupacional">Histórico Ocupacional</Label>
          <Textarea
            id="historicoOcupacional"
            value={currentLaudo.historicoOcupacional}
            onChange={(e) => updateLaudo({ historicoOcupacional: e.target.value })}
            placeholder="Descreva a trajetória profissional, funções exercidas, tempo de serviço e condições de trabalho..."
            rows={6}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="historiaAcidente">História do Acidente</Label>
          <Textarea
            id="historiaAcidente"
            value={currentLaudo.historiaAcidente}
            onChange={(e) => updateLaudo({ historiaAcidente: e.target.value })}
            placeholder="Relate detalhadamente como ocorreu o acidente, circunstâncias, mecanismo de trauma, local e testemunhas..."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
