import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Save, FileText, Printer, ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { DadosPerito } from "@/components/laudo/sections/DadosPerito";
import { DadosProcesso } from "@/components/laudo/sections/DadosProcesso";
import { DocumentosAvaliacao } from "@/components/laudo/sections/DocumentosAvaliacao";
import { DadosVitima } from "@/components/laudo/sections/DadosVitima";
import { DadosAcidente } from "@/components/laudo/sections/DadosAcidente";
import { Anamnese } from "@/components/laudo/sections/Anamnese";
import { AntecedentesPatologicos } from "@/components/laudo/sections/AntecedentesPatologicos";
import { Planejamento } from "@/components/laudo/sections/Planejamento";
import { LaudosMedicos } from "@/components/laudo/sections/LaudosMedicos";
import { ExamesComplementares } from "@/components/laudo/sections/ExamesComplementares";
import { ExameFisico } from "@/components/laudo/sections/ExameFisico";
import { NexoCausal } from "@/components/laudo/sections/NexoCausal";
import { Conclusao } from "@/components/laudo/sections/Conclusao";
import { AvaliacaoSequelas } from "@/components/laudo/sections/AvaliacaoSequelas";
import { Quesitos } from "@/components/laudo/sections/Quesitos";

const sections = [
  { id: "perito", label: "Dados do Perito", component: DadosPerito },
  { id: "processo", label: "Dados do Processo", component: DadosProcesso },
  { id: "documentos", label: "Documentos", component: DocumentosAvaliacao },
  { id: "vitima", label: "Dados da Vítima", component: DadosVitima },
  { id: "acidente", label: "Dados do Acidente", component: DadosAcidente },
  { id: "anamnese", label: "Anamnese", component: Anamnese },
  { id: "antecedentes", label: "Antecedentes", component: AntecedentesPatologicos },
  { id: "planejamento", label: "Planejamento", component: Planejamento },
  { id: "laudos", label: "Laudos Médicos", component: LaudosMedicos },
  { id: "exames", label: "Exames Complementares", component: ExamesComplementares },
  { id: "exame-fisico", label: "Exame Físico", component: ExameFisico },
  { id: "nexo", label: "Nexo Causal", component: NexoCausal },
  { id: "conclusao", label: "Conclusão", component: Conclusao },
  { id: "sequelas", label: "Avaliação de Sequelas", component: AvaliacaoSequelas },
  { id: "quesitos", label: "Quesitos", component: Quesitos },
];

export default function LaudoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentLaudo, loadLaudo, saveLaudo, createLaudo } = useLaudo();
  const [activeSection, setActiveSection] = useState("perito");
  const [sectionNavOpen, setSectionNavOpen] = useState(false);

  useEffect(() => {
    const initializeLaudo = async () => {
      if (id && id !== "new") {
        loadLaudo(id);
      } else if (id === "new" || !id) {
        const newId = await createLaudo();
        if (newId) {
          navigate(`/laudo/${newId}`, { replace: true });
        }
      }
    };
    initializeLaudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = () => {
    saveLaudo();
  };

  const handlePrint = () => {
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "A geração de PDF estará disponível em breve.",
    });
  };

  const currentSectionIndex = sections.findIndex((s) => s.id === activeSection);

  const goToNextSection = () => {
    if (currentSectionIndex < sections.length - 1) {
      setActiveSection(sections[currentSectionIndex + 1].id);
    }
  };

  const goToPreviousSection = () => {
    if (currentSectionIndex > 0) {
      setActiveSection(sections[currentSectionIndex - 1].id);
    }
  };

  const ActiveComponent = sections.find((s) => s.id === activeSection)?.component || DadosPerito;

  if (!currentLaudo && id !== "new") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Carregando laudo...</h2>
        </div>
      </div>
    );
  }

  const SectionNav = () => (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {sections.map((section, index) => (
          <button
            key={section.id}
            onClick={() => {
              setActiveSection(section.id);
              setSectionNavOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left",
              activeSection === section.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
              activeSection === section.id
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              {index + 1}
            </span>
            <span className="truncate">{section.label}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Desktop Section Navigation */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Seções do Laudo
          </h2>
        </div>
        <SectionNav />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-4 py-3 print:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile Section Nav Trigger */}
              <Sheet open={sectionNavOpen} onOpenChange={setSectionNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72">
                  <div className="p-4 border-b border-border">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                      Seções do Laudo
                    </h2>
                  </div>
                  <SectionNav />
                </SheetContent>
              </Sheet>
              
              <div>
                <h1 className="text-base font-semibold truncate max-w-[200px] sm:max-w-none">
                  {currentLaudo?.title || "Novo Laudo"}
                </h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    Em andamento
                  </Badge>
                  <span>•</span>
                  <span>Salvo automaticamente</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Gerar PDF</span>
                </Button>
                <Badge variant="secondary" className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5">
                  Em breve
                </Badge>
              </div>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Salvar</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 bg-background">
          <div className="mx-auto max-w-4xl">
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {currentSectionIndex + 1}
                  </span>
                  {sections[currentSectionIndex]?.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActiveComponent 
                  currentIndex={currentSectionIndex}
                  totalSections={sections.length}
                  onNext={goToNextSection}
                  onPrevious={goToPreviousSection}
                />
              </CardContent>
            </Card>

            {/* Section Navigation Footer */}
            <div className="flex items-center justify-between mt-6 pb-6">
              <Button
                variant="outline"
                onClick={goToPreviousSection}
                disabled={currentSectionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>
              
              <span className="text-sm text-muted-foreground">
                {currentSectionIndex + 1} de {sections.length}
              </span>
              
              <Button
                onClick={goToNextSection}
                disabled={currentSectionIndex === sections.length - 1}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
