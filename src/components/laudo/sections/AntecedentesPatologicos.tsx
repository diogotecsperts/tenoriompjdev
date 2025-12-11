import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AntecedentesPatologicos() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Antecedentes Patológicos</CardTitle>
        <CardDescription>
          Histórico médico pessoal, familiar, tratamentos realizados e afastamentos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="antecedentes">Antecedentes Pessoais e Familiares</Label>
          <Textarea
            id="antecedentes"
            value={currentLaudo.antecedentes}
            onChange={(e) => updateLaudo({ antecedentes: e.target.value })}
            placeholder="Doenças prévias, cirurgias anteriores, alergias, histórico familiar relevante..."
            rows={5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tratamentos">Tratamentos Realizados</Label>
          <Textarea
            id="tratamentos"
            value={currentLaudo.tratamentos}
            onChange={(e) => updateLaudo({ tratamentos: e.target.value })}
            placeholder="Medicações utilizadas, fisioterapia, cirurgias, procedimentos realizados..."
            rows={5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="afastamentos">Afastamentos do Trabalho</Label>
          <Textarea
            id="afastamentos"
            value={currentLaudo.afastamentos}
            onChange={(e) => updateLaudo({ afastamentos: e.target.value })}
            placeholder="Períodos de afastamento, benefícios recebidos (auxílio-doença, auxílio-acidente)..."
            rows={4}
          />
        </div>
      </CardContent>
    </Card>
  );
}
