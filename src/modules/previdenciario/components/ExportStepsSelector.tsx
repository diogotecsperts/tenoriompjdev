import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListFilter } from "lucide-react";
import { PRELAUDO_STEPS, ALL_STEP_IDS, type StepId } from "../lib/prelaudo-structure";

interface Props {
  value: StepId[];
  onChange: (next: StepId[]) => void;
  disabled?: boolean;
}

export function ExportStepsSelector({ value, onChange, disabled }: Props) {
  const selected = useMemo(() => new Set(value), [value]);
  const total = PRELAUDO_STEPS.length;
  const count = value.length;

  const toggle = (id: StepId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // preserve canonical order
    onChange(ALL_STEP_IDS.filter((s) => next.has(s)));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-1.5" title={`Etapas no export (${count}/${total})`}>
          <ListFilter className="h-4 w-4" />
          <span>{count}/{total}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="text-xs font-semibold text-foreground mb-1">
          Etapas incluídas na exportação
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          As etapas desmarcadas ficam salvas no app, mas não aparecem no PDF/DOCX.
          Sua escolha é lembrada para os próximos laudos.
        </p>

        <div className="flex items-center gap-1.5 mb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onChange([...ALL_STEP_IDS])}
          >
            Todas
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onChange([])}
          >
            Nenhuma
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onChange([...ALL_STEP_IDS])}
          >
            Padrão
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-1 pr-1">
          {PRELAUDO_STEPS.map((s) => {
            const checked = selected.has(s.id);
            return (
              <label
                key={s.id}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(s.id)}
                />
                <span className="text-xs text-foreground flex-1">
                  {s.ordem}. {s.label}
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
