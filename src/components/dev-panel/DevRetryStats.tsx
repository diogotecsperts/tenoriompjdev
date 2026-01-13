import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  RefreshCw, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle,
  Activity,
  ArrowUpRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface RetryStats {
  totalCalls: number;
  callsWithRetry: number;
  totalRetries: number;
  avgRetries: number;
  successAfterRetry: number;
  fallbackUsed: number;
  successRate: number;
}

interface ProviderRetryData {
  provider: string;
  retries: number;
  calls: number;
  fallbacks: number;
}

interface RetryLog {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  retry_count: number;
  used_fallback: boolean;
  success: boolean;
  latency_ms: number;
  error_message: string | null;
}

interface DailyRetryData {
  date: string;
  retries: number;
  fallbacks: number;
}

export function DevRetryStats() {
  const [stats, setStats] = useState<RetryStats | null>(null);
  const [providerData, setProviderData] = useState<ProviderRetryData[]>([]);
  const [dailyData, setDailyData] = useState<DailyRetryData[]>([]);
  const [logs, setLogs] = useState<RetryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  useEffect(() => {
    fetchRetryStats();
  }, [period, providerFilter]);

  const fetchRetryStats = async () => {
    setLoading(true);

    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));

      // Base query
      let query = supabase
        .from("ai_usage_logs")
        .select("*")
        .gte("created_at", daysAgo.toISOString())
        .order("created_at", { ascending: false });

      if (providerFilter !== "all") {
        query = query.eq("provider", providerFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        // Calculate stats
        const totalCalls = data.length;
        const callsWithRetry = data.filter(d => (d.retry_count || 0) > 0).length;
        const totalRetries = data.reduce((sum, d) => sum + (d.retry_count || 0), 0);
        const avgRetries = callsWithRetry > 0 ? totalRetries / callsWithRetry : 0;
        const successAfterRetry = data.filter(d => (d.retry_count || 0) > 0 && d.success).length;
        const fallbackUsed = data.filter(d => d.used_fallback).length;
        const successRate = callsWithRetry > 0 
          ? (successAfterRetry / callsWithRetry) * 100 
          : 100;

        setStats({
          totalCalls,
          callsWithRetry,
          totalRetries,
          avgRetries,
          successAfterRetry,
          fallbackUsed,
          successRate
        });

        // Group by provider
        const providerMap = new Map<string, ProviderRetryData>();
        data.forEach(log => {
          const existing = providerMap.get(log.provider) || { 
            provider: log.provider, 
            retries: 0, 
            calls: 0,
            fallbacks: 0 
          };
          existing.calls++;
          existing.retries += log.retry_count || 0;
          if (log.used_fallback) existing.fallbacks++;
          providerMap.set(log.provider, existing);
        });
        setProviderData(Array.from(providerMap.values()).sort((a, b) => b.retries - a.retries));

        // Group by day
        const dayMap = new Map<string, DailyRetryData>();
        data.forEach(log => {
          const date = new Date(log.created_at).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          });
          const existing = dayMap.get(date) || { date, retries: 0, fallbacks: 0 };
          existing.retries += log.retry_count || 0;
          if (log.used_fallback) existing.fallbacks++;
          dayMap.set(date, existing);
        });
        setDailyData(Array.from(dayMap.values()).reverse());

        // Get logs with retries
        const retryLogs = data
          .filter(d => (d.retry_count || 0) > 0 || d.used_fallback)
          .slice(0, 50) as RetryLog[];
        setLogs(retryLogs);
      }
    } catch (error) {
      console.error("Error fetching retry stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Retries & Rate Limits</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Retries & Rate Limits</h1>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as "7" | "30" | "90")}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {providerData.map(p => (
                <SelectItem key={p.provider} value={p.provider}>
                  {p.provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchRetryStats}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Rate Limits Detectados
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {stats?.callsWithRetry || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              de {stats?.totalCalls || 0} chamadas totais
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Taxa de Recuperação
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {(stats?.successRate || 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.successAfterRetry || 0} recuperados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Retries Totais
            </CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalRetries || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Média: {(stats?.avgRetries || 0).toFixed(1)} por chamada
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Fallbacks Usados
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {stats?.fallbackUsed || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Provider secundário ativado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Retries by Provider */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Retries por Provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            {providerData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={providerData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="provider" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === "retries" ? "Retries" : "Fallbacks"
                    ]}
                  />
                  <Bar dataKey="retries" fill="hsl(var(--chart-1))" name="Retries" />
                  <Bar dataKey="fallbacks" fill="hsl(var(--chart-2))" name="Fallbacks" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Nenhum retry registrado no período
              </div>
            )}
          </CardContent>
        </Card>

        {/* Retries over time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Retries ao Longo do Tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="retries"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-1))" }}
                    name="Retries"
                  />
                  <Line
                    type="monotone"
                    dataKey="fallbacks"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-2))" }}
                    name="Fallbacks"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem dados disponíveis
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Retry Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Logs de Retry Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-center">Retries</TableHead>
                    <TableHead className="text-center">Fallback</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Latência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.provider}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.model}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={log.retry_count > 0 ? "secondary" : "outline"}
                          className={log.retry_count > 0 ? "bg-amber-500/10 text-amber-500" : ""}
                        >
                          {log.retry_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {log.used_fallback ? (
                          <Badge className="bg-blue-500/10 text-blue-500">Sim</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.success ? (
                          <Badge className="bg-primary/10 text-primary">Sucesso</Badge>
                        ) : (
                          <Badge variant="destructive">Falha</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(log.latency_ms / 1000).toFixed(1)}s
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Nenhum retry registrado no período
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
