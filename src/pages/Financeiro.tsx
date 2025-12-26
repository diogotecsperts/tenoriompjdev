import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLaudo } from "@/contexts/LaudoContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Plus,
  Search,
  Filter,
  Download,
  AlertCircle
} from "lucide-react";
import { LancamentosTable } from "@/components/financeiro/LancamentosTable";
import { NovoLancamentoDialog } from "@/components/financeiro/NovoLancamentoDialog";
import { ResumoGrafico } from "@/components/financeiro/ResumoGrafico";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export interface Lancamento {
  id: string;
  user_id: string;
  laudo_id: string | null;
  descricao: string;
  valor_honorarios: number;
  valor_despesas: number;
  tipo_despesa: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  forma_pagamento: string | null;
  observacoes: string;
  created_at: string;
  updated_at: string;
  // Joined data
  laudo?: {
    title: string;
    processo_numero: string;
    reclamante: string;
  };
}

export default function Financeiro() {
  const { user } = useAuth();
  const { laudos } = useLaudo();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(null);

  // Fetch lancamentos
  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["financeiro", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro")
        .select(`
          *,
          laudo:laudos(title, processo_numero, reclamante)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Lancamento[];
    },
    enabled: !!user?.id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financeiro").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success("Lançamento excluído com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir lançamento");
    },
  });

  // Calculate summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const thisMonthLancamentos = lancamentos.filter(l => {
      const date = new Date(l.created_at);
      return date >= thisMonthStart && date <= thisMonthEnd;
    });

    const lastMonthLancamentos = lancamentos.filter(l => {
      const date = new Date(l.created_at);
      return date >= lastMonthStart && date <= lastMonthEnd;
    });

    const totalRecebido = lancamentos
      .filter(l => l.status === "recebido")
      .reduce((sum, l) => sum + (Number(l.valor_honorarios) || 0), 0);

    const totalPendente = lancamentos
      .filter(l => l.status === "pendente")
      .reduce((sum, l) => sum + (Number(l.valor_honorarios) || 0), 0);

    const totalAtrasado = lancamentos
      .filter(l => l.status === "atrasado")
      .reduce((sum, l) => sum + (Number(l.valor_honorarios) || 0), 0);

    const totalDespesas = lancamentos
      .reduce((sum, l) => sum + (Number(l.valor_despesas) || 0), 0);

    const faturamentoMes = thisMonthLancamentos
      .reduce((sum, l) => sum + (Number(l.valor_honorarios) || 0), 0);

    const faturamentoMesAnterior = lastMonthLancamentos
      .reduce((sum, l) => sum + (Number(l.valor_honorarios) || 0), 0);

    const percentChange = faturamentoMesAnterior > 0 
      ? Math.round(((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100)
      : faturamentoMes > 0 ? 100 : 0;

    return {
      totalRecebido,
      totalPendente,
      totalAtrasado,
      totalDespesas,
      faturamentoMes,
      percentChange,
      countPendentes: lancamentos.filter(l => l.status === "pendente").length,
      countAtrasados: lancamentos.filter(l => l.status === "atrasado").length,
    };
  }, [lancamentos]);

  // Filter lancamentos
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter(l => {
      const matchesSearch = 
        l.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.laudo?.processo_numero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.laudo?.reclamante?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "todos" || l.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [lancamentos, searchTerm, statusFilter]);

  const handleEdit = (lancamento: Lancamento) => {
    setEditingLancamento(lancamento);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este lançamento?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingLancamento(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Controle Financeiro
          </h1>
          <p className="text-muted-foreground">
            Gerencie honorários, despesas e pagamentos das perícias.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Lançamento
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Total Recebido</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {stats.totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">Todos os tempos</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">A Receber</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {stats.totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.countPendentes} lançamentos pendentes
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">Faturamento (Mês)</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {stats.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className={`text-xs font-medium ${stats.percentChange >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {stats.percentChange >= 0 ? '+' : ''}{stats.percentChange}% vs anterior
                </p>
              </div>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                stats.percentChange >= 0 ? 'bg-emerald-100' : 'bg-destructive/10'
              }`}>
                {stats.percentChange >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-destructive" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Atrasados</p>
                <p className="text-2xl font-bold text-destructive">
                  R$ {stats.totalAtrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <span className="text-xs text-destructive font-medium">
                    {stats.countAtrasados} em atraso
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de evolução */}
      <ResumoGrafico lancamentos={lancamentos} />

      {/* Filters and Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Lançamentos</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar..." 
                  className="pl-9 w-full sm:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {["todos", "pendente", "recebido", "atrasado"].map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                    className="capitalize"
                  >
                    {status === "todos" ? "Todos" : status}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LancamentosTable 
            lancamentos={filteredLancamentos}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      {/* Dialog */}
      <NovoLancamentoDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        lancamento={editingLancamento}
        laudos={laudos}
      />
    </div>
  );
}
