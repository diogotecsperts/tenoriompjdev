import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Star } from "lucide-react";
import type { CidData, CidItem } from "../../lib/prelaudo-structure";
import { Header, Section } from "./Step01Identificacao";

interface Props {
  value: Partial<CidData>;
  onChange: (patch: Partial<CidData>) => void;
}

export function Step09Cid({ value, onChange }: Props) {
  const itens = value.itens ?? [];
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");

  const add = () => {
    const c = codigo.trim().toUpperCase();
    if (!c) return;
    const novo: CidItem = {
      codigo: c,
      descricao: descricao.trim(),
      principal: itens.length === 0,
    };
    onChange({ itens: [...itens, novo] });
    setCodigo("");
    setDescricao("");
  };

  const remove = (idx: number) => {
    const next = itens.filter((_, i) => i !== idx);
    // garante 1 principal
    if (next.length > 0 && !next.some((x) => x.principal)) next[0].principal = true;
    onChange({ itens: next });
  };

  const togglePrincipal = (idx: number) => {
    onChange({
      itens: itens.map((it, i) => ({ ...it, principal: i === idx })),
    });
  };

  const updateItem = (idx: number, patch: Partial<CidItem>) => {
    onChange({ itens: itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  };

  return (
    <div className="space-y-6">
      <Header
        title="9. CID-10"
        subtitle="Códigos diagnósticos. A IA pode sugerir a partir do processo; o médico valida e marca o principal."
      />

      <Section title="Adicionar CID">
        <div className="flex gap-2">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ex.: M54.5"
            className="w-32"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição (opcional)"
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <Button variant="outline" onClick={add} type="button">
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar
          </Button>
        </div>
      </Section>

      <Section title={`CIDs registrados (${itens.length})`}>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhum CID adicionado.</p>
        ) : (
          <div className="space-y-2">
            {itens.map((it, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 border border-border rounded-md bg-card"
              >
                <button
                  type="button"
                  onClick={() => togglePrincipal(i)}
                  title={it.principal ? "Principal" : "Definir como principal"}
                  className="shrink-0"
                >
                  <Star
                    className={`h-4 w-4 ${it.principal ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                </button>
                <Input
                  value={it.codigo}
                  onChange={(e) => updateItem(i, { codigo: e.target.value.toUpperCase() })}
                  className="w-28 font-mono text-sm"
                />
                <Input
                  value={it.descricao}
                  onChange={(e) => updateItem(i, { descricao: e.target.value })}
                  placeholder="Descrição"
                  className="flex-1"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={it.principal}
                    onCheckedChange={() => togglePrincipal(i)}
                  />
                  Principal
                </label>
                <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Observações">
        <Textarea
          rows={3}
          value={value.observacoes ?? ""}
          onChange={(e) => onChange({ observacoes: e.target.value })}
        />
      </Section>
    </div>
  );
}
