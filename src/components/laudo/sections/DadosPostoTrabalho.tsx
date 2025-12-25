import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DadosPostoTrabalho() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Posto de Trabalho</CardTitle>
        <CardDescription>
          Informações funcionais e descrição das atividades laborais
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dados Funcionais */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Dados Funcionais
          </h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dadosFuncionaisCargo">Cargo/Função</Label>
              <Input
                id="dadosFuncionaisCargo"
                value={currentLaudo.dadosFuncionaisCargo || ""}
                onChange={(e) => updateLaudo({ dadosFuncionaisCargo: e.target.value })}
                placeholder="Ex: Operador de Produção"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dadosFuncionaisAdmissao">Data de Admissão</Label>
              <Input
                id="dadosFuncionaisAdmissao"
                type="date"
                value={currentLaudo.dadosFuncionaisAdmissao || ""}
                onChange={(e) => updateLaudo({ dadosFuncionaisAdmissao: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dadosFuncionaisAfastamento">Data de Afastamento</Label>
              <Input
                id="dadosFuncionaisAfastamento"
                type="date"
                value={currentLaudo.dadosFuncionaisAfastamento || ""}
                onChange={(e) => updateLaudo({ dadosFuncionaisAfastamento: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Descrição do Posto */}
        <div className="space-y-2">
          <Label htmlFor="descricaoPostoTrabalho">Descrição do Posto de Trabalho</Label>
          <Textarea
            id="descricaoPostoTrabalho"
            value={currentLaudo.descricaoPostoTrabalho || ""}
            onChange={(e) => updateLaudo({ descricaoPostoTrabalho: e.target.value })}
            placeholder="Descreva o ambiente físico, equipamentos utilizados, condições ergonômicas, exposição a riscos ocupacionais..."
            rows={5}
          />
        </div>

        {/* Descrição das Atividades */}
        <div className="space-y-2">
          <Label htmlFor="descricaoAtividadesLaborais">Descrição das Atividades Laborais</Label>
          <Textarea
            id="descricaoAtividadesLaborais"
            value={currentLaudo.descricaoAtividadesLaborais || ""}
            onChange={(e) => updateLaudo({ descricaoAtividadesLaborais: e.target.value })}
            placeholder="Descreva detalhadamente as atividades desenvolvidas pelo trabalhador, movimentos repetitivos, carga de trabalho, jornada..."
            rows={5}
          />
        </div>
      </CardContent>
    </Card>
  );
}
