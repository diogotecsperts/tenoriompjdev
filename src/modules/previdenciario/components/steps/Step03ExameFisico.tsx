import { Label } from "@/components/ui/label";
import {
  EXAME_FISICO_TEXTOS,
  INCAPACIDADE_OPCOES,
  type ExameFisicoData,
  type IncapacidadeValue,
} from "../../lib/prelaudo-structure";
import { Header, Section } from "./Step01Identificacao";

interface Props {
  value: Partial<ExameFisicoData>;
  onChange: (patch: Partial<ExameFisicoData>) => void;
}

/**
 * Etapa 3 — Exame Físico.
 * Texto 100% fixo (sem IA, sem edição). Únicos campos interativos: dois
 * conjuntos de radios para incapacidade habitual/vida independente.
 */
export function Step03ExameFisico({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <Header
        title="3. Exame físico"
        subtitle="Texto padrão fixo, não editável. Selecione apenas as conclusões de incapacidade ao final."
      />

      <FixedBlock title="Exame do Estado Mental" body={EXAME_FISICO_TEXTOS.estado_mental} />

      <Section title="Exame físico geral">
        <FixedParagraph body={EXAME_FISICO_TEXTOS.ectoscopia} />
        <FixedParagraph body={EXAME_FISICO_TEXTOS.inspecao_dinamica} />
      </Section>

      <FixedBlock title="Complementação" body={EXAME_FISICO_TEXTOS.complementacao} />

      <Section title="Conclusões">
        <RadioGroupLine
          legend="Incapacidade para sua função habitual"
          value={value.incap_funcao_habitual ?? ""}
          onChange={(v) => onChange({ incap_funcao_habitual: v })}
        />
        <RadioGroupLine
          legend="Incapacidade para a vida independente"
          value={value.incap_vida_independente ?? ""}
          onChange={(v) => onChange({ incap_vida_independente: v })}
        />
      </Section>
    </div>
  );
}

function FixedBlock({ title, body }: { title: string; body: string }) {
  return (
    <Section title={title}>
      <FixedParagraph body={body} />
    </Section>
  );
}

function FixedParagraph({ body }: { body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
      <p className="text-sm text-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function RadioGroupLine({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: IncapacidadeValue;
  onChange: (v: IncapacidadeValue) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">{legend}</Label>
      <div className="flex flex-wrap gap-2">
        {INCAPACIDADE_OPCOES.map((op) => {
          const checked = value === op.value;
          return (
            <button
              key={op.value}
              type="button"
              onClick={() => onChange(checked ? "" : op.value)}
              className={
                "px-3 py-1.5 rounded-md text-xs border transition " +
                (checked
                  ? "bg-primary/10 border-primary text-primary font-medium"
                  : "bg-card border-border text-foreground hover:bg-muted")
              }
            >
              {op.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
