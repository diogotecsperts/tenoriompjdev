import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLaudo, LaudoData } from "@/contexts/LaudoContext";
import { useNavigationGuardContext } from "@/contexts/NavigationGuardContext";
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
  CheckCircle2,
  Sparkles,
  Loader2,
  RefreshCw,
  ClipboardCopy,
  CheckCircle,
  RotateCcw,
  BookOpen,
  Briefcase
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useLaudoProgress } from "@/hooks/useLaudoProgress";
import { generateLaudoPDF, validateLaudoForPDF } from "@/utils/generateLaudoPDF";
import { AIInfoModal } from "@/components/laudo/AIInfoModal";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LAUDO_CARDS_STRUCTURE } from "@/lib/laudo-structure";

// Import section components
import { DadosProcesso } from "@/components/laudo/sections/DadosProcesso";
import { DocumentosAvaliacao } from "@/components/laudo/sections/DocumentosAvaliacao";
import { DadosVitima } from "@/components/laudo/sections/DadosVitima";
import { DadosAcidente } from "@/components/laudo/sections/DadosAcidente";
import { Anamnese } from "@/components/laudo/sections/Anamnese";
import { AntecedentesPatologicos } from "@/components/laudo/sections/AntecedentesPatologicos";
import { LaudosMedicos } from "@/components/laudo/sections/LaudosMedicos";
import { ExamesComplementares } from "@/components/laudo/sections/ExamesComplementares";
import { ExameFisico } from "@/components/laudo/sections/ExameFisico";
import { NexoCausal } from "@/components/laudo/sections/NexoCausal";
import { Conclusao } from "@/components/laudo/sections/Conclusao";
import { AvaliacaoSequelas } from "@/components/laudo/sections/AvaliacaoSequelas";
import { Quesitos } from "@/components/laudo/sections/Quesitos";
import { ObjetivoPericia } from "@/components/laudo/sections/ObjetivoPericia";
import { ResumoAutos } from "@/components/laudo/sections/ResumoAutos";
import { MetodologiaPericial } from "@/components/laudo/sections/MetodologiaPericial";
import { DadosPostoTrabalho } from "@/components/laudo/sections/DadosPostoTrabalho";
import { DescricaoTecnicaDoencas } from "@/components/laudo/sections/DescricaoTecnicaDoencas";
import { AnaliseIncapacidade } from "@/components/laudo/sections/AnaliseIncapacidade";
import { ReferenciasBibliograficas } from "@/components/laudo/sections/ReferenciasBibliograficas";
import { DadosPerito } from "@/components/laudo/sections/DadosPerito";

// Map section IDs to components
const sectionComponents: Record<string, React.ComponentType<any>> = {
  perito: DadosPerito,
  processo: DadosProcesso,
  objetivo: ObjetivoPericia,
  documentos: DocumentosAvaliacao,
  resumo: ResumoAutos,
  metodologia: MetodologiaPericial,
  vitima: DadosVitima,
  acidente: DadosAcidente,
  anamnese: Anamnese,
  antecedentes: AntecedentesPatologicos,
  "dados-posto": DadosPostoTrabalho,
  laudos: LaudosMedicos,
  exames: ExamesComplementares,
  "exame-fisico": ExameFisico,
  "descricao-doencas": DescricaoTecnicaDoencas,
  nexo: NexoCausal,
  "analise-incapacidade": AnaliseIncapacidade,
  conclusao: Conclusao,
  sequelas: AvaliacaoSequelas,
  quesitos: Quesitos,
  referencias: ReferenciasBibliograficas,
};

// Map card IDs to icons
const cardIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  preliminares: User,
  "resumo-autos": FileText,
  periciando: FileCheck,
  "posto-trabalho": Briefcase,
  exame: Stethoscope,
  "analise-tecnica": ClipboardCheck,
  conclusao: CheckCircle2,
  referencias: BookOpen,
};

// Build consolidatedCards from shared structure + components
const consolidatedCards = LAUDO_CARDS_STRUCTURE.map(card => ({
  ...card,
  icon: cardIcons[card.id] || FileText,
  sections: card.sections.map(section => ({
    ...section,
    component: sectionComponents[section.id],
  })),
}));

type ViewMode = "paginated" | "infinite";

const VIEW_MODE_STORAGE_KEY = "laudo-editor-view-mode";

export default function LaudoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentLaudo, loadLaudo, saveLaudo, createLocalLaudo, updateLaudo, deleteLaudo, updateLaudoStatus, setCurrentLaudo } = useLaudo();
  const { setGuarded, setOnNavigationRequest } = useNavigationGuardContext();
  const [activeCard, setActiveCard] = useState("preliminares");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  
  // Dirty state tracking - reference to original laudo state when loaded
  const originalLaudoRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Function to check if there are actual changes
  const checkForChanges = useCallback(() => {
    if (!currentLaudo || !originalLaudoRef.current) return false;
    // Compare relevant fields only (exclude timestamps and metadata)
    const currentSnapshot = JSON.stringify({
      ...currentLaudo,
      createdAt: undefined,
      updatedAt: undefined,
    });
    return currentSnapshot !== originalLaudoRef.current;
  }, [currentLaudo]);

  // Update hasUnsavedChanges whenever currentLaudo changes
  useEffect(() => {
    if (currentLaudo && originalLaudoRef.current) {
      setHasUnsavedChanges(checkForChanges());
    }
  }, [currentLaudo, checkForChanges]);

  // Register navigation guard - only when there are unsaved changes
  useEffect(() => {
    if (currentLaudo?.id) {
      setGuarded(hasUnsavedChanges);
      setOnNavigationRequest((destination: string) => {
        // If no changes, navigate directly
        if (!hasUnsavedChanges) {
          navigate(destination);
          return;
        }
        // Otherwise show dialog
        setPendingDestination(destination);
        setShowExitDialog(true);
      });
    }
    
    return () => {
      setGuarded(false);
      setOnNavigationRequest(null);
    };
  }, [currentLaudo?.id, hasUnsavedChanges, setGuarded, setOnNavigationRequest, navigate]);

  // Handle browser back/refresh with beforeunload - only if unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "Você tem alterações não salvas. Deseja sair?";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleDiscardChanges = () => {
    toast({
      title: "Alterações descartadas",
      description: "As alterações não foram salvas.",
    });
    setShowExitDialog(false);
    setGuarded(false);
    if (pendingDestination) {
      navigate(pendingDestination);
    }
  };

  const handleSaveAndExit = async () => {
    handleSave();
    toast({
      title: "Laudo salvo",
      description: "O laudo foi salvo como rascunho.",
    });
    setShowExitDialog(false);
    setGuarded(false);
    if (pendingDestination) {
      navigate(pendingDestination);
    }
  };

  const handleCancelExit = () => {
    setShowExitDialog(false);
    setPendingDestination(null);
  };
  const [sectionNavOpen, setSectionNavOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  
  // Resumo da Pericia state
  const [resumoPericiaOpen, setResumoPericiaOpen] = useState(false);
  const [loadingResumoPericia, setLoadingResumoPericia] = useState(false);
  
  // Secret AI Info Modal state
  const [showAIInfoModal, setShowAIInfoModal] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const secretClickTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Progress tracking
  const progress = useLaudoProgress(currentLaudo);
  
  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return (stored as ViewMode) || "paginated";
  });

  // Memoize card IDs for scroll spy
  const cardIds = useMemo(() => consolidatedCards.map(c => `card-${c.id}`), []);

  // Ref for the main scroll container
  const mainContentRef = useRef<HTMLElement>(null);

  // Scroll spy hook for infinite mode
  const { activeId: scrollSpyActiveId, scrollToSection } = useScrollSpy({
    sectionIds: cardIds,
    offset: 120,
    enabled: viewMode === "infinite",
    scrollContainerRef: mainContentRef,
  });

  // Sync scroll spy with activeCard in infinite mode
  useEffect(() => {
    if (viewMode === "infinite" && scrollSpyActiveId) {
      const cardId = scrollSpyActiveId.replace("card-", "");
      // Only update if cardId actually changed to prevent flickering
      setActiveCard(prev => prev !== cardId ? cardId : prev);
    }
  }, [scrollSpyActiveId, viewMode]);

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    const initializeLaudo = async () => {
      if (id && id !== "new") {
        await loadLaudo(id);
      } else if (id === "new" || !id) {
        // Create laudo in memory only - don't persist to database yet
        const localLaudo = await createLocalLaudo();
        setCurrentLaudo(localLaudo);
        // Stay on /laudo/new - URL will update when user saves
      }
    };
    initializeLaudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Set original reference when laudo is loaded and sync notes
  useEffect(() => {
    if (currentLaudo) {
      setNotes((currentLaudo as any).anotacoes || "");
      // Set original reference for dirty state detection
      if (!originalLaudoRef.current || originalLaudoRef.current !== JSON.stringify({
        ...currentLaudo,
        createdAt: undefined,
        updatedAt: undefined,
      })) {
        originalLaudoRef.current = JSON.stringify({
          ...currentLaudo,
          createdAt: undefined,
          updatedAt: undefined,
        });
        setHasUnsavedChanges(false);
      }
    }
  }, [currentLaudo?.id]); // Only reset when loading a new laudo

  // Secret click detection - 5 rapid clicks to show AI info
  useEffect(() => {
    if (secretClickCount >= 5) {
      if (currentLaudo?.aiMetadata) {
        setShowAIInfoModal(true);
      } else {
        toast({
          title: "Sem dados de IA",
          description: "Este laudo não foi importado com IA.",
        });
      }
      setSecretClickCount(0);
    }
  }, [secretClickCount, currentLaudo?.aiMetadata]);

  // Keyboard shortcut Ctrl+Shift+A for AI info
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        if (currentLaudo?.aiMetadata) {
          setShowAIInfoModal(true);
        } else {
          toast({
            title: "Sem dados de IA",
            description: "Este laudo não foi importado com IA.",
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentLaudo?.aiMetadata]);

  const handleSave = async () => {
    if (currentLaudo) {
      updateLaudo({ ...currentLaudo, anotacoes: notes } as any);
    }
    const result = await saveLaudo();
    
    // If this was a new laudo, navigate to the real URL
    if (result?.id && currentLaudo?.id === 'new') {
      navigate(`/laudo/${result.id}`, { replace: true });
    }
    
    // Update reference after save to reflect saved state
    if (currentLaudo) {
      originalLaudoRef.current = JSON.stringify({
        ...currentLaudo,
        id: result?.id || currentLaudo.id,
        anotacoes: notes,
        createdAt: undefined,
        updatedAt: undefined,
      });
      setHasUnsavedChanges(false);
    }
  };

  const handlePrint = async () => {
    if (!currentLaudo) return;
    
    // Validate required fields
    const validation = validateLaudoForPDF(currentLaudo);
    
    if (!validation.valid) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios não preenchidos",
        description: `Preencha: ${validation.missingFields.join(", ")}`,
      });
      return;
    }
    
    try {
      await generateLaudoPDF(currentLaudo);
      toast({
        title: "PDF gerado com sucesso",
        description: "O laudo foi baixado para seu dispositivo.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o documento. Tente novamente.",
      });
    }
  };

  // Handle view mode toggle - simple toggle only
  const handleViewModeClick = () => {
    setViewMode(prev => prev === "paginated" ? "infinite" : "paginated");
  };

  // Handle secret AI icon click
  const handleSecretAIClick = () => {
    setSecretClickCount(prev => prev + 1);
    
    if (secretClickTimeout.current) {
      clearTimeout(secretClickTimeout.current);
    }
    secretClickTimeout.current = setTimeout(() => {
      setSecretClickCount(0);
    }, 2000);
  };

  // Gerar sugestões de IA para a perícia
  const gerarResumoPericia = async () => {
    if (!currentLaudo) return;
    
    setLoadingResumoPericia(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'sugestoes_pericia',
          contexto: {
            cids: currentLaudo.conclusaoCID,
            historiaAcidente: currentLaudo.historiaAcidente,
            historiaAtual: currentLaudo.historiaAtual,
            postoTrabalho: currentLaudo.descricaoAtividadesLaborais,
            atividadesLaborais: currentLaudo.descricaoAtividadesLaborais,
            antecedentes: currentLaudo.antecedentes,
          }
        }
      });
      
      if (error) throw error;
      
      // Salvar no contexto do laudo
      updateLaudo({ resumoPericia: data.texto } as Partial<LaudoData>);
      
      // Salvar imediatamente no banco para garantir persistência
      const { error: saveError } = await supabase
        .from('laudos')
        .update({ resumo_pericia: data.texto })
        .eq('id', currentLaudo.id);
      
      if (saveError) {
        console.error('Erro ao salvar resumo da perícia:', saveError);
      }
      
      toast({
        title: "Sugestões geradas e salvas",
        description: `Usando ${data.provider}/${data.model}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar sugestões",
        description: error.message || "Tente novamente mais tarde.",
      });
    } finally {
      setLoadingResumoPericia(false);
    }
  };

  // Copiar resumo para anotações - salva automaticamente no banco
  const copiarParaAnotacoes = async () => {
    if (!currentLaudo?.resumoPericia) return;
    
    const novaAnotacao = notes 
      ? `${notes}\n\n---\n\n### Resumo da Perícia (IA)\n${currentLaudo.resumoPericia}`
      : `### Resumo da Perícia (IA)\n${currentLaudo.resumoPericia}`;
    
    // Atualizar estado local
    setNotes(novaAnotacao);
    
    try {
      // Salvar diretamente no banco para garantir persistência
      const { error } = await supabase
        .from('laudos')
        .update({ anotacoes: novaAnotacao })
        .eq('id', currentLaudo.id);
      
      if (error) throw error;
      
      // Atualizar contexto local
      updateLaudo({ anotacoes: novaAnotacao } as Partial<LaudoData>);
      
      toast({
        title: "Salvo nas anotações",
        description: "O resumo foi salvo permanentemente nas anotações.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (secretClickTimeout.current) {
        clearTimeout(secretClickTimeout.current);
      }
    };
  }, []);

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
    // Set activeCard immediately before scroll to prevent flickering
    setActiveCard(cardId);
    
    if (viewMode === "infinite") {
      scrollToSection(`card-${cardId}`);
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
                <AccordionContent className="pb-4 px-2">
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
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "text-xs px-2 py-0",
                      currentLaudo?.status === 'finalizado' && "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    )}
                  >
                    {currentLaudo?.status === 'finalizado' ? 'Concluído' : 'Em andamento'}
                  </Badge>
                <span>•</span>
                  <span>Salvo automaticamente</span>
                  {/* Secret AI trigger - highly discrete */}
                  {currentLaudo?.aiMetadata && (
                    <button
                      onClick={handleSecretAIClick}
                      className="ml-1 p-0.5 opacity-[0.15] hover:opacity-[0.25] transition-opacity cursor-default"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      <Sparkles className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
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
                      onClick={handleViewModeClick}
                      className="h-9 w-9 relative"
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

              {/* Resumo da Perícia Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setResumoPericiaOpen(true);
                        if (!currentLaudo?.resumoPericia) gerarResumoPericia();
                      }}
                      className="relative"
                    >
                      <Sparkles className="h-4 w-4 sm:mr-2 text-primary" />
                      <span className="hidden sm:inline">Resumo da Perícia</span>
                      {currentLaudo?.resumoPericia && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Sugestões de IA para perguntas e exame físico</p>
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
              
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Gerar PDF</span>
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Salvar</span>
              </Button>

              {/* Finalizar/Reabrir Laudo Button */}
              {currentLaudo?.status !== 'finalizado' ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Finalizar</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Finalizar Laudo</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja marcar este laudo como concluído? 
                        Você ainda poderá reabri-lo posteriormente se necessário.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => currentLaudo && updateLaudoStatus(currentLaudo.id, 'finalizado')}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Finalizar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => currentLaudo && updateLaudoStatus(currentLaudo.id, 'rascunho')}
                >
                  <RotateCcw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Reabrir</span>
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main ref={mainContentRef} className="flex-1 overflow-auto p-4 lg:p-6 bg-background">
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

      {/* Resumo da Perícia Sheet */}
      <Sheet open={resumoPericiaOpen} onOpenChange={setResumoPericiaOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Resumo da Perícia
            </SheetTitle>
            <SheetDescription>
              Sugestões de IA para auxiliar durante a perícia (uso interno - não aparece no PDF)
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 flex flex-col flex-1 min-h-0">
            {loadingResumoPericia ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Gerando sugestões...</p>
              </div>
            ) : currentLaudo?.resumoPericia ? (
              <ScrollArea className="flex-1 pr-2">
                <div className="prose-narrow">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {currentLaudo.resumoPericia}
                  </ReactMarkdown>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground mb-4">
                  Preencha alguns dados do laudo para gerar sugestões
                </p>
                <Button onClick={gerarResumoPericia}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar Sugestões
                </Button>
              </div>
            )}
          </div>
          
          {/* Footer com botões */}
          {currentLaudo?.resumoPericia && !loadingResumoPericia && (
            <div className="pt-4 border-t flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={gerarResumoPericia}
                      disabled={loadingResumoPericia}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Gera novas sugestões baseadas nos dados atuais do laudo usando IA</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <Button 
                className="flex-1"
                onClick={copiarParaAnotacoes}
              >
                <ClipboardCopy className="h-4 w-4 mr-2" />
                Salvar em Anotações
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={(open) => {
        if (!open) handleCancelExit();
      }}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja salvar as alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está saindo do editor de laudo. Escolha uma opção abaixo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <AlertDialogCancel onClick={handleCancelExit} className="mt-0">
              Continuar editando
            </AlertDialogCancel>
            <Button 
              variant="outline" 
              onClick={handleDiscardChanges}
              className="w-full sm:w-auto"
            >
              Descartar alterações
            </Button>
            <AlertDialogAction onClick={handleSaveAndExit} className="w-full sm:w-auto">
              Salvar alterações
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Secret AI Info Modal */}
      <AIInfoModal
        open={showAIInfoModal}
        onOpenChange={setShowAIInfoModal}
        aiMetadata={currentLaudo?.aiMetadata || null}
      />
    </div>
  );
}
