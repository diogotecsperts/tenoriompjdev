import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Trash2, Calendar, ClipboardList, Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { RenameDialog } from "@/components/dashboard/RenameDialog";
import { FilterBar, FilterState } from "@/components/dashboard/FilterBar";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { laudos, createLaudo, deleteLaudo, loadLaudo, renameLaudo } = useLaudo();
  
  const [filters, setFilters] = useState<FilterState>({
    searchText: "",
    vitimaName: "",
    dataAcidenteStart: "",
    dataAcidenteEnd: "",
    dataPericiaStart: "",
    dataPericiaEnd: "",
    processoNumero: "",
    reclamante: "",
  });

  const handleNewLaudo = async () => {
    const id = await createLaudo();
    if (id) {
      navigate(`/laudo/${id}`);
    }
  };

  const handleOpenLaudo = (id: string) => {
    loadLaudo(id);
    navigate(`/laudo/${id}`);
  };

  const handleRenameLaudo = async (id: string, newTitle: string) => {
    await renameLaudo(id, newTitle);
  };

  const filteredLaudos = useMemo(() => {
    return laudos.filter(laudo => {
      if (filters.searchText) {
        const search = filters.searchText.toLowerCase();
        const matchesSearch = 
          laudo.title?.toLowerCase().includes(search) ||
          laudo.vitimaName?.toLowerCase().includes(search) ||
          laudo.processoNumero?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      
      if (filters.vitimaName && 
          !laudo.vitimaName?.toLowerCase().includes(filters.vitimaName.toLowerCase())) {
        return false;
      }
      
      if (filters.processoNumero && 
          !laudo.processoNumero?.toLowerCase().includes(filters.processoNumero.toLowerCase())) {
        return false;
      }
      
      if (filters.reclamante && 
          !laudo.reclamante?.toLowerCase().includes(filters.reclamante.toLowerCase())) {
        return false;
      }
      
      if (filters.dataAcidenteStart && laudo.dataAcidente) {
        if (new Date(laudo.dataAcidente) < new Date(filters.dataAcidenteStart)) {
          return false;
        }
      }
      
      if (filters.dataAcidenteEnd && laudo.dataAcidente) {
        if (new Date(laudo.dataAcidente) > new Date(filters.dataAcidenteEnd)) {
          return false;
        }
      }
      
      if (filters.dataPericiaStart && laudo.dataPericia) {
        if (new Date(laudo.dataPericia) < new Date(filters.dataPericiaStart)) {
          return false;
        }
      }
      
      if (filters.dataPericiaEnd && laudo.dataPericia) {
        if (new Date(laudo.dataPericia) > new Date(filters.dataPericiaEnd)) {
          return false;
        }
      }
      
      return true;
    });
  }, [laudos, filters]);

  // Calculate stats
  const totalLaudos = laudos.length;
  const thisMonthLaudos = laudos.filter(l => {
    const createdAt = new Date(l.updatedAt);
    const now = new Date();
    return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
          Bem-vindo, {profile?.nome?.split(' ')[0] || 'Doutor'}
        </h1>
        <p className="text-muted-foreground">
          Resumo das suas atividades e perícias.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Laudos</p>
                <p className="text-2xl font-bold text-foreground">{totalLaudos}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Este Mês</p>
                <p className="text-2xl font-bold text-foreground">{thisMonthLaudos}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Em breve</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-accent/30 flex items-center justify-center">
                <Clock className="h-6 w-6 text-accent-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Agendadas</p>
                <p className="text-2xl font-bold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Em breve</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Meus Laudos</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie seus laudos periciais judiciais
            </p>
          </div>
          <Button onClick={handleNewLaudo} size="default">
            <Plus className="mr-2 h-4 w-4" />
            Nova Perícia
          </Button>
        </div>

        {/* Filter Bar */}
        {laudos.length > 0 && (
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            resultCount={filteredLaudos.length}
          />
        )}

        {/* Laudos Grid */}
        {laudos.length === 0 ? (
          <Card className="border-dashed shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Nenhum laudo criado</h3>
              <p className="mb-6 text-center text-muted-foreground max-w-sm">
                Comece criando seu primeiro laudo pericial para gerenciar suas perícias
              </p>
              <Button onClick={handleNewLaudo}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Laudo
              </Button>
            </CardContent>
          </Card>
        ) : filteredLaudos.length === 0 ? (
          <Card className="border-dashed shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-xl font-semibold">Nenhum laudo encontrado</h3>
              <p className="mb-6 text-center text-muted-foreground">
                Tente ajustar os filtros de busca
              </p>
              <Button variant="outline" onClick={() => setFilters({
                searchText: "",
                vitimaName: "",
                dataAcidenteStart: "",
                dataAcidenteEnd: "",
                dataPericiaStart: "",
                dataPericiaEnd: "",
                processoNumero: "",
                reclamante: "",
              })}>
                Limpar Filtros
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredLaudos.map((laudo) => {
              const suggestedTitle = laudo.vitimaName 
                ? `Laudo - ${laudo.vitimaName}` 
                : undefined;
              
              return (
                <Card key={laudo.id} className="hover:shadow-md transition-all shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1 text-base">{laudo.title}</span>
                      <div className="flex items-center gap-1">
                        <RenameDialog
                          currentTitle={laudo.title}
                          suggestedTitle={suggestedTitle}
                          onRename={(newTitle) => handleRenameLaudo(laudo.id, newTitle)}
                        />
                      </div>
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      {laudo.reclamante && (
                        <div className="text-sm">
                          <span className="font-medium">Reclamante:</span> {laudo.reclamante}
                        </div>
                      )}
                      {laudo.processoNumero && (
                        <div className="text-sm">
                          <span className="font-medium">Processo:</span> {laudo.processoNumero}
                        </div>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Calendar className="mr-1 h-3 w-3" />
                        {format(new Date(laudo.updatedAt), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        Rascunho
                      </Badge>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleOpenLaudo(laudo.id)}
                      >
                        Abrir
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
