import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, 
  FileText, 
  Trash2, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Upload,
  MoreHorizontal,
  Eye,
  Pencil,
  DollarSign,
  AlertCircle
} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
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

  // Calculate stats
  const totalLaudos = laudos.length;
  const thisMonthLaudos = laudos.filter(l => {
    const createdAt = new Date(l.updatedAt);
    const now = new Date();
    return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
  }).length;

  // Get last month count for comparison
  const lastMonthLaudos = laudos.filter(l => {
    const createdAt = new Date(l.updatedAt);
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return createdAt.getMonth() === lastMonth.getMonth() && createdAt.getFullYear() === lastMonth.getFullYear();
  }).length;

  const percentChange = lastMonthLaudos > 0 
    ? Math.round(((thisMonthLaudos - lastMonthLaudos) / lastMonthLaudos) * 100)
    : thisMonthLaudos > 0 ? 100 : 0;

  // Get recent laudos for history table (last 5)
  const recentLaudos = useMemo(() => {
    return [...laudos]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [laudos]);

  // Mock data for upcoming appointments (future feature)
  const upcomingAppointments = useMemo(() => {
    // Filter laudos with future dataPericia
    const future = laudos.filter(l => {
      if (!l.dataPericia) return false;
      return new Date(l.dataPericia) >= new Date();
    }).sort((a, b) => new Date(a.dataPericia!).getTime() - new Date(b.dataPericia!).getTime())
    .slice(0, 5);
    
    return future;
  }, [laudos]);

  // Get initials for avatar
  const getInitials = (name: string | undefined) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get status badge variant
  const getStatusBadge = (laudo: typeof laudos[0]) => {
    // For now, all are drafts - this will be expanded when status field is added
    if (laudo.conclusaoStatus === "finalizado") {
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Concluído</Badge>;
    }
    if (laudo.conclusaoStatus === "em_analise") {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Em Análise</Badge>;
    }
    return <Badge variant="secondary">Rascunho</Badge>;
  };

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Bem-vindo, {profile?.nome?.split(' ')[0] || 'Doutor'}
          </h1>
          <p className="text-muted-foreground">
            Resumo das suas atividades e perícias hoje.
          </p>
        </div>
        <Button onClick={handleNewLaudo} size="default">
          <Plus className="mr-2 h-4 w-4" />
          Nova Perícia
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Agendadas Hoje</p>
                <p className="text-2xl font-bold text-foreground">{upcomingAppointments.length}</p>
                <p className="text-xs text-muted-foreground">
                  {upcomingAppointments.length > 0 ? "Próxima em 45min" : "Nenhuma agendada"}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Laudos Pendentes</p>
                <p className="text-2xl font-bold text-foreground">{totalLaudos}</p>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <span className="text-xs text-destructive font-medium">
                    {Math.min(2, totalLaudos)} Urgentes
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Finalizadas (Mês)</p>
                <p className="text-2xl font-bold text-foreground">{thisMonthLaudos}</p>
                <p className={`text-xs font-medium ${percentChange >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {percentChange >= 0 ? '+' : ''}{percentChange}% vs anterior
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Faturamento Est.</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {(thisMonthLaudos * 1500).toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-muted-foreground">Atualizado hoje</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Tools */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Importar Autos
            </Button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Agenda de Perícias</span>
              <Badge variant="secondary" className="ml-1">{upcomingAppointments.length}</Badge>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tipos de Perícia</span>
              <Badge variant="secondary" className="ml-1">Todos</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tables Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximos Compromissos */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Próximos Compromissos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm text-center">
                  Nenhum compromisso agendado
                </p>
                <p className="text-muted-foreground/70 text-xs text-center mt-1">
                  Agende uma perícia definindo a data no formulário
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">DATA</TableHead>
                    <TableHead>TIPO</TableHead>
                    <TableHead>PERICIADO</TableHead>
                    <TableHead className="text-right">HORÁRIO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingAppointments.map((laudo) => (
                    <TableRow 
                      key={laudo.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenLaudo(laudo.id)}
                    >
                      <TableCell>
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                          <span className="text-[10px] font-semibold text-primary uppercase">
                            {format(new Date(laudo.dataPericia!), "MMM", { locale: ptBR })}
                          </span>
                          <span className="text-lg font-bold text-primary">
                            {format(new Date(laudo.dataPericia!), "dd")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">Acidente de Trabalho</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{laudo.vitimaName || "Não informado"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-muted-foreground">09:00</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Histórico Recente */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Histórico Recente</CardTitle>
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate('/historico')}>
                Ver todos
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentLaudos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm text-center">
                  Nenhum laudo criado ainda
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleNewLaudo}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Primeiro Laudo
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PERICIADO</TableHead>
                    <TableHead>DATA</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLaudos.map((laudo) => (
                    <TableRow key={laudo.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getInitials(laudo.vitimaName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {laudo.vitimaName || laudo.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Acidente de Trabalho
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(laudo.updatedAt), "dd MMM, yyyy", { locale: ptBR })}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(laudo)}
                      </TableCell>
                      <TableCell>
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
      </div>
    </div>
  );
}
