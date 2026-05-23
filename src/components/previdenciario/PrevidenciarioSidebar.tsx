import { cn } from "@/lib/utils";
import { LAUDO_PREV_CARDS_STRUCTURE } from "@/lib/previdenciario/laudo-prev-structure";
import { ChevronRight } from "lucide-react";

interface Props {
  activeSection: string;
  onSelect: (cardId: string, sectionId: string) => void;
}

export function PrevidenciarioSidebar({ activeSection, onSelect }: Props) {
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card overflow-y-auto custom-scrollbar">
      <div className="p-4 space-y-4">
        {LAUDO_PREV_CARDS_STRUCTURE.map((card) => (
          <div key={card.id}>
            <h3 className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {card.label}
            </h3>
            <nav className="space-y-0.5">
              {card.sections.map((section) => {
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => onSelect(card.id, section.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors text-left",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{section.label}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
