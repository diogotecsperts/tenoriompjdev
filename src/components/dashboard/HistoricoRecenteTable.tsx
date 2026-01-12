import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Pencil, 
  Eye, 
  Trash2 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

interface Laudo {
  id: string;
  title: string;
  vitimaName?: string;
  updatedAt: Date;
  conclusaoStatus?: string;
}

interface HistoricoRecenteTableProps {
  laudos: Laudo[];
  onDelete: (id: string) => void;
  onViewAll: () => void;
}

export function HistoricoRecenteTable({ laudos, onDelete, onViewAll }: HistoricoRecenteTableProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const getInitials = (name: string | undefined) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStatusBadge = (status?: string) => {
    if (status === "finalizado") {
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Concluído</Badge>;
    }
    if (status === "em_analise") {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Em Análise</Badge>;
    }
    return <Badge variant="secondary">Rascunho</Badge>;
  };

  const filteredLaudos = laudos.filter(laudo => {
    const search = searchTerm.toLowerCase();
    return (
      laudo.vitimaName?.toLowerCase().includes(search) ||
      laudo.title.toLowerCase().includes(search)
    );
  });

  const handleOpenLaudo = (id: string) => {
    navigate(`/laudo/${id}`);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold">Histórico Recente</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar laudo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 w-full sm:w-[200px]"
              />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-primary hidden sm:flex" onClick={onViewAll}>
              Ver todos
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredLaudos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm text-center">
              {searchTerm ? "Nenhum laudo encontrado" : "Nenhum laudo criado ainda"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PERICIADO</TableHead>
                <TableHead>TIPO</TableHead>
                <TableHead>DATA</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLaudos.map((laudo) => (
                <TableRow 
                  key={laudo.id} 
                  className="group cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleOpenLaudo(laudo.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(laudo.vitimaName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {laudo.vitimaName || laudo.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">Acidente Trabalho</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(laudo.updatedAt), "dd MMM, yyyy", { locale: ptBR })}
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
                              <AlertDialogAction onClick={() => onDelete(laudo.id)}>
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
  );
}
