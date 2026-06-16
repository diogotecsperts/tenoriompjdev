import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EctoscopiaData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<EctoscopiaData>;
  onChange: (patch: Partial<EctoscopiaData>) => void;
}

export function Step07Ectoscopia({ value, onChange }: Props) {
  const set =
    (k: keyof EctoscopiaData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [k]: e.target.value } as Partial<EctoscopiaData>);

  // IMC automático
  const onMedida = (k: "peso" | "altura") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...value, [k]: e.target.value };
    const p = parseFloat((next.peso || "").replace(",", "."));
    const a = parseFloat((next.altura || "").replace(",", "."));
    let imc = next.imc ?? "";
    if (!isNaN(p) && !isNaN(a) && a > 0) {
      const alturaM = a > 3 ? a / 100 : a;
      imc = (p / (alturaM * alturaM)).toFixed(1);
    }
    onChange({ [k]: e.target.value, imc } as Partial<EctoscopiaData>);
  };

  return (
    <div className="space-y-6">
      <Header
        title="7. Ectoscopia / Exame geral"
        subtitle="Aparência e sinais vitais. Preenchimento manual."
      />

      <Section title="Aspecto geral">
        <Grid>
          <Field label="Estado geral">
            <Input value={value.estado_geral ?? ""} onChange={set("estado_geral")} placeholder="Bom / regular / mau" />
          </Field>
          <Field label="Hidratação">
            <Input value={value.hidratacao ?? ""} onChange={set("hidratacao")} />
          </Field>
          <Field label="Corado">
            <Input value={value.corado ?? ""} onChange={set("corado")} placeholder="Corado / hipocorado" />
          </Field>
          <Field label="Acianótico">
            <Input value={value.acianotico ?? ""} onChange={set("acianotico")} />
          </Field>
          <Field label="Anictérico">
            <Input value={value.anicterico ?? ""} onChange={set("anicterico")} />
          </Field>
          <Field label="Marcha">
            <Input value={value.marcha ?? ""} onChange={set("marcha")} />
          </Field>
          <Field label="Postura" full>
            <Input value={value.postura ?? ""} onChange={set("postura")} />
          </Field>
        </Grid>
      </Section>

      <Section title="Medidas e sinais vitais">
        <Grid>
          <Field label="Peso (kg)">
            <Input value={value.peso ?? ""} onChange={onMedida("peso")} />
          </Field>
          <Field label="Altura (m ou cm)">
            <Input value={value.altura ?? ""} onChange={onMedida("altura")} />
          </Field>
          <Field label="IMC (calculado)">
            <Input value={value.imc ?? ""} readOnly className="bg-muted/40" />
          </Field>
          <Field label="Pressão arterial">
            <Input value={value.pressao_arterial ?? ""} onChange={set("pressao_arterial")} placeholder="ex.: 120/80 mmHg" />
          </Field>
        </Grid>
      </Section>

      <Section title="Observações">
        <Textarea rows={3} value={value.observacoes ?? ""} onChange={set("observacoes")} />
      </Section>
    </div>
  );
}
