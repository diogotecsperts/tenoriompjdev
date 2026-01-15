import { useLaudo } from "@/contexts/LaudoContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function DadosPostoTrabalho() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.ai_metadata as any)?.importJobId || !!(currentLaudo.ai_metadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Posto de Trabalho</CardTitle>
        <CardDescription>
          Informações funcionais e descrição das atividades laborais
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

        <LaudoTextareaAIField
          id="descricaoPostoTrabalho"
          label="Descrição do Posto de Trabalho"
          value={currentLaudo.descricaoPostoTrabalho || ""}
          onChange={(value) => updateLaudo({ descricaoPostoTrabalho: value })}
          placeholder="Descreva o ambiente físico, equipamentos utilizados, condições ergonômicas, exposição a riscos ocupacionais..."
          rows={5}
          enableEnhance={true}
          enableRegenerate={true}
          fieldKey="descricaoPostoTrabalho"
          laudoId={currentLaudo.id}
          hasPdfSource={hasPdfSource}
        />

        <LaudoTextareaAIField
          id="descricaoAtividadesLaborais"
          label="Descrição das Atividades Laborais"
          value={currentLaudo.descricaoAtividadesLaborais || ""}
          onChange={(value) => updateLaudo({ descricaoAtividadesLaborais: value })}
          placeholder="Descreva detalhadamente as atividades desenvolvidas pelo trabalhador, movimentos repetitivos, carga de trabalho, jornada..."
          rows={5}
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
