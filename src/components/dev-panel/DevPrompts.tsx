import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PromptEditor } from "./PromptEditor";
import { LAUDO_CARDS_STRUCTURE, PROMPT_ONLY_CARDS } from "@/lib/laudo-structure";

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
// COMPONENTE PRINCIPAL
// ============================================

export function DevPrompts() {
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(LAUDO_STRUCTURE.map(c => c.id)));
  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"classified" | "unclassified">("classified");

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

  // Estado vazio - mostrar CTA para carregar prompts
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
          <Button onClick={seedPrompts} variant="outline" size="sm" disabled={seeding}>
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
          <ScrollArea className="h-[calc(100vh-400px)]">
            <div className="space-y-3">
              {LAUDO_STRUCTURE.map(card => {
                const count = getCardPromptCount(card.id);
                const isExpanded = expandedCards.has(card.id);
                const Icon = card.icon;

                return (
                  <Card key={card.id} className={cn(count === 0 && "opacity-50")}>
                    <CardHeader
                      className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
                      onClick={() => toggleCard(card.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Icon className="h-5 w-5 text-primary" />
                          <CardTitle className="text-base">{card.title}</CardTitle>
                        </div>
                        <Badge variant={count > 0 ? "default" : "secondary"}>
                          {count} prompt{count !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="pt-0">
                        <div className="space-y-4">
                          {card.sections.map(section => {
                            const sectionPrompts = groupedPrompts[card.id]?.[section.id] || [];
                            
                            return (
                              <div key={section.id} className="border-l-2 border-border pl-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-muted-foreground">
                                    {section.label}
                                  </span>
                                  {sectionPrompts.length > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {sectionPrompts.length}
                                    </Badge>
                                  )}
                                </div>

                                {sectionPrompts.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">
                                    Nenhum prompt nesta seção
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {sectionPrompts.map(prompt => (
                                      <PromptCard
                                        key={prompt.id}
                                        prompt={prompt}
                                        onEdit={() => openEditor(prompt)}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
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
    </div>
    </TooltipProvider>
  );
}

// ============================================
// PROMPT CARD COMPONENT
// ============================================

interface PromptCardProps {
  prompt: PromptConfig;
  onEdit: () => void;
  showClassifyHint?: boolean;
}

function PromptCard({ prompt, onEdit, showClassifyHint }: PromptCardProps) {
  const promptPreview = prompt.prompt?.substring(0, 150) || "";
  const hasVariables = (prompt.variables?.length || 0) > 0;

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
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              {prompt.id}
            </code>
            {hasVariables && (
              <Badge variant="outline" className="text-xs">
                {prompt.variables?.length} var
              </Badge>
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
