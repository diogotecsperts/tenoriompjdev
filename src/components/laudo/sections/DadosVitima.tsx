import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DadosVitima() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return "";
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age.toString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Vítima</CardTitle>
        <CardDescription>
          Informações pessoais e profissionais da pessoa periciada
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vitimaName">Nome Completo</Label>
          <Input
            id="vitimaName"
            value={currentLaudo.vitimaName}
            onChange={(e) => updateLaudo({ vitimaName: e.target.value })}
            placeholder="Nome completo da vítima"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="vitimaEscolaridade">Escolaridade</Label>
            <Select
              value={currentLaudo.vitimaEscolaridade}
              onValueChange={(value) => updateLaudo({ vitimaEscolaridade: value })}
            >
              <SelectTrigger id="vitimaEscolaridade">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fundamental">Ensino Fundamental</SelectItem>
                <SelectItem value="medio">Ensino Médio</SelectItem>
                <SelectItem value="superior">Ensino Superior</SelectItem>
                <SelectItem value="pos">Pós-graduação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vitimaNascimento">Data de Nascimento</Label>
            <Input
              id="vitimaNascimento"
              type="date"
              value={currentLaudo.vitimaNascimento}
              onChange={(e) => updateLaudo({ vitimaNascimento: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="vitimaProfissao">Profissão</Label>
            <Input
              id="vitimaProfissao"
              value={currentLaudo.vitimaProfissao}
              onChange={(e) => updateLaudo({ vitimaProfissao: e.target.value })}
              placeholder="Profissão exercida"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vitimaIdade">Idade (Calculada)</Label>
            <Input
              id="vitimaIdade"
              value={calculateAge(currentLaudo.vitimaNascimento)}
              disabled
              placeholder="Automática"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vitimaDominancia">Dominância Manual</Label>
          <Select
            value={currentLaudo.vitimaDominancia}
            onValueChange={(value) => updateLaudo({ vitimaDominancia: value })}
          >
            <SelectTrigger id="vitimaDominancia">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="destro">Destro</SelectItem>
              <SelectItem value="canhoto">Canhoto</SelectItem>
              <SelectItem value="ambidestro">Ambidestro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
