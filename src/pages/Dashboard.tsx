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

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { laudos, createLaudo, deleteLaudo, loadLaudo } = useLaudo();

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
              <h1 className="text-xl font-bold">Tenorio Médico Perito</h1>
              <p className="text-sm text-muted-foreground">Sistema de Laudos Judiciais</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium">{profile?.nome}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {laudos.map((laudo) => (
              <Card key={laudo.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="truncate">{laudo.title}</span>
                    <FileText className="h-5 w-5 text-primary" />
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
