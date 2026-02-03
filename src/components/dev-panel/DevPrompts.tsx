import { useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  Search, 
  FileText, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  MessageSquare,
  Edit3,
  Clock,
  ChevronRight,
  ChevronDown,
  Sparkles,
  User,
  Stethoscope,
  ClipboardCheck,
  BookOpen,
  Briefcase,
  Download,
  Loader2,
  Database,
  FileDown,
  AlertTriangle
} from "lucide-react";
import { jsPDF } from "jspdf";
import { cn } from "@/lib/utils";
import { PromptEditor } from "./PromptEditor";
import { LAUDO_CARDS_STRUCTURE, PROMPT_ONLY_CARDS } from "@/lib/laudo-structure";
import { useScrollSpy } from "@/hooks/useScrollSpy";

// ============================================
// TIPOS
// ============================================

interface PromptConfig {
  id: string;
  prompt: string;
  description?: string;
  cardId?: string;
  sectionId?: string;
  order?: number;
  variables?: string[];
  isClassified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Map card IDs to icons
const cardIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  preliminares: User,
  "resumo-autos": FileText,
  periciando: MessageSquare,
  "posto-trabalho": Briefcase,
  exame: Stethoscope,
  "analise-tecnica": ClipboardCheck,
  conclusao: CheckCircle2,
  referencias: BookOpen,
  _system: RefreshCw,
  _global: Sparkles,
};

// Build LAUDO_STRUCTURE from shared module
const LAUDO_STRUCTURE = [...LAUDO_CARDS_STRUCTURE, ...PROMPT_ONLY_CARDS].map(card => ({
  id: card.id,
  title: card.label,
  icon: cardIcons[card.id] || FileText,
  sections: card.sections.map(s => ({ id: s.id, label: s.label })),
}));

// ============================================
// PROMPT TYPE UTILITIES
// ============================================

function getPromptType(promptId: string): { type: 'gen' | 'regen' | 'system' | 'import'; label: string; color: string } {
  if (promptId.startsWith('prompt_gen_')) {
    return { type: 'gen', label: 'Gerar', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' };
  }
  if (promptId.startsWith('prompt_regen_')) {
    return { type: 'regen', label: 'Regerar', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30' };
  }
  if (promptId.startsWith('prompt_import_')) {
    return { type: 'import', label: 'Importar', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30' };
  }
  return { type: 'system', label: 'Sistema', color: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30' };
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function DevPrompts() {
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(LAUDO_STRUCTURE.map(c => c.id)));
  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"classified" | "unclassified">("classified");
  const [showSeedConfirmDialog, setShowSeedConfirmDialog] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Get all section IDs for scroll spy
  const allSectionIds = useMemo(() => 
    LAUDO_STRUCTURE.flatMap(card => card.sections.map(s => `section-${s.id}`)),
    []
  );

  // Use scroll spy for navigation highlighting
  const { activeId, scrollToSection } = useScrollSpy({
    sectionIds: allSectionIds,
    offset: 120,
    enabled: activeTab === "classified"
  });

  // Carregar prompts
  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_config")
        .select("id, value, description, updated_at")
        .like("id", "prompt_%");

      if (error) throw error;

      const loadedPrompts: PromptConfig[] = (data || []).map((row) => {
        const config = row.value as unknown as PromptConfig;
        return {
          ...config,
          id: row.id,
          description: config.description || row.description || "",
          updatedAt: row.updated_at || undefined
        };
      });

      setPrompts(loadedPrompts);
    } catch (error) {
      console.error("Erro ao carregar prompts:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar prompts"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  // Carregar prompts padrão via edge function
  const seedPrompts = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-prompts', {
        method: 'POST'
      });

      if (error) throw error;

      toast({
        title: "Prompts carregados!",
        description: `${data.inserted} inseridos, ${data.updated} atualizados`,
      });

      await fetchPrompts();
    } catch (error) {
      console.error("Erro ao carregar prompts:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar prompts padrão"
      });
    } finally {
      setSeeding(false);
    }
  };

  // Prompts classificados vs não classificados
  const { classifiedPrompts, unclassifiedPrompts } = useMemo(() => {
    const classified: PromptConfig[] = [];
    const unclassified: PromptConfig[] = [];

    prompts.forEach(p => {
      if (p.cardId && p.sectionId) {
        classified.push(p);
      } else {
        unclassified.push(p);
      }
    });

    return { classifiedPrompts: classified, unclassifiedPrompts: unclassified };
  }, [prompts]);

  // Filtrar por busca
  const filteredClassified = useMemo(() => {
    if (!searchTerm) return classifiedPrompts;
    const term = searchTerm.toLowerCase();
    return classifiedPrompts.filter(p => 
      p.id.toLowerCase().includes(term) ||
      (p.description?.toLowerCase().includes(term)) ||
      (p.prompt?.toLowerCase().includes(term))
    );
  }, [classifiedPrompts, searchTerm]);

  const filteredUnclassified = useMemo(() => {
    if (!searchTerm) return unclassifiedPrompts;
    const term = searchTerm.toLowerCase();
    return unclassifiedPrompts.filter(p => 
      p.id.toLowerCase().includes(term) ||
      (p.description?.toLowerCase().includes(term)) ||
      (p.prompt?.toLowerCase().includes(term))
    );
  }, [unclassifiedPrompts, searchTerm]);

  // Agrupar prompts classificados por card/section
  const groupedPrompts = useMemo(() => {
    const grouped: Record<string, Record<string, PromptConfig[]>> = {};
    
    LAUDO_STRUCTURE.forEach(card => {
      grouped[card.id] = {};
      card.sections.forEach(section => {
        grouped[card.id][section.id] = [];
      });
    });

    filteredClassified.forEach(p => {
      if (p.cardId && p.sectionId && grouped[p.cardId]?.[p.sectionId]) {
        grouped[p.cardId][p.sectionId].push(p);
      }
    });

    return grouped;
  }, [filteredClassified]);

  // Separar prompts por tipo (Gerar vs Regerar)
  const getPromptsTypeSplit = (prompts: PromptConfig[]) => {
    const genPrompts: PromptConfig[] = [];
    const regenPrompts: PromptConfig[] = [];
    const otherPrompts: PromptConfig[] = [];

    prompts.forEach(p => {
      const type = getPromptType(p.id);
      if (type.type === 'gen') {
        genPrompts.push(p);
      } else if (type.type === 'regen') {
        regenPrompts.push(p);
      } else {
        otherPrompts.push(p);
      }
    });

    return { genPrompts, regenPrompts, otherPrompts };
  };

  // Toggle card expansion
  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  // Abrir editor
  const openEditor = (prompt: PromptConfig) => {
    setSelectedPrompt(prompt);
    setEditorOpen(true);
  };

  // Callback após salvar
  const handleSaved = () => {
    fetchPrompts();
    setEditorOpen(false);
    setSelectedPrompt(null);
  };

  // Contar prompts por card
  const getCardPromptCount = (cardId: string) => {
    if (!groupedPrompts[cardId]) return 0;
    return Object.values(groupedPrompts[cardId]).reduce((sum, arr) => sum + arr.length, 0);
  };

  // Contar prompts por seção
  const getSectionPromptCount = (cardId: string, sectionId: string) => {
    return groupedPrompts[cardId]?.[sectionId]?.length || 0;
  };

  // Scroll para seção específica
  const handleScrollToSection = (sectionId: string) => {
    scrollToSection(`section-${sectionId}`);
  };

  // Exportar prompts para PDF
  const exportToPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPos = 20;

      const checkNewPage = (requiredSpace: number = 30) => {
        if (yPos + requiredSpace > pageHeight - 20) {
          doc.addPage();
          yPos = 20;
          return true;
        }
        return false;
      };

      const splitText = (text: string, maxWidth: number): string[] => {
        return doc.splitTextToSize(text, maxWidth);
      };

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("BACKUP DE PROMPTS DE IA", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const dateStr = `Data: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`;
      doc.text(dateStr, pageWidth / 2, yPos, { align: "center" });
      yPos += 6;

      doc.text(`Total: ${prompts.length} prompts`, pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      doc.setDrawColor(100);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      // Iterar por cada card na ordem do laudo
      for (const card of LAUDO_STRUCTURE) {
        const cardPrompts = Object.values(groupedPrompts[card.id] || {}).flat();
        if (cardPrompts.length === 0) continue;

        checkNewPage(25);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(59, 130, 246);
        doc.text(card.title.toUpperCase(), margin, yPos);
        yPos += 3;

        doc.setDrawColor(59, 130, 246);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        doc.setTextColor(0);

        for (const section of card.sections) {
          const sectionPrompts = groupedPrompts[card.id]?.[section.id] || [];
          if (sectionPrompts.length === 0) continue;

          for (const prompt of sectionPrompts) {
            checkNewPage(50);

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text(section.label, margin, yPos);
            yPos += 6;

            const promptType = getPromptType(prompt.id);
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            doc.text(`ID: ${prompt.id}  |  Tipo: ${promptType.label}`, margin, yPos);
            yPos += 5;

            if (prompt.variables && prompt.variables.length > 0) {
              doc.text(`Variáveis: ${prompt.variables.join(", ")}`, margin, yPos);
              yPos += 5;
            }

            if (prompt.updatedAt) {
              doc.text(`Atualizado em: ${new Date(prompt.updatedAt).toLocaleDateString("pt-BR")}`, margin, yPos);
              yPos += 5;
            }

            doc.setTextColor(0);
            yPos += 3;

            if (prompt.description) {
              doc.setFontSize(9);
              doc.setFont("helvetica", "italic");
              const descLines = splitText(prompt.description, contentWidth);
              for (const line of descLines) {
                checkNewPage(6);
                doc.text(line, margin, yPos);
                yPos += 5;
              }
              yPos += 2;
            }

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            const promptText = prompt.prompt || "(Sem texto)";
            const promptLines = splitText(promptText, contentWidth);

            for (const line of promptLines) {
              checkNewPage(6);
              doc.text(line, margin, yPos);
              yPos += 5;
            }

            yPos += 8;
            doc.setDrawColor(220);
            doc.line(margin, yPos - 4, pageWidth - margin, yPos - 4);
          }
        }

        yPos += 5;
      }

      // Prompts não classificados
      if (unclassifiedPrompts.length > 0) {
        checkNewPage(25);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(245, 158, 11);
        doc.text("PROMPTS NÃO CLASSIFICADOS", margin, yPos);
        yPos += 3;

        doc.setDrawColor(245, 158, 11);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        doc.setTextColor(0);

        for (const prompt of unclassifiedPrompts) {
          checkNewPage(40);

          const promptType = getPromptType(prompt.id);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text(prompt.id, margin, yPos);
          yPos += 6;

          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100);
          doc.text(`Tipo: ${promptType.label}`, margin, yPos);
          yPos += 5;
          doc.setTextColor(0);

          if (prompt.description) {
            doc.setFont("helvetica", "italic");
            const descLines = splitText(prompt.description, contentWidth);
            for (const line of descLines) {
              checkNewPage(6);
              doc.text(line, margin, yPos);
              yPos += 5;
            }
            yPos += 2;
          }

          doc.setFont("helvetica", "normal");
          const promptText = prompt.prompt || "(Sem texto)";
          const promptLines = splitText(promptText, contentWidth);

          for (const line of promptLines) {
            checkNewPage(6);
            doc.text(line, margin, yPos);
            yPos += 5;
          }

          yPos += 8;
          doc.setDrawColor(220);
          doc.line(margin, yPos - 4, pageWidth - margin, yPos - 4);
        }
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      doc.save(`prompts-backup-${timestamp}.pdf`);

      toast({
        title: "PDF exportado!",
        description: `Backup com ${prompts.length} prompts salvo com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao gerar o PDF"
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">Prompts de IA</h1>
        </div>
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Estado vazio
  if (!loading && prompts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Prompts de IA</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie os prompts utilizados em todas as funções de IA do sistema
            </p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="h-16 w-16 text-muted-foreground/50 mb-6" />
            <h3 className="text-xl font-semibold mb-2">Nenhum prompt encontrado</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              O banco de dados ainda não possui prompts cadastrados. Clique no botão abaixo para
              carregar todos os prompts padrão do sistema.
            </p>
            <Button onClick={seedPrompts} disabled={seeding} size="lg">
              {seeding ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Carregando prompts...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5 mr-2" />
                  Carregar Prompts Padrão
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Isso irá inserir ~30 prompts pré-configurados e classificados
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Prompts de IA</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os prompts utilizados em todas as funções de IA do sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToPDF} variant="outline" size="sm" disabled={exporting || prompts.length === 0}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Exportar PDF
          </Button>
          <Button onClick={() => setShowSeedConfirmDialog(true)} variant="outline" size="sm" disabled={seeding}>
            {seeding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Carregar Padrão
          </Button>
          <Button onClick={fetchPrompts} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Prompts</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{prompts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classificados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{classifiedPrompts.length}</div>
          </CardContent>
        </Card>
        <Card className={cn(
          unclassifiedPrompts.length > 0 && "border-amber-500/20 bg-amber-500/5"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Não Classificados</CardTitle>
            <AlertCircle className={cn(
              "h-4 w-4",
              unclassifiedPrompts.length > 0 ? "text-amber-500" : "text-muted-foreground"
            )} />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              unclassifiedPrompts.length > 0 && "text-amber-500"
            )}>
              {unclassifiedPrompts.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar prompts por ID, descrição ou conteúdo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "classified" | "unclassified")}>
        <TabsList>
          <TabsTrigger value="classified" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Classificados ({filteredClassified.length})
          </TabsTrigger>
          <TabsTrigger value="unclassified" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Não Classificados ({filteredUnclassified.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classified" className="mt-4">
          {/* 2-Column Layout */}
          <div className="flex gap-6">
            {/* Navegação Lateral Fixa */}
            <aside className="w-64 shrink-0 hidden lg:block">
              <div className="sticky top-4">
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Navegação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[calc(100vh-400px)]">
                      <div className="p-2 space-y-1">
                        {LAUDO_STRUCTURE.map(card => {
                          const count = getCardPromptCount(card.id);
                          const isExpanded = expandedCards.has(card.id);
                          const Icon = card.icon;

                          return (
                            <Collapsible 
                              key={card.id} 
                              open={isExpanded}
                              onOpenChange={() => toggleCard(card.id)}
                            >
                              <CollapsibleTrigger className="w-full">
                                <div className={cn(
                                  "flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors",
                                  count === 0 && "opacity-50"
                                )}>
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <Icon className="h-4 w-4 text-primary" />
                                    <span className="font-medium truncate max-w-[120px]">{card.title}</span>
                                  </div>
                                  <Badge variant="outline" className="text-xs h-5 px-1.5">
                                    {count}
                                  </Badge>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-6 mt-1 space-y-0.5">
                                  {card.sections.map(section => {
                                    const sectionCount = getSectionPromptCount(card.id, section.id);
                                    const isActive = activeId === `section-${section.id}`;
                                    
                                    return (
                                      <button
                                        key={section.id}
                                        onClick={() => handleScrollToSection(section.id)}
                                        className={cn(
                                          "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between",
                                          isActive 
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                          sectionCount === 0 && "opacity-40"
                                        )}
                                      >
                                        <span className="truncate">{section.label}</span>
                                        {sectionCount > 0 && (
                                          <span className="text-[10px] bg-muted px-1 rounded">
                                            {sectionCount}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </aside>

            {/* Área de Conteúdo */}
            <div className="flex-1 min-w-0" ref={contentRef}>
              <ScrollArea className="h-[calc(100vh-400px)]">
                <div className="space-y-6 pr-4">
                  {LAUDO_STRUCTURE.map(card => {
                    const count = getCardPromptCount(card.id);
                    const Icon = card.icon;

                    if (count === 0) return null;

                    return (
                      <div key={card.id}>
                        {/* Card Header */}
                        <div className="flex items-center gap-3 mb-4 pb-2 border-b">
                          <Icon className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold">{card.title}</h2>
                          <Badge variant="secondary" className="text-xs">
                            {count} prompt{count !== 1 ? "s" : ""}
                          </Badge>
                        </div>

                        {/* Seções */}
                        <div className="space-y-4">
                          {card.sections.map(section => {
                            const sectionPrompts = groupedPrompts[card.id]?.[section.id] || [];
                            
                            if (sectionPrompts.length === 0) return null;

                            const { genPrompts, regenPrompts, otherPrompts } = getPromptsTypeSplit(sectionPrompts);

                            return (
                              <Card 
                                key={section.id} 
                                id={`section-${section.id}`}
                                className="scroll-mt-4"
                              >
                                <CardHeader className="py-3 px-4">
                                  <CardTitle className="text-base font-medium flex items-center justify-between">
                                    <span>{section.label}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {sectionPrompts.length}
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 px-4 pb-4">
                                  {/* Grid 2 colunas: Gerar | Regerar */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Coluna Gerar */}
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="h-4 w-4 text-emerald-600" />
                                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                                          Gerar
                                        </span>
                                      </div>
                                      {genPrompts.length > 0 ? (
                                        <div className="space-y-2">
                                          {genPrompts.map(prompt => (
                                            <PromptMiniCard
                                              key={prompt.id}
                                              prompt={prompt}
                                              onEdit={() => openEditor(prompt)}
                                            />
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground italic py-2">
                                          Nenhum prompt de geração
                                        </p>
                                      )}
                                    </div>

                                    {/* Coluna Regerar */}
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 mb-2">
                                        <RefreshCw className="h-4 w-4 text-blue-600" />
                                        <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                                          Regerar
                                        </span>
                                      </div>
                                      {regenPrompts.length > 0 ? (
                                        <div className="space-y-2">
                                          {regenPrompts.map(prompt => (
                                            <PromptMiniCard
                                              key={prompt.id}
                                              prompt={prompt}
                                              onEdit={() => openEditor(prompt)}
                                            />
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground italic py-2">
                                          Nenhum prompt de regeneração
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Outros prompts (Sistema, Importar) */}
                                  {otherPrompts.length > 0 && (
                                    <div className="mt-4 pt-4 border-t">
                                      <div className="flex items-center gap-2 mb-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium text-muted-foreground">
                                          Outros
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {otherPrompts.map(prompt => (
                                          <PromptMiniCard
                                            key={prompt.id}
                                            prompt={prompt}
                                            onEdit={() => openEditor(prompt)}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="unclassified" className="mt-4">
          <ScrollArea className="h-[calc(100vh-400px)]">
            {filteredUnclassified.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-primary mb-4" />
                  <h3 className="text-lg font-semibold">Tudo classificado!</h3>
                  <p className="text-muted-foreground text-center mt-1">
                    Todos os prompts estão organizados em suas respectivas seções.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                <Card className="border-amber-500/20 bg-amber-500/5 mb-4">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Prompts auto-registrados</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estes prompts foram criados automaticamente quando uma função de IA foi executada
                          mas o prompt ainda não existia no banco. Classifique-os para organizá-los na estrutura do laudo.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {filteredUnclassified.map(prompt => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    onEdit={() => openEditor(prompt)}
                    showClassifyHint
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Editor Modal */}
      <PromptEditor
        prompt={selectedPrompt}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={handleSaved}
        laudoStructure={LAUDO_STRUCTURE}
      />

      {/* Confirmation Dialog for Seed */}
      <AlertDialog open={showSeedConfirmDialog} onOpenChange={setShowSeedConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Restaurar Prompts para Padrão de Fábrica?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Esta ação irá <strong className="text-foreground">SOBRESCREVER todos os prompts</strong> existentes 
                com as versões originais do sistema.
              </p>
              <p className="text-destructive font-medium">
                ❌ Todas as suas edições personalizadas serão perdidas!
              </p>
              <p className="text-muted-foreground text-sm">
                💡 Recomendação: Faça um backup clicando em "Exportar PDF" antes de continuar.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowSeedConfirmDialog(false);
                exportToPDF();
              }}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF Primeiro
            </Button>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowSeedConfirmDialog(false);
                seedPrompts();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Restaurar Padrão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}

// ============================================
// PROMPT MINI CARD (Compacto para grid 2 colunas)
// ============================================

interface PromptMiniCardProps {
  prompt: PromptConfig;
  onEdit: () => void;
}

function PromptMiniCard({ prompt, onEdit }: PromptMiniCardProps) {
  const promptType = getPromptType(prompt.id);
  const hasVariables = (prompt.variables?.length || 0) > 0;

  return (
    <div
      className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge 
              variant="outline" 
              className={cn("text-[10px] font-medium px-1.5 py-0", promptType.color)}
            >
              {promptType.label}
            </Badge>
            {hasVariables && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
                    <Sparkles className="h-2.5 w-2.5" />
                    {prompt.variables?.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Variáveis: {prompt.variables?.join(', ')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          
          {prompt.description && (
            <p className="text-xs text-foreground mt-1 line-clamp-1">
              {prompt.description}
            </p>
          )}

          {prompt.updatedAt && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              <span>{new Date(prompt.updatedAt).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Edit3 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ============================================
// PROMPT CARD (Para não classificados)
// ============================================

interface PromptCardProps {
  prompt: PromptConfig;
  onEdit: () => void;
  showClassifyHint?: boolean;
}

function PromptCard({ prompt, onEdit, showClassifyHint }: PromptCardProps) {
  const promptPreview = prompt.prompt?.substring(0, 150) || "";
  const hasVariables = (prompt.variables?.length || 0) > 0;
  const promptType = getPromptType(prompt.id);

  return (
    <div
      className={cn(
        "border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer group",
        showClassifyHint && "border-amber-500/20"
      )}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant="outline" 
              className={cn("text-xs font-medium", promptType.color)}
            >
              {promptType.label}
            </Badge>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              {prompt.id}
            </code>
            {hasVariables && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="h-3 w-3" />
                    {prompt.variables?.length} var
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Variáveis: {prompt.variables?.join(', ')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          
          {prompt.description && (
            <p className="text-sm text-foreground mt-1">{prompt.description}</p>
          )}
          
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {promptPreview}...
          </p>

          {prompt.updatedAt && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                Atualizado em {new Date(prompt.updatedAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Clique para editar este prompt</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {showClassifyHint && (
        <div className="mt-2 pt-2 border-t border-amber-500/20">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Clique para classificar este prompt
          </p>
        </div>
      )}
    </div>
  );
}
