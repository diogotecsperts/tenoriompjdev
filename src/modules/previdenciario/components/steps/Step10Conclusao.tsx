import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConclusaoData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<ConclusaoData>;
  onChange: (patch: Partial<ConclusaoData>) => void;
}

export function Step10Conclusao({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <Header
        title="10. Conclusão"
        subtitle="Síntese pericial. Decisão exclusiva do médico — a IA não preenche este step."
      />

      <Section title="Diagnóstico">
        <Textarea
          rows={3}
          value={value.diagnostico ?? ""}
          onChange={(e) => onChange({ diagnostico: e.target.value })}
          placeholder="Diagnóstico clínico-pericial"
        />
      </Section>

      <Section title="Nexo causal">
        <Grid>
          <Field label="Há nexo?">
            <Select
              value={value.nexo_causal ?? ""}
              onValueChange={(v) => onChange({ nexo_causal: v as ConclusaoData["nexo_causal"] })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Justificativa" full>
            <Textarea
              rows={3}
              value={value.nexo_justificativa ?? ""}
              onChange={(e) => onChange({ nexo_justificativa: e.target.value })}
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Incapacidade">
        <Grid>
          <Field label="Grau">
            <Select
              value={value.incapacidade ?? ""}
              onValueChange={(v) => onChange({ incapacidade: v as ConclusaoData["incapacidade"] })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ausente">Ausente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="total">Total</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Temporalidade">
            <Select
              value={value.temporalidade ?? ""}
              onValueChange={(v) => onChange({ temporalidade: v as ConclusaoData["temporalidade"] })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="temporaria">Temporária</SelectItem>
                <SelectItem value="permanente">Permanente</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data início da incapacidade (DII)">
            <Input
              type="date"
              value={value.data_inicio_incapacidade ?? ""}
              onChange={(e) => onChange({ data_inicio_incapacidade: e.target.value })}
            />
          </Field>
          <Field label="Prazo para reavaliação">
            <Input
              value={value.prazo_reavaliacao ?? ""}
              onChange={(e) => onChange({ prazo_reavaliacao: e.target.value })}
              placeholder="Ex.: 12 meses"
            />
          </Field>
          <Field label="Reabilitação indicada?">
            <Select
              value={value.reabilitacao_indicada ?? ""}
              onValueChange={(v) =>
                onChange({ reabilitacao_indicada: v as ConclusaoData["reabilitacao_indicada"] })
              }
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
      </Section>

      <Section title="Considerações finais">
        <Textarea
          rows={4}
          value={value.consideracoes_finais ?? ""}
          onChange={(e) => onChange({ consideracoes_finais: e.target.value })}
        />
      </Section>
    </div>
  );
}
