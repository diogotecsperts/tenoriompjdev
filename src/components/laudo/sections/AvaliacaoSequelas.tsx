import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AvaliacaoSequelas() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliação das Sequelas</CardTitle>
        <CardDescription>
          Análise de sequelas permanentes, dano estético e necessidade de auxílio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tabelaSUSEP">Tabela SUSEP/DPVAT</Label>
          <Textarea
            id="tabelaSUSEP"
            value={currentLaudo.tabelaSUSEP}
            onChange={(e) => updateLaudo({ tabelaSUSEP: e.target.value })}
            placeholder="Descreva o percentual de invalidez conforme tabela SUSEP/DPVAT, especificando o item aplicável..."
            rows={5}
          />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="danoEstetico">Dano Estético</Label>
          <Textarea
            id="danoEstetico"
            value={currentLaudo.danoEstetico}
            onChange={(e) => updateLaudo({ danoEstetico: e.target.value })}
            placeholder="Avalie a existência e grau de dano estético (leve, moderado, grave), descrevendo cicatrizes, deformidades..."
            rows={5}
          />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="auxilioTerceiros">Necessidade de Auxílio de Terceiros</Label>
          <Textarea
            id="auxilioTerceiros"
            value={currentLaudo.auxilioTerceiros}
            onChange={(e) => updateLaudo({ auxilioTerceiros: e.target.value })}
            placeholder="Avalie se o periciando necessita de auxílio permanente de terceiros para atividades da vida diária..."
            rows={5}
          />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
