import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function DadosPostoTrabalho() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.importJobId || !!(currentLaudo.aiMetadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Posto de Trabalho</CardTitle>
        <CardDescription>
          Informações funcionais e descrição do ambiente e atividades laborais
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {/* Campo unificado: Ambiente e Atividades Laborais */}
        <LaudoTextareaAIField
          id="descricaoAtividadesLaborais"
          label="Ambiente e Atividades Laborais"
          value={currentLaudo.descricaoAtividadesLaborais || ""}
          onChange={(value) => updateLaudo({ descricaoAtividadesLaborais: value })}
          placeholder="Descreva o ambiente de trabalho (mobiliário, equipamentos, condições ergonômicas, exposição a riscos ocupacionais), bem como as atividades desenvolvidas pelo trabalhador, incluindo movimentos repetitivos, posturas adotadas, carga de trabalho e jornada..."
          rows={8}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="descricaoAtividadesLaborais"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />
      </CardContent>
    </Card>
  );
}
