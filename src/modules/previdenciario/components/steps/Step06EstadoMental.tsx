import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EstadoMentalData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<EstadoMentalData>;
  onChange: (patch: Partial<EstadoMentalData>) => void;
}

export function Step06EstadoMental({ value, onChange }: Props) {
  const set =
    (k: keyof EstadoMentalData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [k]: e.target.value } as Partial<EstadoMentalData>);

  return (
    <div className="space-y-6">
      <Header
        title="6. Estado mental"
        subtitle="Exame psíquico básico. Preenchimento manual — sem sugestão automática da IA."
      />

      <Section title="Avaliação psíquica">
        <Grid>
          <Field label="Orientação (tempo/espaço)">
            <Input value={value.orientacao ?? ""} onChange={set("orientacao")} placeholder="Orientado / desorientado" />
          </Field>
          <Field label="Humor">
            <Input value={value.humor ?? ""} onChange={set("humor")} placeholder="Eutímico / deprimido / ansioso" />
          </Field>
          <Field label="Afeto">
            <Input value={value.afeto ?? ""} onChange={set("afeto")} />
          </Field>
          <Field label="Pensamento (curso/conteúdo)">
            <Input value={value.pensamento ?? ""} onChange={set("pensamento")} />
          </Field>
          <Field label="Memória">
            <Input value={value.memoria ?? ""} onChange={set("memoria")} />
          </Field>
          <Field label="Atenção">
            <Input value={value.atencao ?? ""} onChange={set("atencao")} />
          </Field>
          <Field label="Juízo e crítica" full>
            <Input value={value.juizo_critica ?? ""} onChange={set("juizo_critica")} />
          </Field>
        </Grid>
      </Section>

      <Section title="Observações">
        <Textarea
          rows={4}
          value={value.observacoes ?? ""}
          onChange={set("observacoes")}
          placeholder="Observações adicionais do exame mental…"
        />
      </Section>
    </div>
  );
}
