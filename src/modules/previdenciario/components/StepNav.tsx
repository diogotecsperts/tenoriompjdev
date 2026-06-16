import { CheckCircle2, Circle, Lock } from "lucide-react";
import { PRELAUDO_STEPS, type StepId } from "../lib/prelaudo-structure";
import { cn } from "@/lib/utils";

interface Props {
  current: StepId;
  completed: Set<StepId>;
  onSelect: (id: StepId) => void;
}

export function StepNav({ current, completed, onSelect }: Props) {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card/30 p-3 space-y-1">
      <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Etapas
      </div>
      {PRELAUDO_STEPS.map((s) => {
        const active = s.id === current;
        const done = completed.has(s.id);
        const locked = !s.implemented;
        return (
          <button
            key={s.id}
            disabled={locked}
            onClick={() => onSelect(s.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-sm transition",
              active && "bg-primary/10 text-primary font-medium",
              !active && !locked && "text-foreground hover:bg-muted",
              locked && "text-muted-foreground/60 cursor-not-allowed",
            )}
          >
            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-mono shrink-0">
              {locked ? (
                <Lock className="h-3 w-3" />
              ) : done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 opacity-50" />
              )}
            </span>
            <span className="flex-1 truncate">
              {s.ordem}. {s.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
