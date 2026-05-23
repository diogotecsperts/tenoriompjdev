import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Save, CheckCircle2 } from "lucide-react";
import {
  useLaudoPrev,
} from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { PrevidenciarioSidebar } from "@/components/previdenciario/PrevidenciarioSidebar";
import { PlaceholderSection } from "@/components/previdenciario/sections/PlaceholderSection";
import { PeritoSection } from "@/components/previdenciario/sections/PeritoSection";
import { ProcessoSection } from "@/components/previdenciario/sections/ProcessoSection";
import {
  getPrevSectionById,
  LAUDO_PREV_CARDS_STRUCTURE,
} from "@/lib/previdenciario/laudo-prev-structure";

export default function PrevidenciarioLaudoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { laudo, loading, saving, loadLaudo, updateLaudo, flush } = useLaudoPrev();
  const [activeSection, setActiveSection] = useState<string>("perito");

  useEffect(() => {
    if (id) void loadLaudo(id);
  }, [id, loadLaudo]);

  if (loading || !laudo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case "perito":
        return <PeritoSection />;
      case "processo":
        return <ProcessoSection />;
      default: {
        const found = getPrevSectionById(activeSection);
        return <PlaceholderSection label={found?.section.label ?? activeSection} />;
      }
    }
  };

  const sectionLabel =
    getPrevSectionById(activeSection)?.section.label ?? activeSection;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0">
      <PrevidenciarioSidebar
        activeSection={activeSection}
        onSelect={(_, sectionId) => setActiveSection(sectionId)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Editor header */}
        <div className="border-b border-border bg-card px-6 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await flush();
              navigate("/previdenciario/historico");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar
          </Button>

          <div className="flex-1 min-w-0">
            <Input
              value={laudo.title}
              onChange={(e) => updateLaudo({ title: e.target.value })}
              className="h-9 text-sm font-medium border-transparent hover:border-input focus:border-input"
            />
          </div>

          <Badge variant="outline" className="capitalize">
            {laudo.status ?? "rascunho"}
          </Badge>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-[100px] justify-end">
            {saving ? (
              <>
                <Save className="h-3.5 w-3.5 animate-pulse" />
                Salvando…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Salvo
              </>
            )}
          </div>
        </div>

        {/* Section content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {LAUDO_PREV_CARDS_STRUCTURE.find((c) =>
                  c.sections.some((s) => s.id === activeSection)
                )?.label ?? ""}
              </p>
              <h1 className="text-xl font-bold text-foreground">{sectionLabel}</h1>
            </div>
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}
