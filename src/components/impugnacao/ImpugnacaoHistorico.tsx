import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { History, Search, FileText, Calendar, CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
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

interface Quesito {
  id: string;
  numero: number;
  texto: string;
  resposta: string;
  status: "pendente" | "respondido";
  gerado_por_ia?: boolean;
}

interface Impugnacao {
  id: string;
  laudo_id: string | null;
  processo_numero: string | null;
  quesitos: Quesito[] | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  laudos?: {
    vitima_nome: string | null;
    title: string;
  } | null;
}

interface ImpugnacaoHistoricoProps {
  onSelect: (impugnacao: Impugnacao) => void;
  onNew: () => void;
  currentImpugnacaoId?: string | null;
}

export function ImpugnacaoHistorico({ onSelect, onNew, currentImpugnacaoId }: ImpugnacaoHistoricoProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [impugnacoes, setImpugnacoes] = useState<Impugnacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchImpugnacoes();
    }
  }, [open]);

  const fetchImpugnacoes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("impugnacoes")
        .select(`
          id,
          laudo_id,
          processo_numero,
          quesitos,
          status,
          created_at,
          updated_at,
          laudos (
            vitima_nome,
            title
          )
        `)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      
      // Transform data to match expected format - handle JSONB properly
      const transformedData = (data || []).map(item => ({
        ...item,
        quesitos: Array.isArray(item.quesitos) ? item.quesitos as unknown as Quesito[] : null
      }));
      
      setImpugnacoes(transformedData);
    } catch (error) {
      console.error("Erro ao buscar impugnações:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredImpugnacoes = impugnacoes.filter((imp) => {
    const searchLower = search.toLowerCase();
    const vitimaNome = imp.laudos?.vitima_nome || "";
    const processoNumero = imp.processo_numero || "";
    return (
      vitimaNome.toLowerCase().includes(searchLower) ||
      processoNumero.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getRespondidos = (quesitos: Quesito[] | null) => {
    if (!quesitos || !Array.isArray(quesitos)) return { respondidos: 0, total: 0 };
    const respondidos = quesitos.filter(q => q.status === "respondido").length;
    return { respondidos, total: quesitos.length };
  };

  const handleSelect = (imp: Impugnacao) => {
    onSelect(imp);
    setOpen(false);
  };

  const handleNew = () => {
    onNew();
    setOpen(false);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      const { error } = await supabase
        .from("impugnacoes")
        .delete()
        .eq("id", itemToDelete);

      if (error) throw error;

      toast({
        title: "Impugnação excluída",
        description: "O registro foi removido com sucesso.",
      });

      // Atualizar lista
      setImpugnacoes(prev => prev.filter(imp => imp.id !== itemToDelete));
      
      // Se era a impugnação atual, criar nova
      if (currentImpugnacaoId === itemToDelete) {
        onNew();
      }
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir a impugnação.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <History className="mr-2 h-4 w-4" />
            Histórico
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Histórico de Impugnações</SheetTitle>
            <SheetDescription>
              Selecione uma impugnação anterior para continuar editando
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou processo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleNew}>
                <Plus className="mr-2 h-4 w-4" />
                Nova
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-220px)]">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredImpugnacoes.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma impugnação encontrada</p>
                  <Button variant="link" onClick={handleNew} className="mt-2">
                    Criar nova impugnação
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredImpugnacoes.map((imp) => {
                    const { respondidos, total } = getRespondidos(imp.quesitos);
                    const isComplete = total > 0 && respondidos === total;
                    const isCurrent = imp.id === currentImpugnacaoId;

                    return (
                      <Card
                        key={imp.id}
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                          isCurrent ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => handleSelect(imp)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isComplete ? "bg-emerald-500/10" : "bg-amber-500/10"
                            }`}>
                              {isComplete ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <Clock className="h-5 w-5 text-amber-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">
                                  {imp.laudos?.vitima_nome || "Sem laudo vinculado"}
                                </span>
                                <Badge variant={isComplete ? "default" : "secondary"} className="flex-shrink-0">
                                  {respondidos}/{total} quesitos
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground truncate mb-2">
                                {imp.processo_numero || "Sem número de processo"}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(imp.updated_at)}
                                </span>
                                {isCurrent && (
                                  <Badge variant="outline" className="text-xs">
                                    Atual
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => handleDeleteClick(e, imp.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir impugnação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os quesitos e respostas serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
