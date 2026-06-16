import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExameOrtopedicoData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<ExameOrtopedicoData>;
  onChange: (patch: Partial<ExameOrtopedicoData>) => void;
}

export function Step08Ortopedico({ value, onChange }: Props) {
  const set =
    (k: keyof ExameOrtopedicoData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [k]: e.target.value } as Partial<ExameOrtopedicoData>);

  return (
    <div className="space-y-6">
      <Header
        title="8. Exame ortopédico"
        subtitle="Exame físico segmentar. Preenchimento manual a partir do exame do periciado."
      />

      <Section title="Segmento avaliado">
        <Grid>
          <Field label="Segmento / região" full>
            <Input
              value={value.segmento_avaliado ?? ""}
              onChange={set("segmento_avaliado")}
              placeholder="Ex.: coluna lombar; ombro direito; joelho esquerdo"
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Exame físico">
        <Grid>
          <Field label="Inspeção" full>
            <Textarea rows={2} value={value.inspecao ?? ""} onChange={set("inspecao")} />
          </Field>
          <Field label="Palpação" full>
            <Textarea rows={2} value={value.palpacao ?? ""} onChange={set("palpacao")} />
          </Field>
          <Field label="Amplitude de movimento" full>
            <Textarea rows={2} value={value.amplitude_movimento ?? ""} onChange={set("amplitude_movimento")} />
          </Field>
          <Field label="Força muscular (grau 0-5)">
            <Input value={value.forca_muscular ?? ""} onChange={set("forca_muscular")} />
          </Field>
          <Field label="Reflexos">
            <Input value={value.reflexos ?? ""} onChange={set("reflexos")} />
          </Field>
          <Field label="Testes especiais" full>
            <Textarea rows={2} value={value.testes_especiais ?? ""} onChange={set("testes_especiais")} />
          </Field>
          <Field label="Manobras" full>
            <Textarea rows={2} value={value.manobras ?? ""} onChange={set("manobras")} />
          </Field>
        </Grid>
      </Section>

      <Section title="Observações">
        <Textarea rows={3} value={value.observacoes ?? ""} onChange={set("observacoes")} />
      </Section>
    </div>
  );
}
