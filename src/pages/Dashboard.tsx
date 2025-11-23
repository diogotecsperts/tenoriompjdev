import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, LogOut, Trash2, Calendar } from "lucide-react";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { RenameDialog } from "@/components/dashboard/RenameDialog";
import { FilterBar, FilterState } from "@/components/dashboard/FilterBar";

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
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
      // Global text search
      if (filters.searchText) {
        const search = filters.searchText.toLowerCase();
        const matchesSearch = 
          laudo.title?.toLowerCase().includes(search) ||
          laudo.vitimaName?.toLowerCase().includes(search) ||
          laudo.processoNumero?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      
      // Specific filters
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
      
      // Date range filters
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Tenorio MPJ</h1>
              <p className="text-sm text-muted-foreground">Sistema de Laudos Judiciais</p>
              <p className="text-xs text-muted-foreground/60">
                by{" "}
                <a 
                  href="https://tecsperts.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-muted-foreground transition-colors"
                >
                  tecsperts
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium">{profile?.nome}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Meus Laudos</h2>
            <p className="mt-1 text-muted-foreground">
              Gerencie seus laudos periciais judiciais
            </p>
          </div>
          <Button onClick={handleNewLaudo} size="lg">
            <Plus className="mr-2 h-5 w-5" />
            Novo Laudo
          </Button>
        </div>

        {/* Filter Bar */}
        {laudos.length > 0 && (
          <div className="mb-6">
            <FilterBar
              filters={filters}
              onFiltersChange={setFilters}
              resultCount={filteredLaudos.length}
            />
          </div>
        )}

        {/* Laudos List */}
        {laudos.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-xl font-semibold">Nenhum laudo criado</h3>
              <p className="mb-6 text-center text-muted-foreground">
                Comece criando seu primeiro laudo pericial
              </p>
              <Button onClick={handleNewLaudo}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Laudo
              </Button>
            </CardContent>
          </Card>
        ) : filteredLaudos.length === 0 ? (
          <Card className="border-dashed">
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredLaudos.map((laudo) => {
              const suggestedTitle = laudo.vitimaName 
                ? `Laudo - ${laudo.vitimaName}` 
                : undefined;
              
              return (
                <Card key={laudo.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1">{laudo.title}</span>
                      <div className="flex items-center gap-1">
                        <RenameDialog
                          currentTitle={laudo.title}
                          suggestedTitle={suggestedTitle}
                          onRename={(newTitle) => handleRenameLaudo(laudo.id, newTitle)}
                        />
                        <FileText className="h-5 w-5 text-primary" />
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
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Calendar className="mr-1 h-3 w-3" />
                    Atualizado em{" "}
                    {format(new Date(laudo.updatedAt), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
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
                        <Button variant="destructive" size="sm">
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
      </main>
    </div>
  );
}
