import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Plus
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ITEMS_PER_PAGE = 10;

export default function Historico() {
  const navigate = useNavigate();
  const { laudos, deleteLaudo, loadLaudo } = useLaudo();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const handleOpenLaudo = (id: string) => {
    loadLaudo(id);
    navigate(`/laudo/${id}`);
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

  // Filtered and paginated laudos
  const filteredLaudos = useMemo(() => {
    return laudos.filter(laudo => {
      const matchesSearch = searchTerm === "" || 
        laudo.vitimaName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        laudo.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        laudo.processoNumero?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "rascunho" && !laudo.conclusaoStatus) ||
        laudo.conclusaoStatus === statusFilter;
      
      // For now, all are "Acidente de Trabalho" - will be expanded later
      const matchesType = typeFilter === "all";
      
      return matchesSearch && matchesStatus && matchesType;
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [laudos, searchTerm, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filteredLaudos.length / ITEMS_PER_PAGE);
  const paginatedLaudos = filteredLaudos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, processo ou título..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="em_analise">Em Análise</SelectItem>
                  <SelectItem value="finalizado">Concluído</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(value) => {
                setTypeFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <FileText className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="acidente_trabalho">Acidente de Trabalho</SelectItem>
                  <SelectItem value="doenca_ocupacional">Doença Ocupacional</SelectItem>
                  <SelectItem value="invalidez">Invalidez</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="w-[300px]">PERICIADO</TableHead>
                  <TableHead>Nº PROCESSO</TableHead>
                  <TableHead>TIPO</TableHead>
                  <TableHead>DATA PERÍCIA</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLaudos.map((laudo) => (
                  <TableRow key={laudo.id} className="group cursor-pointer" onClick={() => handleOpenLaudo(laudo.id)}>
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
