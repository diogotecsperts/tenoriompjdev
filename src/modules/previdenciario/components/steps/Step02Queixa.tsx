import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { QueixaData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<QueixaData>;
  onChange: (patch: Partial<QueixaData>) => void;
}

export function Step02Queixa({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <Header title="2. Queixa principal" subtitle="Descreva o motivo central da perícia, na voz do periciado." />

      <Section title="Queixa">
        <Textarea
          rows={5}
          value={value.queixa_principal ?? ""}
          onChange={(e) => onChange({ queixa_principal: e.target.value })}
          placeholder="Ex.: dor lombar contínua há 8 meses, irradiando para MMII…"
        />
      </Section>

      <Section title="Detalhamento">
        <Grid>
          <Field label="Início dos sintomas">
            <Input
              value={value.inicio_sintomas ?? ""}
              onChange={(e) => onChange({ inicio_sintomas: e.target.value })}
              placeholder="Ex.: há 8 meses"
            />
          </Field>
          <Field label="Lateralidade">
            <Input
              value={value.lateralidade ?? ""}
              onChange={(e) => onChange({ lateralidade: e.target.value })}
              placeholder="direita / esquerda / bilateral / n/a"
            />
          </Field>
          <Field label="Evolução" full>
            <Textarea
              rows={3}
              value={value.evolucao ?? ""}
              onChange={(e) => onChange({ evolucao: e.target.value })}
            />
          </Field>
          <Field label="Fatores agravantes" full>
            <Textarea
              rows={2}
              value={value.fatores_agravantes ?? ""}
              onChange={(e) => onChange({ fatores_agravantes: e.target.value })}
            />
          </Field>
        </Grid>
      </Section>
    </div>
  );
}
