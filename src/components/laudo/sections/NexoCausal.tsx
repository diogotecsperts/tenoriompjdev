import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NexoCausal() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nexo Causal</CardTitle>
        <CardDescription>
          Análise da relação entre a lesão/doença e o acidente/condições de trabalho
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nexoCausalTipo">Tipo de Nexo</Label>
          <Select
            value={currentLaudo.nexoCausalTipo}
            onValueChange={(value) => updateLaudo({ nexoCausalTipo: value })}
          >
            <SelectTrigger id="nexoCausalTipo">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direto">Nexo Causal Direto</SelectItem>
              <SelectItem value="concausa">Concausa</SelectItem>
              <SelectItem value="agravamento">Agravamento</SelectItem>
              <SelectItem value="sem-nexo">Sem Nexo Causal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nexoCausalJustificativa">Justificativa</Label>
          <Textarea
            id="nexoCausalJustificativa"
            value={currentLaudo.nexoCausalJustificativa}
            onChange={(e) => updateLaudo({ nexoCausalJustificativa: e.target.value })}
            placeholder="Fundamente tecnicamente a conclusão sobre o nexo causal, citando evidências clínicas, documentais e literatura médica relevante..."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
