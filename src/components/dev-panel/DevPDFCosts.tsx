import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, TrendingUp, FileText, Download, RefreshCw, AlertCircle } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface PDFCostLog {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  provider: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
  success: boolean;
  input_cost: number;
  output_cost: number;
  total_cost: number;
}

interface ModelPricing {
  id: string;
  provider: string;
  input_price_per_million: number;
  output_price_per_million: number;
  display_name: string;
}

type PeriodFilter = "7d" | "30d" | "month" | "all";

export function DevPDFCosts() {
  const [logs, setLogs] = useState<PDFCostLog[]>([]);
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>("30d");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Buscar preços
      const { data: pricingData } = await supabase
        .from('model_pricing')
        .select('*');
      
      setPricing(pricingData || []);

      // Calcular data de início baseada no período
      let startDate: Date;
      switch (period) {
        case "7d":
          startDate = subDays(new Date(), 7);
          break;
        case "30d":
          startDate = subDays(new Date(), 30);
          break;
        case "month":
          startDate = startOfMonth(new Date());
          break;
        default:
          startDate = new Date(0);
      }

      // Buscar logs de uso de IA para PDF
      const { data: logsData } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .eq('prompt_type', 'pdf_extraction')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      // Buscar nomes dos usuários
      const userIds = [...new Set((logsData || []).map(l => l.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nome')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.nome]));
      const pricingMap = new Map((pricingData || []).map(p => [p.id, p]));

      // Calcular custos
      const processedLogs: PDFCostLog[] = (logsData || []).map(log => {
        const priceInfo = pricingMap.get(log.model);
        const inputCost = priceInfo 
          ? ((log.tokens_input || 0) * priceInfo.input_price_per_million) / 1000000
          : 0;
        const outputCost = priceInfo 
          ? ((log.tokens_output || 0) * priceInfo.output_price_per_million) / 1000000
          : 0;

        return {
          id: log.id,
          created_at: log.created_at,
          user_id: log.user_id,
          user_name: profileMap.get(log.user_id) || 'Desconhecido',
          provider: log.provider,
          model: log.model,
          tokens_input: log.tokens_input || 0,
          tokens_output: log.tokens_output || 0,
          latency_ms: log.latency_ms || 0,
          success: log.success ?? true,
          input_cost: inputCost,
          output_cost: outputCost,
          total_cost: inputCost + outputCost
        };
      });

      setLogs(processedLogs);
    } catch (error) {
      console.error('Erro ao buscar dados de custo:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (providerFilter === "all") return logs;
    return logs.filter(l => l.provider === providerFilter);
  }, [logs, providerFilter]);

  const stats = useMemo(() => {
    const successLogs = filteredLogs.filter(l => l.success);
    const totalCost = successLogs.reduce((acc, l) => acc + l.total_cost, 0);
    const avgCost = successLogs.length > 0 ? totalCost / successLogs.length : 0;
    const totalTokens = successLogs.reduce((acc, l) => acc + l.tokens_input + l.tokens_output, 0);

    return {
      totalCost,
      avgCost,
      totalImports: successLogs.length,
      totalTokens,
      failedImports: filteredLogs.filter(l => !l.success).length
    };
  }, [filteredLogs]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, { date: string; cost: number; count: number }>();
    
    filteredLogs.forEach(log => {
      if (!log.success) return;
      const date = format(new Date(log.created_at), 'dd/MM');
      const existing = grouped.get(date) || { date, cost: 0, count: 0 };
      existing.cost += log.total_cost;
      existing.count += 1;
      grouped.set(date, existing);
    });

    return Array.from(grouped.values()).reverse();
  }, [filteredLogs]);

  const providers = useMemo(() => {
    const unique = [...new Set(logs.map(l => l.provider))];
    return unique;
  }, [logs]);

  const exportToCSV = () => {
    const headers = ['Data', 'Usuário', 'Provider', 'Modelo', 'Tokens Input', 'Tokens Output', 'Custo (USD)', 'Status'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'dd/MM/yyyy HH:mm'),
      log.user_name,
      log.provider,
      log.model,
      log.tokens_input,
      log.tokens_output,
      log.total_cost.toFixed(6),
      log.success ? 'Sucesso' : 'Falha'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `custos-pdf-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
          <Select value={period} onValueChange={(v: PeriodFilter) => setPeriod(v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>

          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {providers.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV} disabled={filteredLogs.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Custo Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${stats.totalCost.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalTokens.toLocaleString()} tokens usados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Custo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${stats.avgCost.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">por importação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Importações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalImports}</div>
            <p className="text-xs text-muted-foreground">com sucesso no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Falhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.failedImports}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalImports + stats.failedImports > 0
                ? `${((stats.failedImports / (stats.totalImports + stats.failedImports)) * 100).toFixed(1)}% do total`
                : 'nenhuma'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Custo por Dia</CardTitle>
            <CardDescription>Evolução do custo de importações de PDF</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis 
                    className="text-xs" 
                    tickFormatter={(v) => `$${v.toFixed(3)}`} 
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">{data.date}</p>
                          <p className="text-sm text-muted-foreground">
                            Custo: <span className="text-primary font-medium">${data.cost.toFixed(4)}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Importações: {data.count}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="hsl(var(--primary))" 
                    fill="url(#costGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Importações</CardTitle>
          <CardDescription>
            {filteredLogs.length} registros no período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma importação de PDF encontrada no período.</p>
              <p className="text-sm">As métricas serão exibidas quando houver importações com tokens registrados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Tokens In</TableHead>
                    <TableHead className="text-right">Tokens Out</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Latência</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-32 truncate">{log.user_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.provider}</Badge>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs font-mono">
                        {log.model}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {log.tokens_input.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {log.tokens_output.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {log.total_cost > 0 ? (
                          <span className="text-primary font-medium">
                            ${log.total_cost.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(log.latency_ms / 1000).toFixed(1)}s
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.success ? "default" : "destructive"}>
                          {log.success ? "OK" : "Erro"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredLogs.length > 100 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Mostrando 100 de {filteredLogs.length} registros. Exporte para CSV para ver todos.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}