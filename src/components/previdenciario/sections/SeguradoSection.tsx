import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";

const QUALIDADES = [
  { v: "empregado", l: "Empregado (CLT)" },
  { v: "contribuinte_individual", l: "Contribuinte individual" },
  { v: "facultativo", l: "Facultativo" },
  { v: "segurado_especial", l: "Segurado especial (rural)" },
  { v: "desempregado_periodo_graca", l: "Desempregado / Período de graça" },
];

const BENEFICIOS = [
  { v: "B31", l: "B31 — Auxílio-doença (incapacidade temporária)" },
  { v: "B32", l: "B32 — Aposentadoria por invalidez (incapacidade permanente)" },
  { v: "B91", l: "B91 — Auxílio-doença acidentário" },
  { v: "B92", l: "B92 — Aposentadoria por invalidez acidentária" },
  { v: "BPC_LOAS", l: "BPC/LOAS — Benefício assistencial" },
  { v: "isencao_IR", l: "Isenção de IR por doença grave" },
  { v: "majoracao_25", l: "Majoração de 25% (necessidade de terceiros)" },
];

export function SeguradoSection() {
  const { laudo, updateLaudo, updatePrevData } = useLaudoPrev();
  if (!laudo) return null;

  const seg = laudo.prev_data.segurado;
  const ben = laudo.prev_data.beneficio;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Identificação do Segurado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dados pessoais e documentos do(a) periciando(a).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome completo</Label>
              <Input
                value={laudo.vitima_nome ?? ""}
                onChange={(e) => updateLaudo({ vitima_nome: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data de nascimento</Label>
              <Input
                type="date"
                value={laudo.vitima_nascimento ?? ""}
                onChange={(e) => updateLaudo({ vitima_nascimento: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CPF</Label>
              <Input
                value={seg.cpf}
                onChange={(e) => updatePrevData("segurado", { cpf: e.target.value })}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RG</Label>
              <Input
                value={seg.rg}
                onChange={(e) => updatePrevData("segurado", { rg: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">NIT / PIS</Label>
              <Input
                value={seg.nit_pis}
                onChange={(e) => updatePrevData("segurado", { nit_pis: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado civil</Label>
              <Input
                value={seg.estado_civil}
                onChange={(e) => updatePrevData("segurado", { estado_civil: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Profissão / Última atividade</Label>
              <Input
                value={laudo.vitima_profissao ?? ""}
                onChange={(e) => updateLaudo({ vitima_profissao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Escolaridade</Label>
              <Input
                value={laudo.vitima_escolaridade ?? ""}
                onChange={(e) => updateLaudo({ vitima_escolaridade: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Endereço</Label>
              <Input
                value={seg.endereco}
                onChange={(e) => updatePrevData("segurado", { endereco: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Qualidade de Segurado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vínculo do segurado com o RGPS na data do início da incapacidade.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Qualidade de segurado</Label>
              <Select
                value={seg.qualidade_segurado || undefined}
                onValueChange={(v) =>
                  updatePrevData("segurado", { qualidade_segurado: v as any })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {QUALIDADES.map((q) => (
                    <SelectItem key={q.v} value={q.v}>
                      {q.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Última atividade exercida</Label>
              <Input
                value={seg.ultima_atividade}
                onChange={(e) =>
                  updatePrevData("segurado", { ultima_atividade: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data da última contribuição</Label>
              <Input
                type="date"
                value={seg.data_ultima_contribuicao}
                onChange={(e) =>
                  updatePrevData("segurado", { data_ultima_contribuicao: e.target.value })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Benefício Pleiteado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Espécie de benefício em discussão judicial.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Espécie / Tipo de benefício</Label>
              <Select
                value={ben.tipo || undefined}
                onValueChange={(v) => updatePrevData("beneficio", { tipo: v as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {BENEFICIOS.map((b) => (
                    <SelectItem key={b.v} value={b.v}>
                      {b.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">NB (Número do benefício)</Label>
              <Input
                value={ben.nb_numero}
                onChange={(e) => updatePrevData("beneficio", { nb_numero: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">DER (Data Entrada Requerimento)</Label>
              <Input
                type="date"
                value={ben.der}
                onChange={(e) => updatePrevData("beneficio", { der: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">DIB (Data Início Benefício)</Label>
              <Input
                type="date"
                value={ben.dib}
                onChange={(e) => updatePrevData("beneficio", { dib: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">DCB (Data Cessação Benefício)</Label>
              <Input
                type="date"
                value={ben.dcb}
                onChange={(e) => updatePrevData("beneficio", { dcb: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Motivo da cessação</Label>
              <Input
                value={ben.motivo_cessacao}
                onChange={(e) =>
                  updatePrevData("beneficio", { motivo_cessacao: e.target.value })
                }
                placeholder="Ex.: alta administrativa em DD/MM/AAAA"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
