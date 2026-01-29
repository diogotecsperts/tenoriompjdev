import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, 
  FileText, 
  Cpu, 
  TrendingUp,
  Calendar,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface DashboardStats {
  totalUsers: number;
  totalLaudos: number;
  totalAIRequests: number;
  laudosThisMonth: number;
  aiRequestsToday: number;
  retryCount: number;
  successAfterRetry: number;
}

interface AIProviderUsage {
  provider: string;
  count: number;
}

interface LaudosByDay {
  date: string;
  count: number;
}

const COLORS = ["hsl(168, 58%, 39%)", "hsl(28, 87%, 67%)", "hsl(210, 20%, 60%)", "hsl(215, 25%, 35%)", "hsl(168, 58%, 50%)"];

export function DevDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [providerUsage, setProviderUsage] = useState<AIProviderUsage[]>([]);
  const [laudosByDay, setLaudosByDay] = useState<LaudosByDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    const errorList: string[] = [];

    try {
      // Fetch total users
      const { count: usersCount, error: usersError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      
      if (usersError) errorList.push("Erro ao carregar usuários");

      // Fetch total laudos
      const { count: laudosCount, error: laudosError } = await supabase
        .from("laudos")
        .select("*", { count: "exact", head: true });
      
      if (laudosError) errorList.push("Erro ao carregar laudos");

      // Fetch laudos this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { count: laudosMonthCount, error: laudosMonthError } = await supabase
        .from("laudos")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startOfMonth.toISOString());
      
      if (laudosMonthError) errorList.push("Erro ao carregar laudos do mês");

      // Fetch AI usage stats
      const { count: aiCount, error: aiError } = await supabase
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true });
      
      if (aiError) errorList.push("Erro ao carregar logs de IA");

      // Fetch AI requests today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: aiTodayCount, error: aiTodayError } = await supabase
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());
      
      if (aiTodayError) errorList.push("Erro ao carregar logs de IA de hoje");

      // Fetch AI provider usage
      const { data: providerData, error: providerError } = await supabase
        .from("ai_usage_logs")
        .select("provider");
      
      if (providerError) {
        errorList.push("Erro ao carregar uso por provider");
      } else if (providerData) {
        const providerCounts: Record<string, number> = {};
        providerData.forEach((log) => {
          providerCounts[log.provider] = (providerCounts[log.provider] || 0) + 1;
        });
        setProviderUsage(
          Object.entries(providerCounts).map(([provider, count]) => ({
            provider,
            count,
          }))
        );
      }

      // Fetch laudos by day (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: laudosDayData, error: laudosDayError } = await supabase
        .from("laudos")
        .select("created_at")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true });
      
      if (laudosDayError) {
        errorList.push("Erro ao carregar laudos por dia");
      } else if (laudosDayData) {
        const daysCounts: Record<string, number> = {};
        laudosDayData.forEach((laudo) => {
          const date = new Date(laudo.created_at).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          });
          daysCounts[date] = (daysCounts[date] || 0) + 1;
        });
        setLaudosByDay(
          Object.entries(daysCounts).map(([date, count]) => ({
            date,
            count,
          }))
        );
      }

      // Fetch retry stats from AI logs this month
      let retryCount = 0;
      let successAfterRetry = 0;
      
      const { data: aiLogsMonth } = await supabase
        .from("ai_usage_logs")
        .select("retry_count, success")
        .gte("created_at", startOfMonth.toISOString());

      if (aiLogsMonth) {
        aiLogsMonth.forEach(log => {
          if ((log.retry_count || 0) > 0) {
            retryCount += log.retry_count || 0;
            if (log.success) successAfterRetry++;
          }
        });
      }

      setStats({
        totalUsers: usersCount || 0,
        totalLaudos: laudosCount || 0,
        totalAIRequests: aiCount || 0,
        laudosThisMonth: laudosMonthCount || 0,
        aiRequestsToday: aiTodayCount || 0,
        retryCount,
        successAfterRetry,
      });

      setErrors(errorList);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      errorList.push("Erro geral ao carregar dashboard");
      setErrors(errorList);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        {errors.length > 0 && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{errors.length} erro(s)</span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Usuários
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Laudos
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLaudos || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Laudos este Mês
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.laudosThisMonth || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Requisições IA
            </CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAIRequests || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              IA Hoje
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.aiRequestsToday || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Rate Limits
            </CardTitle>
            <RefreshCw className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {stats?.retryCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.successAfterRetry || 0} recuperados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Laudos por dia */}
        <Card>
          <CardHeader>
            <CardTitle>Laudos (Últimos 30 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            {laudosByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={laudosByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(168, 58%, 39%)"
                    fill="hsl(168, 58%, 39%)"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem dados disponíveis
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uso por Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Uso por Provider de IA</CardTitle>
          </CardHeader>
          <CardContent>
            {providerUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={providerUsage}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ provider, percent }) =>
                      `${provider} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="provider"
                  >
                    {providerUsage.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Nenhum uso de IA registrado
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
