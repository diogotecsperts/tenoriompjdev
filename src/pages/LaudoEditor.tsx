import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { 
  Save, 
  FileText, 
  Printer, 
  ChevronLeft, 
  ChevronRight, 
  Menu,
  StickyNote,
  User,
  FileCheck,
  Stethoscope,
  ClipboardCheck,
  HelpCircle,
  LayoutGrid,
  Scroll,
  CheckCircle2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useLaudoProgress } from "@/hooks/useLaudoProgress";

// Import section components
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

// Consolidated cards structure
const consolidatedCards = [
  {
    id: "preliminares",
    label: "Dados Preliminares",
    description: "Dados do perito, processo e documentos avaliados",
    icon: User,
    sections: [
      { id: "perito", label: "Dados do Perito", component: DadosPerito },
      { id: "processo", label: "Dados do Processo", component: DadosProcesso },
      { id: "documentos", label: "Documentos Avaliados", component: DocumentosAvaliacao },
    ],
  },
  {
    id: "periciando",
    label: "Dados do Periciando",
    description: "Dados da vítima, acidente e histórico clínico",
    icon: FileCheck,
    sections: [
      { id: "vitima", label: "Dados da Vítima", component: DadosVitima },
      { id: "acidente", label: "Dados do Acidente", component: DadosAcidente },
      { id: "anamnese", label: "Anamnese", component: Anamnese },
      { id: "antecedentes", label: "Antecedentes Patológicos", component: AntecedentesPatologicos },
      { id: "planejamento", label: "Planejamento", component: Planejamento },
    ],
  },
  {
    id: "exame",
    label: "Exame Clínico",
    description: "Laudos médicos, exames e exame físico",
    icon: Stethoscope,
    sections: [
      { id: "laudos", label: "Laudos Médicos", component: LaudosMedicos },
      { id: "exames", label: "Exames Complementares", component: ExamesComplementares },
      { id: "exame-fisico", label: "Exame Físico", component: ExameFisico },
    ],
  },
  {
    id: "conclusao",
    label: "Conclusão Técnica",
    description: "Nexo causal, conclusão e avaliação de sequelas",
    icon: ClipboardCheck,
    sections: [
      { id: "nexo", label: "Nexo Causal", component: NexoCausal },
      { id: "conclusao", label: "Conclusão", component: Conclusao },
      { id: "sequelas", label: "Avaliação de Sequelas", component: AvaliacaoSequelas },
    ],
  },
  {
    id: "quesitos",
    label: "Respostas aos Quesitos",
    description: "Quesitos do juízo, reclamante e reclamada",
    icon: HelpCircle,
    sections: [
      { id: "quesitos", label: "Quesitos", component: Quesitos },
    ],
  },
];

type ViewMode = "paginated" | "infinite";

const VIEW_MODE_STORAGE_KEY = "laudo-editor-view-mode";

export default function LaudoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentLaudo, loadLaudo, saveLaudo, createLaudo, updateLaudo } = useLaudo();
  const [activeCard, setActiveCard] = useState("preliminares");
  const [sectionNavOpen, setSectionNavOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  
  // Progress tracking
  const progress = useLaudoProgress(currentLaudo);
  
  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return (stored as ViewMode) || "paginated";
  });

  // Memoize card IDs for scroll spy
  const cardIds = useMemo(() => consolidatedCards.map(c => `card-${c.id}`), []);

  // Scroll spy hook for infinite mode
  const { activeId: scrollSpyActiveId, scrollToSection } = useScrollSpy({
    sectionIds: cardIds,
    offset: 120,
    enabled: viewMode === "infinite",
  });

  // Sync scroll spy with activeCard in infinite mode
  useEffect(() => {
    if (viewMode === "infinite" && scrollSpyActiveId) {
      const cardId = scrollSpyActiveId.replace("card-", "");
      setActiveCard(cardId);
    }
  }, [scrollSpyActiveId, viewMode]);

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

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

  useEffect(() => {
    if (currentLaudo) {
      setNotes((currentLaudo as any).anotacoes || "");
    }
  }, [currentLaudo]);

  const handleSave = () => {
    if (currentLaudo) {
      updateLaudo({ ...currentLaudo, anotacoes: notes } as any);
    }
    saveLaudo();
  };

  const handlePrint = () => {
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "A geração de PDF estará disponível em breve.",
    });
  };

  const toggleViewMode = () => {
    setViewMode(prev => prev === "paginated" ? "infinite" : "paginated");
  };

  const currentCardIndex = consolidatedCards.findIndex((c) => c.id === activeCard);

  const goToNextCard = () => {
    if (currentCardIndex < consolidatedCards.length - 1) {
      setActiveCard(consolidatedCards[currentCardIndex + 1].id);
    }
  };

  const goToPreviousCard = () => {
    if (currentCardIndex > 0) {
      setActiveCard(consolidatedCards[currentCardIndex - 1].id);
    }
  };

  const handleCardNavClick = (cardId: string) => {
    if (viewMode === "infinite") {
      scrollToSection(`card-${cardId}`);
    } else {
      setActiveCard(cardId);
    }
    setSectionNavOpen(false);
  };

  const currentCardData = consolidatedCards.find((c) => c.id === activeCard);

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

  // Render a single card section
  const renderCardSection = (card: typeof consolidatedCards[0]) => (
    <Card key={card.id} id={`card-${card.id}`} className="shadow-sm scroll-mt-24">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <card.icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{card.label}</CardTitle>
            <CardDescription>{card.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion 
          type="multiple" 
          defaultValue={card.sections.map(s => s.id)}
          className="space-y-4"
        >
          {card.sections.map((section, index) => {
            const SectionComponent = section.component;
            return (
              <AccordionItem 
                key={section.id} 
                value={section.id}
                className="border rounded-lg px-4"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="font-medium">{section.label}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <SectionComponent />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );

  const CardNav = () => (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {consolidatedCards.map((card) => {
          const Icon = card.icon;
          const cardProg = progress.cardProgress.find(p => p.cardId === card.id);
          const isComplete = cardProg?.percentage === 100;
          
          return (
            <button
              key={card.id}
              onClick={() => handleCardNavClick(card.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors text-left",
                activeCard === card.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg relative",
                activeCard === card.id
                  ? "bg-primary-foreground/20"
                  : "bg-muted"
              )}>
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium block truncate">{card.label}</span>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={cardProg?.percentage || 0} 
                    className={cn(
                      "h-1 flex-1",
                      activeCard === card.id ? "[&>div]:bg-primary-foreground/70" : ""
                    )}
                  />
                  <span className={cn(
                    "text-xs",
                    activeCard === card.id ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {cardProg?.percentage || 0}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Desktop Card Navigation */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Seções do Laudo
          </h2>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progresso geral</span>
              <span className="font-medium text-foreground">{progress.overallPercentage}%</span>
            </div>
            <Progress value={progress.overallPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {progress.totalFilledFields} de {progress.totalFields} campos
            </p>
          </div>
        </div>
        <CardNav />
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
                  <div className="p-4 border-b border-border space-y-3">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                      Seções do Laudo
                    </h2>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Progresso geral</span>
                        <span className="font-medium text-foreground">{progress.overallPercentage}%</span>
                      </div>
                      <Progress value={progress.overallPercentage} className="h-2" />
                    </div>
                  </div>
                  <CardNav />
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
              {/* View Mode Toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={toggleViewMode}
                      className="h-9 w-9"
                    >
                      {viewMode === "paginated" ? (
                        <Scroll className="h-4 w-4" />
                      ) : (
                        <LayoutGrid className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{viewMode === "paginated" ? "Modo scroll infinito" : "Modo paginado"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Notes Button */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setNotesOpen(true)}
                className="relative"
              >
                <StickyNote className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Anotações</span>
                {notes.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
              
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
            {viewMode === "paginated" ? (
              // Paginated Mode - Show only active card
              <>
                {currentCardData && renderCardSection(currentCardData)}

                {/* Card Navigation Footer */}
                <div className="flex items-center justify-between mt-6 pb-6">
                  <Button
                    variant="outline"
                    onClick={goToPreviousCard}
                    disabled={currentCardIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Anterior
                  </Button>
                  
                  <div className="flex gap-1">
                    {consolidatedCards.map((card, index) => (
                      <button
                        key={card.id}
                        onClick={() => setActiveCard(card.id)}
                        className={cn(
                          "h-2 w-2 rounded-full transition-colors",
                          activeCard === card.id ? "bg-primary" : "bg-muted hover:bg-muted-foreground/50"
                        )}
                        aria-label={`Ir para ${card.label}`}
                      />
                    ))}
                  </div>
                  
                  <Button
                    onClick={goToNextCard}
                    disabled={currentCardIndex === consolidatedCards.length - 1}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </>
            ) : (
              // Infinite Scroll Mode - Show all cards
              <div className="space-y-8 pb-6">
                {consolidatedCards.map(card => renderCardSection(card))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Notes Sheet */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-primary" />
              Anotações
            </SheetTitle>
            <SheetDescription>
              Suas anotações pessoais sobre este laudo
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escreva suas anotações aqui..."
              className="min-h-[400px] resize-none"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {notes.length} caracteres
              </span>
              <Button size="sm" onClick={() => {
                handleSave();
                setNotesOpen(false);
              }}>
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
