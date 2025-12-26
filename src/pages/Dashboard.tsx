import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLaudo } from "@/contexts/LaudoContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Plus, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Upload,
  DollarSign,
  AlertCircle,
  CalendarDays
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ImportarAutosDialog } from "@/components/tools/ImportarAutosDialog";
import { PericiasCalendar } from "@/components/dashboard/PericiasCalendar";
import { TiposPericiaChart } from "@/components/dashboard/TiposPericiaChart";
import { ProximosCompromissosCards } from "@/components/dashboard/ProximosCompromissosCards";
import { HistoricoRecenteTable } from "@/components/dashboard/HistoricoRecenteTable";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { startOfMonth, endOfMonth } from "date-fns";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { laudos, loading, createLaudo, deleteLaudo } = useLaudo();
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Fetch financial data
  const { data: financeiro = [] } = useQuery({
    queryKey: ["financeiro-dashboard", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro")
        .select("*");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Calculate financial stats
  const financeStats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);

    const thisMonthFinanceiro = financeiro.filter(l => {
      const date = new Date(l.created_at);
      return date >= thisMonthStart && date <= thisMonthEnd;
    });

    const faturamentoMes = thisMonthFinanceiro.reduce(
      (sum, l) => sum + (Number(l.valor_honorarios) || 0), 
      0
    );

    const totalPendente = financeiro
      .filter(l => l.status === "pendente")
      .reduce((sum, l) => sum + (Number(l.valor_honorarios) || 0), 0);

    return { faturamentoMes, totalPendente };
  }, [financeiro]);

  // Calculate stats - TODOS OS HOOKS DEVEM VIR ANTES DE QUALQUER RETURN
  const totalLaudos = laudos.length;
  
  const thisMonthLaudos = useMemo(() => {
    return laudos.filter(l => {
      const createdAt = new Date(l.updatedAt);
      const now = new Date();
      return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    }).length;
  }, [laudos]);

  const lastMonthLaudos = useMemo(() => {
    return laudos.filter(l => {
      const createdAt = new Date(l.updatedAt);
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return createdAt.getMonth() === lastMonth.getMonth() && createdAt.getFullYear() === lastMonth.getFullYear();
    }).length;
  }, [laudos]);

  const percentChange = lastMonthLaudos > 0 
    ? Math.round(((thisMonthLaudos - lastMonthLaudos) / lastMonthLaudos) * 100)
    : thisMonthLaudos > 0 ? 100 : 0;

  // Get recent laudos for history table (last 5)
  const recentLaudos = useMemo(() => {
    return [...laudos]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [laudos]);

  // Future appointments
  const upcomingAppointments = useMemo(() => {
    const future = laudos.filter(l => {
      if (!l.dataPericia) return false;
      return new Date(l.dataPericia) >= new Date();
    }).sort((a, b) => new Date(a.dataPericia!).getTime() - new Date(b.dataPericia!).getTime())
    .slice(0, 5);
    
    return future;
  }, [laudos]);

  // Mostrar skeleton enquanto carrega os dados - APÓS todos os hooks
  if (loading) {
    return <DashboardSkeleton />;
  }

  const handleNewLaudo = async () => {
    const id = await createLaudo();
    if (id) {
      navigate(`/laudo/${id}`);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
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
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/historico')}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Ver Agenda
          </Button>
          <Button onClick={handleNewLaudo}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Perícia
          </Button>
        </div>
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

        <Card className="shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/financeiro')}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Faturamento (Mês)</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {financeStats.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {financeStats.totalPendente > 0 
                    ? `R$ ${financeStats.totalPendente.toLocaleString('pt-BR')} a receber`
                    : "Clique para gerenciar"
                  }
                </p>
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
            <Button variant="outline" className="gap-2" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4" />
              Importar Autos
            </Button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Agenda de Perícias</span>
              <Badge variant="secondary" className="ml-1">{upcomingAppointments.length}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar and Chart Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PericiasCalendar 
          pericias={laudos.map(l => ({ 
            id: l.id, 
            dataPericia: l.dataPericia || null,
            vitimaName: l.vitimaName,
            processoNumero: l.processoNumero,
            status: l.status
          }))}
        />
        <TiposPericiaChart laudos={laudos} />
      </div>

      {/* Appointments and History Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProximosCompromissosCards 
          appointments={upcomingAppointments}
          onViewAll={() => navigate('/historico')}
        />
        <HistoricoRecenteTable 
          laudos={recentLaudos}
          onDelete={deleteLaudo}
          onViewAll={() => navigate('/historico')}
        />
      </div>

      <ImportarAutosDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </div>
  );
}
