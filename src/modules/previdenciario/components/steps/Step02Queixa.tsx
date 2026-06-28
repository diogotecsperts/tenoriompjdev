import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";
import {
  COMORBIDADES_FIXAS,
  type ComorbidadeKey,
  type QueixaData,
  type ComorbidadeExtra,
} from "../../lib/prelaudo-structure";
import { Header, Section } from "./Step01Identificacao";

interface Props {
  value: Partial<QueixaData>;
  onChange: (patch: Partial<QueixaData>) => void;
}

export function Step02Queixa({ value, onChange }: Props) {
  const fixas = value.comorbidades_fixas ?? {};
  const extras: ComorbidadeExtra[] = Array.isArray(value.comorbidades_extras)
    ? value.comorbidades_extras
    : [];

  const toggleFixa = (key: ComorbidadeKey) => {
    onChange({
      comorbidades_fixas: { ...fixas, [key]: !fixas[key] },
    });
  };

  const updateExtra = (idx: number, patch: Partial<ComorbidadeExtra>) => {
    const next = extras.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    onChange({ comorbidades_extras: next });
  };
  const addExtra = () =>
    onChange({
      comorbidades_extras: [...extras, { marcado: true, texto: "" }],
    });
  const removeExtra = (idx: number) =>
    onChange({ comorbidades_extras: extras.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      <Header
        title="2. Queixa principal"
        subtitle="Texto unificado gerado a partir do processo, medicações em uso e comorbidades."
      />

      {/* 1) Bloco IA */}
      <Section title="Queixa (parágrafo unificado pela IA)">
        <Textarea
          rows={12}
          value={value.queixa_principal ?? ""}
          onChange={(e) => onChange({ queixa_principal: e.target.value })}
          placeholder="Parágrafo técnico unificado: queixa principal, irradiação, tempo de evolução e repercussão funcional."
          className="resize-y"
        />
      </Section>

      {/* 2) Medicações em uso */}
      <Section title="Para os sintomas referidos, informa uso contínuo de medicações:">
        <Textarea
          rows={4}
          value={value.medicacoes_uso ?? ""}
          onChange={(e) => onChange({ medicacoes_uso: e.target.value })}
          placeholder="Texto preenchido pela IA a partir do processo. Edite livremente."
          className="resize-y"
        />
      </Section>

      {/* 3) Parágrafo fixo */}
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground italic mb-1">Texto fixo (sai no documento):</p>
        <p className="text-sm text-foreground">
          Relata acompanhamento médico e realização regular de fisioterapia.
        </p>
      </div>

      {/* 4) Comorbidades */}
      <Section title="Informa demais comorbidades:">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {COMORBIDADES_FIXAS.map((c) => {
            const checked = !!fixas[c.key];
            return (
              <label
                key={c.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleFixa(c.key)} />
                <span className="text-sm text-foreground">{c.label}</span>
              </label>
            );
          })}
        </div>

        {extras.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {extras.map((e, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-card/40"
              >
                <Checkbox
                  checked={!!e.marcado}
                  onCheckedChange={(v) => updateExtra(idx, { marcado: !!v })}
                />
                <Input
                  value={e.texto}
                  onChange={(ev) => updateExtra(idx, { texto: ev.target.value })}
                  placeholder="Descreva a comorbidade"
                  className="h-8 text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeExtra(idx)}
                  title="Remover"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={addExtra}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar comorbidade
        </Button>
      </Section>
    </div>
  );
}
