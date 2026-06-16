import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import type { ComorbidadesData } from "../../lib/prelaudo-structure";
import { Header, Section, Grid, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<ComorbidadesData>;
  onChange: (patch: Partial<ComorbidadesData>) => void;
}

export function Step05Comorbidades({ value, onChange }: Props) {
  const [novo, setNovo] = useState("");
  const lista = value.lista ?? [];

  const add = () => {
    const t = novo.trim();
    if (!t) return;
    onChange({ lista: [...lista, t] });
    setNovo("");
  };
  const remove = (idx: number) =>
    onChange({ lista: lista.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      <Header title="5. Comorbidades" subtitle="Patologias preexistentes e histórico relevante." />

      <Section title="Lista rápida">
        <div className="flex gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Ex.: hipertensão arterial"
          />
          <Button variant="outline" onClick={add} type="button">
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar
          </Button>
        </div>
        {lista.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {lista.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs"
              >
                {c}
                <button onClick={() => remove(i)} className="hover:text-destructive" type="button">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Narrativa">
        <Textarea
          rows={4}
          value={value.texto ?? ""}
          onChange={(e) => onChange({ texto: e.target.value })}
          placeholder="Descreva o quadro geral das comorbidades…"
        />
      </Section>

      <Section title="Histórico">
        <Grid>
          <Field label="Cirurgias prévias" full>
            <Textarea
              rows={2}
              value={value.cirurgias_previas ?? ""}
              onChange={(e) => onChange({ cirurgias_previas: e.target.value })}
            />
          </Field>
          <Field label="Internações" full>
            <Textarea
              rows={2}
              value={value.internacoes ?? ""}
              onChange={(e) => onChange({ internacoes: e.target.value })}
            />
          </Field>
          <Field label="Histórico familiar relevante" full>
            <Textarea
              rows={2}
              value={value.historico_familiar ?? ""}
              onChange={(e) => onChange({ historico_familiar: e.target.value })}
            />
          </Field>
        </Grid>
      </Section>
    </div>
  );
}
