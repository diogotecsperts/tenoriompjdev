import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DadosPerito() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Perito</CardTitle>
        <CardDescription>
          Informações profissionais do médico perito responsável pelo laudo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="peritoNome">Nome Completo</Label>
            <Input
              id="peritoNome"
              value={currentLaudo.peritoNome}
              onChange={(e) => updateLaudo({ peritoNome: e.target.value })}
              placeholder="Dr. Nome do Perito"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="peritoEspecialidade">Especialidade</Label>
            <Input
              id="peritoEspecialidade"
              value={currentLaudo.peritoEspecialidade}
              onChange={(e) => updateLaudo({ peritoEspecialidade: e.target.value })}
              placeholder="Ex: Ortopedia"
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="peritoCRM">CRM</Label>
            <Input
              id="peritoCRM"
              value={currentLaudo.peritoCRM}
              onChange={(e) => updateLaudo({ peritoCRM: e.target.value })}
              placeholder="123456/UF"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="peritoTelefone">Telefone</Label>
            <Input
              id="peritoTelefone"
              value={currentLaudo.peritoTelefone}
              onChange={(e) => updateLaudo({ peritoTelefone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="peritoEmail">E-mail</Label>
          <Input
            id="peritoEmail"
            type="email"
            value={currentLaudo.peritoEmail}
            onChange={(e) => updateLaudo({ peritoEmail: e.target.value })}
            placeholder="perito@email.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="peritoEndereco">Endereço Completo</Label>
          <Input
            id="peritoEndereco"
            value={currentLaudo.peritoEndereco}
            onChange={(e) => updateLaudo({ peritoEndereco: e.target.value })}
            placeholder="Rua, número, complemento, cidade - UF"
          />
        </div>
      </CardContent>
    </Card>
  );
}
