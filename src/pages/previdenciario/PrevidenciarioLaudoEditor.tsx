import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Loader2, ArrowLeft, Save, CheckCircle2, Download, FileText, FileType } from "lucide-react";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { PrevidenciarioSidebar } from "@/components/previdenciario/PrevidenciarioSidebar";
import { PlaceholderSection } from "@/components/previdenciario/sections/PlaceholderSection";
import { PeritoSection } from "@/components/previdenciario/sections/PeritoSection";
import { ProcessoSection } from "@/components/previdenciario/sections/ProcessoSection";
import { SeguradoSection } from "@/components/previdenciario/sections/SeguradoSection";
import { HistoriaSection } from "@/components/previdenciario/sections/HistoriaSection";
import { ExameSection } from "@/components/previdenciario/sections/ExameSection";
import { CIDSection } from "@/components/previdenciario/sections/CIDSection";
import { NexoIncapacidadeSection } from "@/components/previdenciario/sections/NexoIncapacidadeSection";
import { EnquadramentoSection } from "@/components/previdenciario/sections/EnquadramentoSection";
import { QuesitosSection } from "@/components/previdenciario/sections/QuesitosSection";
import { ConclusaoSection } from "@/components/previdenciario/sections/ConclusaoSection";
import {
  ObjetivoSection,
  DocumentosSection,
  ResumoAdmSection,
  MetodologiaSection,
  ReferenciasSection,
  HonorariosSection,
} from "@/components/previdenciario/sections/ObjetivoDocumentosSection";
import {
  getPrevSectionById,
  LAUDO_PREV_CARDS_STRUCTURE,
} from "@/lib/previdenciario/laudo-prev-structure";
import { exportPrevLaudo } from "@/lib/previdenciario/export/prev-export-orchestrator";
import { toast } from "@/hooks/use-toast";

export default function PrevidenciarioLaudoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { laudo, loading, saving, loadLaudo, updateLaudo, flush } = useLaudoPrev();
  const [activeSection, setActiveSection] = useState<string>("perito");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (id) void loadLaudo(id);
  }, [id, loadLaudo]);

  const handleExport = async (format: "pdf" | "docx") => {
    if (!laudo) return;
    setExporting(true);
    try {
      await flush();
      await exportPrevLaudo(laudo, format);
      toast({
        title: `${format.toUpperCase()} gerado com sucesso`,
        description: "O laudo foi baixado para o seu dispositivo.",
      });
    } catch (err: any) {
      console.error("[PrevExport] error:", err);
      toast({
        variant: "destructive",
        title: `Erro ao gerar ${format.toUpperCase()}`,
        description: err.message,
      });
    } finally {
      setExporting(false);
    }
  };

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
      case "objetivo":
        return <ObjetivoSection />;
      case "documentos":
        return <DocumentosSection />;
      case "resumo-adm":
        return <ResumoAdmSection />;
      case "metodologia-prev":
        return <MetodologiaSection />;
      case "identificacao":
      case "qualidade-segurado":
      case "beneficio":
        return <SeguradoSection />;
      case "historia-clinica":
      case "historia-laboral":
      case "antecedentes":
      case "tratamentos":
        return <HistoriaSection />;
      case "laudos-medicos":
      case "exames-complementares":
      case "exame-fisico":
        return <ExameSection />;
      case "cids":
        return <CIDSection />;
      case "nexo-prev":
      case "incapacidade":
        return <NexoIncapacidadeSection />;
      case "enquadramento-legal":
        return <EnquadramentoSection />;
      case "conclusao-prev":
        return <ConclusaoSection />;
      case "quesitos-prev":
        return <QuesitosSection />;
      case "referencias":
        return <ReferenciasSection />;
      case "honorarios":
        return <HonorariosSection />;
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("docx")}>
                <FileType className="h-4 w-4 mr-2" />
                DOCX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
