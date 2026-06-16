import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { AcompanhamentoData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<AcompanhamentoData>;
  onChange: (patch: Partial<AcompanhamentoData>) => void;
}

export function Step04Acompanhamento({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <Header title="4. Acompanhamento médico" subtitle="Existe acompanhamento ambulatorial atual?" />

      <Section title="Acompanhamento">
        <RadioGroup
          value={value.faz_acompanhamento ?? ""}
          onValueChange={(v) => onChange({ faz_acompanhamento: v as "sim" | "nao" })}
          className="flex gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sim" id="acomp-sim" />
            <Label htmlFor="acomp-sim">Sim</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="nao" id="acomp-nao" />
            <Label htmlFor="acomp-nao">Não</Label>
          </div>
        </RadioGroup>
      </Section>

      <Section title="Detalhes">
        <Grid>
          <Field label="Especialistas">
            <Input
              value={value.especialistas ?? ""}
              onChange={(e) => onChange({ especialistas: e.target.value })}
              placeholder="Ex.: Ortopedista, Psiquiatra"
            />
          </Field>
          <Field label="Frequência">
            <Input
              value={value.frequencia ?? ""}
              onChange={(e) => onChange({ frequencia: e.target.value })}
              placeholder="Ex.: mensal"
            />
          </Field>
          <Field label="Última consulta">
            <Input
              type="date"
              value={value.ultima_consulta ?? ""}
              onChange={(e) => onChange({ ultima_consulta: e.target.value })}
            />
          </Field>
          <Field label="Observações" full>
            <Textarea
              rows={3}
              value={value.observacoes ?? ""}
              onChange={(e) => onChange({ observacoes: e.target.value })}
            />
          </Field>
        </Grid>
      </Section>
    </div>
  );
}
