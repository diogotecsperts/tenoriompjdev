import { Textarea } from "@/components/ui/textarea";
import type { QueixaData } from "../../lib/prelaudo-structure";
import { Header, Section } from "./Step01Identificacao";

interface Props {
  value: Partial<QueixaData>;
  onChange: (patch: Partial<QueixaData>) => void;
}

export function Step02Queixa({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <Header
        title="2. Queixa principal"
        subtitle="Texto unificado gerado a partir do processo. Edite livremente."
      />

      <Section title="Queixa">
        <Textarea
          rows={14}
          value={value.queixa_principal ?? ""}
          onChange={(e) => onChange({ queixa_principal: e.target.value })}
          placeholder="Parágrafo técnico unificado: queixa principal, tempo de evolução, evolução/recorrência, características dos sintomas, sintomas associados, antecedentes traumáticos relevantes e repercussão funcional referida."
          className="resize-y"
        />
      </Section>
    </div>
  );
}
