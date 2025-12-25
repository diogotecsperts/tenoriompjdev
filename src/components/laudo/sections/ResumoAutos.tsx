import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResumoAutos() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

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
          <Label htmlFor="resumoPeticaoInicial">Resumo da Petição Inicial</Label>
          <Textarea
            id="resumoPeticaoInicial"
            value={currentLaudo.resumoPeticaoInicial || ""}
            onChange={(e) => updateLaudo({ resumoPeticaoInicial: e.target.value })}
            placeholder="Resuma os principais pontos alegados pelo reclamante na petição inicial..."
            rows={6}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="resumoContestacao">Resumo da Contestação</Label>
          <Textarea
            id="resumoContestacao"
            value={currentLaudo.resumoContestacao || ""}
            onChange={(e) => updateLaudo({ resumoContestacao: e.target.value })}
            placeholder="Resuma os principais pontos alegados pela reclamada em contestação..."
            rows={6}
          />
        </div>
      </CardContent>
    </Card>
  );
}
