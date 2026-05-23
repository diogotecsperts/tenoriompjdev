import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { AiGenerateButton } from "./AiGenerateButton";

const EXISTE = [
  { v: "sim", l: "Sim — há incapacidade" },
  { v: "nao", l: "Não — sem incapacidade" },
  { v: "parcial", l: "Parcial" },
];
const TIPO = [
  { v: "temporaria", l: "Temporária" },
  { v: "permanente", l: "Permanente" },
];
const GRAU = [
  { v: "parcial", l: "Parcial" },
  { v: "total", l: "Total" },
];
const ABRANG = [
  { v: "uniprofissional", l: "Uniprofissional (só atual função)" },
  { v: "multiprofissional", l: "Multiprofissional (várias atividades)" },
  { v: "omniprofissional", l: "Omniprofissional (qualquer atividade)" },
];
const SIMNAO_INC = [
  { v: "sim", l: "Sim" },
  { v: "nao", l: "Não" },
  { v: "inconclusivo", l: "Inconclusivo" },
];
const SIMNAO = [
  { v: "sim", l: "Sim" },
  { v: "nao", l: "Não" },
];
const NEXO = [
  { v: "comum", l: "Nexo comum (doença não ocupacional)" },
  { v: "tecnico_NTEP", l: "Nexo Técnico Epidemiológico (NTEP)" },
  { v: "profissional", l: "Nexo profissional / ocupacional" },
  { v: "sem_nexo", l: "Ausência de nexo" },
];

export function NexoIncapacidadeSection() {
  const { laudo, updatePrevData } = useLaudoPrev();
  if (!laudo) return null;
  const inc = laudo.prev_data.incapacidade;
  const nx = laudo.prev_data.nexo;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Nexo Previdenciário</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vínculo entre a doença e a atividade laboral.
              </p>
            </div>
            <AiGenerateButton
              laudoId={laudo.id}
              campo="prev_nexo"
              escolha={nx.tipo}
              disabledReason={!nx.tipo ? "Selecione o tipo de nexo antes de gerar a justificativa." : null}
              label="Gerar justificativa do nexo"
              onGenerated={(t) => updatePrevData("nexo", { justificativa: t })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de nexo</Label>
              <Select
                value={nx.tipo || undefined}
                onValueChange={(v) => updatePrevData("nexo", { tipo: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {NEXO.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Justificativa do nexo</Label>
            <Textarea
              rows={5}
              value={nx.justificativa}
              onChange={(e) => updatePrevData("nexo", { justificativa: e.target.value })}
              placeholder="Fundamentação técnica do nexo previdenciário."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Análise da Incapacidade</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                O perito decide a estrutura técnica; a IA redige a justificativa.
              </p>
            </div>
            <AiGenerateButton
              laudoId={laudo.id}
              campo="prev_incapacidade_global"
              disabledReason={!inc.existe ? "Defina se existe incapacidade antes de gerar a justificativa." : null}
              label="Gerar justificativa global"
              onGenerated={(t) => updatePrevData("incapacidade", { justificativa: t })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Existe incapacidade?</Label>
              <Select
                value={inc.existe || undefined}
                onValueChange={(v) => updatePrevData("incapacidade", { existe: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EXISTE.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={inc.tipo || undefined}
                onValueChange={(v) => updatePrevData("incapacidade", { tipo: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPO.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Grau</Label>
              <Select
                value={inc.grau || undefined}
                onValueChange={(v) => updatePrevData("incapacidade", { grau: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {GRAU.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Abrangência</Label>
              <Select
                value={inc.abrangencia || undefined}
                onValueChange={(v) => updatePrevData("incapacidade", { abrangencia: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ABRANG.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">DII — Data de Início da Incapacidade</Label>
              <Input
                type="date"
                value={inc.dii}
                onChange={(e) => updatePrevData("incapacidade", { dii: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data estimada de recuperação</Label>
              <Input
                type="date"
                value={inc.data_recuperacao_estimada}
                onChange={(e) =>
                  updatePrevData("incapacidade", { data_recuperacao_estimada: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Suscetível à reabilitação?</Label>
              <Select
                value={inc.susceptivel_reabilitacao || undefined}
                onValueChange={(v) =>
                  updatePrevData("incapacidade", { susceptivel_reabilitacao: v as any })
                }
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SIMNAO_INC.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Necessita auxílio de terceiros?</Label>
              <Select
                value={inc.necessita_auxilio_terceiros || undefined}
                onValueChange={(v) =>
                  updatePrevData("incapacidade", { necessita_auxilio_terceiros: v as any })
                }
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SIMNAO.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Justificativa da DII</Label>
              <AiGenerateButton
                laudoId={laudo.id}
                campo="prev_dii_justificativa"
                disabledReason={!inc.dii ? "Informe a DII antes de gerar a justificativa." : null}
                label="Gerar justificativa da DII"
                onGenerated={(t) => updatePrevData("incapacidade", { dii_justificativa: t })}
              />
            </div>
            <Textarea
              rows={4}
              value={inc.dii_justificativa}
              onChange={(e) =>
                updatePrevData("incapacidade", { dii_justificativa: e.target.value })
              }
              placeholder="Fundamentação técnica para a data de início da incapacidade."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Justificativa geral da análise de incapacidade</Label>
            <Textarea
              rows={5}
              value={inc.justificativa}
              onChange={(e) =>
                updatePrevData("incapacidade", { justificativa: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
