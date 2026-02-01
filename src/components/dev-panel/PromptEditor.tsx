import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import { 
  Save, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Variable,
  History,
  Copy,
  RotateCcw,
  Sparkles,
  Info,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface LaudoCard {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: { id: string; label: string }[];
}

interface PromptEditorProps {
  prompt: PromptConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  laudoStructure: LaudoCard[];
}

// Mapeamento de variáveis disponíveis por tipo de prompt
const AVAILABLE_VARIABLES: Record<string, string[]> = {
  // Prompts de regeneração (regerar-campo-pdf) - recebem contexto do laudo
  'prompt_regen_descricaoTecnicaDoencas': ['cids'],
  'prompt_regen_conclusaoAnalise': ['cids', 'nexoCausal', 'exameFisico', 'examesComplementares', 'historicoOcupacional'],
  'prompt_regen_tabelaSUSEP': ['cids', 'exameFisico', 'conclusao', 'analiseIncapacidade'],
  'prompt_regen_danoEstetico': ['cids', 'exameFisico', 'conclusao'],
  'prompt_regen_auxilioTerceiros': ['cids', 'exameFisico', 'conclusao', 'analiseIncapacidade'],
  'prompt_regen_analiseIncapacidade': ['cids', 'nexoCausal', 'exameFisico', 'examesComplementares', 'postoTrabalho', 'atividadesLaborais'],
  // Prompts de geração (gerar-resumos) - já possuem contexto completo
  'prompt_gen_nexoCausal': ['cids', 'postoTrabalho', 'atividadesLaborais', 'historicoOcupacional', 'exameFisico', 'examesComplementares'],
  'prompt_gen_incapacidade': ['cids', 'nexoCausal', 'exameFisico', 'examesComplementares', 'postoTrabalho', 'atividadesLaborais'],
  'prompt_gen_conclusao': ['cids', 'nexoCausal', 'analiseIncapacidade', 'exameFisico', 'historicoOcupacional'],
};

// Todas as variáveis disponíveis no sistema
const ALL_VARIABLES = [
  { name: 'cids', desc: 'CIDs diagnosticados (JSON)' },
  { name: 'postoTrabalho', desc: 'Descrição do posto de trabalho' },
  { name: 'atividadesLaborais', desc: 'Descrição das atividades laborais' },
  { name: 'historicoOcupacional', desc: 'Histórico ocupacional' },
  { name: 'historiaAcidente', desc: 'História do acidente' },
  { name: 'historiaAtual', desc: 'História atual / Anamnese' },
  { name: 'exameFisico', desc: 'Exame físico' },
  { name: 'examesComplementares', desc: 'Exames complementares' },
  { name: 'antecedentes', desc: 'Antecedentes patológicos' },
  { name: 'tratamentos', desc: 'Tratamentos realizados' },
  { name: 'afastamentos', desc: 'Períodos de afastamento' },
  { name: 'nexoCausal', desc: 'Justificativa do nexo causal' },
  { name: 'nexoCausalTipo', desc: 'Tipo de nexo causal' },
  { name: 'conclusao', desc: 'Análise conclusiva' },
  { name: 'conclusaoIncapacidade', desc: 'Conclusão sobre incapacidade' },
  { name: 'laudosMedicos', desc: 'Laudos médicos' },
  { name: 'tabelaSUSEP', desc: 'Tabela SUSEP' },
  { name: 'danoEstetico', desc: 'Dano estético' },
  { name: 'auxilioTerceiros', desc: 'Auxílio de terceiros' },
  { name: 'analiseIncapacidade', desc: 'Análise de incapacidade laboral' },
];

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

export function PromptEditor({
  prompt,
  open,
  onOpenChange,
  onSaved,
  laudoStructure
}: PromptEditorProps) {
  const [saving, setSaving] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCardId, setEditedCardId] = useState("");
  const [editedSectionId, setEditedSectionId] = useState("");
  const [editedOrder, setEditedOrder] = useState(0);
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Extrair variáveis do prompt
  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\$\{(\w+)\}/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -1)))];
  };

  const detectedVariables = extractVariables(editedPrompt);

  // Carregar dados do prompt quando abrir
  useEffect(() => {
    if (prompt && open) {
      setEditedPrompt(prompt.prompt || "");
      setEditedDescription(prompt.description || "");
      setEditedCardId(prompt.cardId || "");
      setEditedSectionId(prompt.sectionId || "");
      setEditedOrder(prompt.order || 0);
      setOriginalPrompt(prompt.prompt || "");
      setHasChanges(false);
    }
  }, [prompt, open]);

  // Detectar mudanças
  useEffect(() => {
    if (!prompt) return;
    
    const promptChanged = editedPrompt !== (prompt.prompt || "");
    const descChanged = editedDescription !== (prompt.description || "");
    const cardChanged = editedCardId !== (prompt.cardId || "");
    const sectionChanged = editedSectionId !== (prompt.sectionId || "");
    const orderChanged = editedOrder !== (prompt.order || 0);
    
    setHasChanges(promptChanged || descChanged || cardChanged || sectionChanged || orderChanged);
  }, [editedPrompt, editedDescription, editedCardId, editedSectionId, editedOrder, prompt]);

  // Seções disponíveis baseado no card selecionado
  const availableSections = editedCardId
    ? laudoStructure.find(c => c.id === editedCardId)?.sections || []
    : [];

  // Resetar seção quando mudar card
  useEffect(() => {
    if (editedCardId && !availableSections.find(s => s.id === editedSectionId)) {
      setEditedSectionId("");
    }
  }, [editedCardId, availableSections, editedSectionId]);

  // Salvar alterações
  const handleSave = async () => {
    if (!prompt) return;

    setSaving(true);
    try {
      const updatedConfig = {
        id: prompt.id,
        prompt: editedPrompt,
        description: editedDescription,
        cardId: editedCardId || undefined,
        sectionId: editedSectionId || undefined,
        order: editedOrder,
        variables: detectedVariables,
        isClassified: !!(editedCardId && editedSectionId),
        createdAt: prompt.createdAt,
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from("system_config")
        .update({
          value: updatedConfig as Json,
          description: editedDescription,
          updated_at: new Date().toISOString()
        })
        .eq("id", prompt.id);

      if (error) throw error;

      toast({
        title: "Prompt salvo",
        description: (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Alterações aplicadas globalmente</span>
          </div>
        )
      });

      onSaved();
    } catch (error) {
      console.error("Erro ao salvar prompt:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Falha ao atualizar o prompt. Tente novamente."
      });
    } finally {
      setSaving(false);
    }
  };

  // Reverter para original
  const handleRevert = () => {
    if (prompt) {
      setEditedPrompt(prompt.prompt || "");
      setEditedDescription(prompt.description || "");
      setEditedCardId(prompt.cardId || "");
      setEditedSectionId(prompt.sectionId || "");
      setEditedOrder(prompt.order || 0);
    }
  };

  // Copiar para clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(editedPrompt);
    toast({
      title: "Copiado!",
      description: "Prompt copiado para a área de transferência"
    });
  };

  if (!prompt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Editar Prompt
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            {(() => {
              const promptType = getPromptType(prompt.id);
              return (
                <Badge 
                  variant="outline" 
                  className={cn("text-xs font-medium", promptType.color)}
                >
                  {promptType.label}
                </Badge>
              );
            })()}
            <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
              {prompt.id}
            </code>
            {hasChanges && (
              <Badge variant="outline" className="text-amber-500 border-amber-500">
                Alterações não salvas
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="space-y-6 pr-4">
            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Descreva o propósito deste prompt..."
              />
            </div>

            {/* Classificação */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Classificação</Label>
                {editedCardId && editedSectionId ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Classificado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500">
                    <AlertCircle className="h-3 w-3" />
                    Não classificado
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cardId">Card</Label>
                  <Select value={editedCardId} onValueChange={setEditedCardId}>
                    <SelectTrigger id="cardId">
                      <SelectValue placeholder="Selecione o card" />
                    </SelectTrigger>
                    <SelectContent>
                      {laudoStructure.map(card => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sectionId">Seção</Label>
                  <Select
                    value={editedSectionId}
                    onValueChange={setEditedSectionId}
                    disabled={!editedCardId}
                  >
                    <SelectTrigger id="sectionId">
                      <SelectValue placeholder="Selecione a seção" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSections.map(section => (
                        <SelectItem key={section.id} value={section.id}>
                          {section.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="order">Ordem</Label>
                  <Input
                    id="order"
                    type="number"
                    min={0}
                    value={editedOrder}
                    onChange={(e) => setEditedOrder(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Prompt Text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt">Texto do Prompt</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 px-2"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </Button>
                  {hasChanges && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRevert}
                      className="h-7 px-2"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reverter
                    </Button>
                  )}
                </div>
              </div>
              <Textarea
                id="prompt"
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                placeholder="Digite o prompt aqui..."
              />
              <p className="text-xs text-muted-foreground">
                {editedPrompt.length} caracteres
              </p>
            </div>

            {/* Variáveis detectadas */}
            {detectedVariables.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Variable className="h-4 w-4 text-muted-foreground" />
                  <Label>Variáveis detectadas no prompt</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detectedVariables.map(v => (
                    <Badge key={v} variant="secondary" className="font-mono">
                      ${"{" + v + "}"}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Estas variáveis serão substituídas automaticamente pelo contexto durante a execução.
                </p>
              </div>
            )}

            {/* Variáveis disponíveis para este prompt */}
            {prompt && (
              <div className="space-y-2 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-blue-500" />
                  <Label className="text-blue-700 dark:text-blue-400">Variáveis disponíveis</Label>
                </div>
                
                {(() => {
                  const availableVars = AVAILABLE_VARIABLES[prompt.id];
                  const promptType = getPromptType(prompt.id);
                  
                  if (promptType.type === 'regen') {
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Prompts de <strong>Regeneração</strong> recebem contexto cruzado de outros campos do laudo.
                          Use estas variáveis para enriquecer a resposta:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(availableVars || ALL_VARIABLES.map(v => v.name)).map(varName => {
                            const varInfo = ALL_VARIABLES.find(v => v.name === varName);
                            return (
                              <Badge 
                                key={varName} 
                                variant="outline" 
                                className="font-mono text-xs cursor-pointer hover:bg-blue-500/10"
                                onClick={() => {
                                  const varText = '${' + varName + '}';
                                  setEditedPrompt(prev => prev + ' ' + varText);
                                }}
                                title={varInfo?.desc || varName}
                              >
                                ${"{" + varName + "}"}
                              </Badge>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground italic">
                          Clique em uma variável para adicioná-la ao final do prompt.
                        </p>
                      </div>
                    );
                  }
                  
                  if (promptType.type === 'gen') {
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Prompts de <strong>Geração</strong> já recebem contexto completo automaticamente.
                          Variáveis sugeridas para este prompt:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(availableVars || []).map(varName => {
                            const varInfo = ALL_VARIABLES.find(v => v.name === varName);
                            return (
                              <Badge 
                                key={varName} 
                                variant="outline" 
                                className="font-mono text-xs cursor-pointer hover:bg-emerald-500/10"
                                onClick={() => {
                                  const varText = '${' + varName + '}';
                                  setEditedPrompt(prev => prev + ' ' + varText);
                                }}
                                title={varInfo?.desc || varName}
                              >
                                ${"{" + varName + "}"}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <p className="text-xs text-muted-foreground">
                      Este prompt de <strong>{promptType.label}</strong> não utiliza variáveis de contexto cruzado.
                    </p>
                  );
                })()}
              </div>
            )}

            {/* Metadados */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <History className="h-4 w-4" />
                <span>Metadados</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Criado em:</span>
                  <span className="ml-2">
                    {prompt.createdAt
                      ? new Date(prompt.createdAt).toLocaleString("pt-BR")
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Atualizado em:</span>
                  <span className="ml-2">
                    {prompt.updatedAt
                      ? new Date(prompt.updatedAt).toLocaleString("pt-BR")
                      : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
