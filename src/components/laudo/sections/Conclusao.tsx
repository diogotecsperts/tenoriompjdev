import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Conclusao() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conclusão do Laudo</CardTitle>
        <CardDescription>
          Conclusões finais sobre diagnóstico, incapacidade e recomendações
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="conclusaoCID">Sugestão de CID</Label>
          <Input
            id="conclusaoCID"
            value={currentLaudo.conclusaoCID}
            onChange={(e) => updateLaudo({ conclusaoCID: e.target.value })}
            placeholder="Ex: M75.1 - Síndrome do Manguito Rotador"
          />
          </div>
          <div className="space-y-2">
            <Label>Possui Incapacidade?</Label>
            <RadioGroup
              value={currentLaudo.conclusaoIncapacidade}
              onValueChange={(value) => updateLaudo({ conclusaoIncapacidade: value })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sim" id="incap-sim" />
                <Label htmlFor="incap-sim" className="font-normal cursor-pointer">
                  Sim
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nao" id="incap-nao" />
                <Label htmlFor="incap-nao" className="font-normal cursor-pointer">
                  Não
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="conclusaoAnalise">Análise Conclusiva</Label>
          <Textarea
            id="conclusaoAnalise"
            value={currentLaudo.conclusaoAnalise}
            onChange={(e) => updateLaudo({ conclusaoAnalise: e.target.value })}
            placeholder="Síntese dos achados, diagnóstico final, análise crítica dos elementos avaliados..."
            rows={6}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="conclusaoStatus">Status da Incapacidade</Label>
          <Select
            value={currentLaudo.conclusaoStatus}
            onValueChange={(value) => updateLaudo({ conclusaoStatus: value })}
          >
            <SelectTrigger id="conclusaoStatus">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total-temp">Total Temporária</SelectItem>
              <SelectItem value="parcial-temp">Parcial Temporária</SelectItem>
              <SelectItem value="total-perm">Total Permanente</SelectItem>
              <SelectItem value="parcial-perm">Parcial Permanente</SelectItem>
              <SelectItem value="nenhuma">Sem Incapacidade</SelectItem>
            </SelectContent>
          </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="conclusaoDestino">Destino Sugerido</Label>
            <Select
              value={currentLaudo.conclusaoDestino}
              onValueChange={(value) => updateLaudo({ conclusaoDestino: value })}
            >
              <SelectTrigger id="conclusaoDestino">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta Médica</SelectItem>
                <SelectItem value="reabilitacao">Reabilitação Profissional</SelectItem>
                <SelectItem value="readaptacao">Readaptação de Função</SelectItem>
                <SelectItem value="aposentadoria">Aposentadoria por Invalidez</SelectItem>
                <SelectItem value="tratamento">Continuidade de Tratamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="conclusaoJustificativa">Justificativa da Conclusão</Label>
          <Textarea
            id="conclusaoJustificativa"
            value={currentLaudo.conclusaoJustificativa}
            onChange={(e) => updateLaudo({ conclusaoJustificativa: e.target.value })}
            placeholder="Fundamente a conclusão sobre a incapacidade, grau de comprometimento e limitações funcionais..."
            rows={5}
          />
        </div>
      </CardContent>
    </Card>
  );
}
