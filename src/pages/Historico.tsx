import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  MoreHorizontal, 
  Eye, 
  Pencil, 
  Trash2, 
  FileText,
  Download,
  Filter,
  Plus,
  AlertTriangle,
  MessageSquare,
  Save,
  ArrowUpDown,
  RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 10;

export default function Historico() {
  const navigate = useNavigate();
  const { laudos, deleteLaudo, loadLaudo, updateObservacoes, updateLaudoStatus } = useLaudo();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("updatedAt_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [editingObservacoes, setEditingObservacoes] = useState<{ id: string; value: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });

  const handleOpenLaudo = (id: string) => {
    loadLaudo(id);
    navigate(`/laudo/${id}`);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(paginatedLaudos.map(l => l.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    const total = idsToDelete.length;
    
    setIsDeleting(true);
    setDeleteProgress({ current: 0, total });
    
    let successCount = 0;
    
    for (let i = 0; i < idsToDelete.length; i++) {
      setDeleteProgress({ current: i + 1, total });
      try {
        await deleteLaudo(idsToDelete[i]);
        successCount++;
      } catch (error) {
        console.error(`Erro ao excluir laudo ${idsToDelete[i]}:`, error);
      }
    }
    
    setIsDeleting(false);
    setDeleteProgress({ current: 0, total: 0 });
    setSelectedIds(new Set());
    setBulkDeleteDialogOpen(false);
    
    toast({
      title: "Perícias excluídas",
      description: `${successCount} de ${total} perícia(s) foram removidas com sucesso.`,
    });
  };

  // Get initials for avatar
  const getInitials = (name: string | undefined) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get status badge
  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case "finalizado":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Concluído</Badge>;
      case "em_analise":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Em Análise</Badge>;
      default:
        return <Badge variant="secondary">Rascunho</Badge>;
    }
  };

  // Handle save observacoes
  const handleSaveObservacoes = async () => {
    if (!editingObservacoes) return;
    
    await updateObservacoes(editingObservacoes.id, editingObservacoes.value);
    toast({
      title: "Observação salva",
      description: "A observação foi atualizada com sucesso.",
    });
    setEditingObservacoes(null);
  };

  // Filtered and sorted laudos
  const filteredLaudos = useMemo(() => {
    const filtered = laudos.filter(laudo => {
      const matchesSearch = searchTerm === "" || 
        laudo.vitimaName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        laudo.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        laudo.processoNumero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (laudo as any).observacoesHistorico?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "rascunho" && !laudo.conclusaoStatus) ||
        laudo.conclusaoStatus === statusFilter;
      
      // For now, all are "Acidente de Trabalho" - will be expanded later
      const matchesType = typeFilter === "all";
      
      return matchesSearch && matchesStatus && matchesType;
    });

    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "updatedAt_desc":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "updatedAt_asc":
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case "createdAt_desc":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "createdAt_asc":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name_asc":
          return (a.vitimaName || "").localeCompare(b.vitimaName || "");
        case "processo":
          return (a.processoNumero || "").localeCompare(b.processoNumero || "");
        default:
          return 0;
      }
    });
  }, [laudos, searchTerm, statusFilter, typeFilter, sortBy]);

  const totalPages = Math.ceil(filteredLaudos.length / ITEMS_PER_PAGE);
  const paginatedLaudos = filteredLaudos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const allSelected = paginatedLaudos.length > 0 && 
    paginatedLaudos.every(l => selectedIds.has(l.id));
  const someSelected = selectedIds.size > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Histórico de Perícias</h1>
          <p className="text-muted-foreground">
            {filteredLaudos.length} perícia{filteredLaudos.length !== 1 ? 's' : ''} encontrada{filteredLaudos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => navigate('/laudo/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Perícia
        </Button>
      </div>

      {/* Filters Card */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            {/* Search input - reduced size */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>

            {/* Selection controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {someSelected ? `${selectedIds.size} selecionado(s)` : "Selecionar tudo"}
                </span>
              </div>

              <Button 
                variant="destructive" 
                size="sm"
                disabled={!someSelected}
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir ({selectedIds.size})
              </Button>
            </div>

            {/* Sorting and Filters */}
            <div className="flex gap-3 ml-auto">
              <Select value={sortBy} onValueChange={(value) => {
                setSortBy(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <ArrowUpDown className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt_desc">Última alteração</SelectItem>
                  <SelectItem value="updatedAt_asc">Mais antigos primeiro</SelectItem>
                  <SelectItem value="createdAt_desc">Recém criados</SelectItem>
                  <SelectItem value="createdAt_asc">Criados há mais tempo</SelectItem>
                  <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                  <SelectItem value="processo">Nº Processo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[120px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <span>Status</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="em_analise">Em Análise</SelectItem>
                  <SelectItem value="finalizado">Concluído</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(value) => {
                setTypeFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[100px]">
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Tipo</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="acidente_trabalho">Acidente de Trabalho</SelectItem>
                  <SelectItem value="doenca_ocupacional">Doença Ocupacional</SelectItem>
                  <SelectItem value="invalidez">Invalidez</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={(open) => !isDeleting && setBulkDeleteDialogOpen(open)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl">
                {isDeleting 
                  ? `Excluindo ${deleteProgress.current} de ${deleteProgress.total}...`
                  : `Excluir ${selectedIds.size} perícia${selectedIds.size > 1 ? 's' : ''}?`
                }
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {isDeleting ? (
                  <div className="space-y-3">
                    <p>Aguarde enquanto as perícias são excluídas...</p>
                    <Progress value={(deleteProgress.current / deleteProgress.total) * 100} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      {deleteProgress.current} de {deleteProgress.total} concluído(s)
                    </p>
                  </div>
                ) : (
                  <>
                    <p>
                      Você está prestes a excluir permanentemente{' '}
                      <strong>{selectedIds.size}</strong>{' '}
                      {selectedIds.size > 1 ? 'perícias' : 'perícia'}.
                    </p>
                    
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-amber-800 text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Atenção: Esta ação é irreversível!
                      </p>
                      <ul className="text-amber-700 text-xs mt-2 space-y-1 list-disc list-inside">
                        <li>Todos os dados serão removidos permanentemente</li>
                        <li>Não será possível recuperar as informações</li>
                        <li>Documentos e anotações vinculados serão perdidos</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? "Excluindo..." : `Sim, excluir ${selectedIds.size > 1 ? 'todas' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {paginatedLaudos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Nenhuma perícia encontrada</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {searchTerm || statusFilter !== "all" || typeFilter !== "all" 
                  ? "Tente ajustar os filtros de busca" 
                  : "Crie sua primeira perícia para começar"}
              </p>
              {!searchTerm && statusFilter === "all" && typeFilter === "all" && (
                <Button className="mt-4" onClick={() => navigate('/laudo/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Perícia
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={allSelected}
                      onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead className="w-[240px]">PERICIADO</TableHead>
                  <TableHead>Nº PROCESSO</TableHead>
                  <TableHead>TIPO</TableHead>
                  <TableHead>DATA PERÍCIA</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead className="w-[180px]">OBSERVAÇÕES</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLaudos.map((laudo) => (
                  <TableRow key={laudo.id} className="group cursor-pointer" onClick={() => handleOpenLaudo(laudo.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={selectedIds.has(laudo.id)}
                        onCheckedChange={(checked) => toggleSelect(laudo.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                            {getInitials(laudo.vitimaName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {laudo.vitimaName || "Nome não informado"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {laudo.title}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground font-mono">
                        {laudo.processoNumero || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">Acidente de Trabalho</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {laudo.dataPericia 
                          ? format(new Date(laudo.dataPericia), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(laudo.conclusaoStatus)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TooltipProvider>
                        <Popover
                          open={editingObservacoes?.id === laudo.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setEditingObservacoes({
                                id: laudo.id,
                                value: (laudo as any).observacoesHistorico || ""
                              });
                            } else {
                              setEditingObservacoes(null);
                            }
                          }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-full justify-start gap-2 text-left font-normal"
                                >
                                  {(laudo as any).observacoesHistorico ? (
                                    <>
                                      <MessageSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                      <span className="truncate max-w-[100px] text-xs">
                                        {(laudo as any).observacoesHistorico}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                      <span className="text-xs text-muted-foreground">Adicionar</span>
                                    </>
                                  )}
                                </Button>
                              </PopoverTrigger>
                            </TooltipTrigger>
                            {(laudo as any).observacoesHistorico && (
                              <TooltipContent side="top" className="max-w-[300px]">
                                <p className="text-sm">{(laudo as any).observacoesHistorico}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <PopoverContent className="w-80" align="start">
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <h4 className="font-medium text-sm">Observações</h4>
                                <p className="text-xs text-muted-foreground">
                                  Adicione notas para identificar este laudo
                                </p>
                              </div>
                              <Textarea
                                placeholder="Ex: Caso urgente, revisão pendente..."
                                value={editingObservacoes?.value || ""}
                                onChange={(e) => setEditingObservacoes(prev => 
                                  prev ? { ...prev, value: e.target.value } : null
                                )}
                                className="min-h-[80px] text-sm"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingObservacoes(null)}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveObservacoes}
                                >
                                  <Save className="h-3.5 w-3.5 mr-1.5" />
                                  Salvar
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenLaudo(laudo.id)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenLaudo(laudo.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Exportar PDF
                          </DropdownMenuItem>
                          {laudo.status === 'finalizado' && (
                            <DropdownMenuItem onClick={() => updateLaudoStatus(laudo.id, 'rascunho')}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reabrir Laudo
                            </DropdownMenuItem>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este laudo? Esta ação não pode ser
                                  desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteLaudo(laudo.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredLaudos.length)} de {filteredLaudos.length} resultados
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
