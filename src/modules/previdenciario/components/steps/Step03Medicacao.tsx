import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import type { MedicacaoData, MedicacaoItem } from "../../lib/prelaudo-structure";
import { Header, Section, Field } from "./Step01Identificacao";

interface Props {
  value: Partial<MedicacaoData>;
  onChange: (patch: Partial<MedicacaoData>) => void;
}

export function Step03Medicacao({ value, onChange }: Props) {
  const itens: MedicacaoItem[] = value.itens ?? [];

  const update = (idx: number, patch: Partial<MedicacaoItem>) => {
    const next = itens.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ itens: next });
  };
  const add = () =>
    onChange({ itens: [...itens, { nome: "", dose: "", frequencia: "", em_uso: true }] });
  const remove = (idx: number) =>
    onChange({ itens: itens.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      <Header title="3. Medicação em uso" subtitle="Liste medicamentos atuais, doses e frequência." />

      <Section title="Medicamentos">
        <div className="space-y-2">
          {itens.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhum medicamento adicionado.</p>
          )}
          {itens.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-end p-2 rounded-md border border-border bg-card"
            >
              <div className="col-span-12 md:col-span-4">
                <label className="text-[10px] text-muted-foreground">Nome</label>
                <Input value={it.nome} onChange={(e) => update(i, { nome: e.target.value })} />
              </div>
              <div className="col-span-6 md:col-span-2">
                <label className="text-[10px] text-muted-foreground">Dose</label>
                <Input value={it.dose} onChange={(e) => update(i, { dose: e.target.value })} />
              </div>
              <div className="col-span-6 md:col-span-3">
                <label className="text-[10px] text-muted-foreground">Frequência</label>
                <Input
                  value={it.frequencia}
                  onChange={(e) => update(i, { frequencia: e.target.value })}
                />
              </div>
              <div className="col-span-8 md:col-span-2 flex items-center gap-2 pt-4">
                <Checkbox
                  checked={it.em_uso}
                  onCheckedChange={(c) => update(i, { em_uso: c === true })}
                  id={`em_uso_${i}`}
                />
                <label htmlFor={`em_uso_${i}`} className="text-xs">
                  Em uso
                </label>
              </div>
              <div className="col-span-4 md:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-8 w-8">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar medicamento
          </Button>
        </div>
      </Section>

      <Section title="Observações">
        <Field label="Observações sobre uso de medicação">
          <Textarea
            rows={3}
            value={value.observacoes ?? ""}
            onChange={(e) => onChange({ observacoes: e.target.value })}
          />
        </Field>
      </Section>
    </div>
  );
}
