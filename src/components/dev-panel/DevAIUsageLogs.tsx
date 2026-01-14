import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  Zap,
  Activity,
  Clock,
  AlertTriangle,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface AIUsageLog {
  id: string;
  created_at: string;
  user_id: string;
  provider: string;
  model: string;
  prompt_type: string;
  tokens_input: number | null;
  tokens_output: number | null;
  latency_ms: number | null;
  success: boolean | null;
  error_message: string | null;
}

interface Stats {
  total: number;
  success: number;
  errors: number;
  avgLatency: number;
  fallbacks: number;
  byProvider: Record<string, number>;
}

const PROMPT_TYPE_LABELS: Record<string, string> = {
  pdf_extraction: 'Extração PDF',
  resumo_peticao: 'Resumo Petição',
  resumo_contestacao: 'Resumo Contestação',
  descricao_doencas: 'Descrição Doenças',
  nexo_causal: 'Nexo Causal',
  incapacidade: 'Incapacidade'
};

const PROVIDER_NAMES: Record<string, string> = {
  lovable: 'IA Integrada',
  gemini: 'Gemini',
  openai: 'OpenAI',
  claude: 'Claude',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter'
};

export function DevAIUsageLogs() {
  const [logs, setLogs] = useState<AIUsageLog[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    success: 0,
    errors: 0,
    avgLatency: 0,
    fallbacks: 0,
    byProvider: {}
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [periodFilter, setPeriodFilter] = useState<string>("24h");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Pagination
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchLogs();
  }, [periodFilter, providerFilter, typeFilter, page]);

  const getDateFilter = () => {
    const now = new Date();
    switch (periodFilter) {
      case "1h":
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const fetchLogs = async () => {
    try {
      const dateFilter = getDateFilter();
      
      let query = supabase
        .from('ai_usage_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', dateFilter)
        .order('created_at', { ascending: false });

      if (providerFilter !== 'all') {
        query = query.eq('provider', providerFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('prompt_type', typeFilter);
      }

      // Get total count for pagination
      const { count } = await query;
      setTotalCount(count || 0);

      // Get paginated data
      const { data, error } = await query
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      setLogs(data || []);

      // Calculate stats from all data in the period
      const statsQuery = supabase
        .from('ai_usage_logs')
        .select('*')
        .gte('created_at', dateFilter);

      const { data: allData } = await statsQuery;

      if (allData) {
        const successCount = allData.filter(l => l.success).length;
        const errorCount = allData.filter(l => !l.success).length;
        const latencies = allData.filter(l => l.latency_ms).map(l => l.latency_ms!);
        const avgLatency = latencies.length > 0 ? 
          Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
        
        const byProvider: Record<string, number> = {};
        allData.forEach(l => {
          byProvider[l.provider] = (byProvider[l.provider] || 0) + 1;
        });

        // Count fallbacks (provider = lovable after a failed attempt)
        // This is an approximation - we'd need more context to be precise
        const fallbacks = allData.filter(l => 
          l.provider === 'lovable' && l.prompt_type && l.success
        ).length;

        setStats({
          total: allData.length,
          success: successCount,
          errors: errorCount,
          avgLatency,
          fallbacks: 0, // We'll track this properly with the new logging
          byProvider
        });
      }

    } catch (error) {
      console.error('Error fetching AI logs:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar logs de uso de IA"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const exportCSV = () => {
    if (logs.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum dado",
        description: "Não há logs para exportar"
      });
      return;
    }

    const headers = ['Data/Hora', 'Provider', 'Modelo', 'Tipo', 'Latência (ms)', 'Status', 'Erro'];
    const rows = logs.map(log => [
      format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
      log.provider,
      log.model,
      PROMPT_TYPE_LABELS[log.prompt_type] || log.prompt_type,
      log.latency_ms?.toString() || '',
      log.success ? 'Sucesso' : 'Erro',
      log.error_message || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai_usage_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Exportado",
      description: `${logs.length} registros exportados para CSV`
    });
  };

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      log.provider.toLowerCase().includes(search) ||
      log.model.toLowerCase().includes(search) ||
      log.prompt_type.toLowerCase().includes(search) ||
      (log.error_message && log.error_message.toLowerCase().includes(search))
    );
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Histórico de Uso de IA</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>
        <CardDescription>
          Logs de todas as chamadas de IA com métricas de performance
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Chamadas</p>
                </div>
                <Activity className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.success}</p>
                  <p className="text-xs text-muted-foreground">Sucesso</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-destructive">{stats.errors}</p>
                  <p className="text-xs text-muted-foreground">Erros</p>
                </div>
                <XCircle className="h-8 w-8 text-destructive opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.avgLatency}ms</p>
                  <p className="text-xs text-muted-foreground">Latência Média</p>
                </div>
                <Clock className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Provider Distribution */}
        {Object.keys(stats.byProvider).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byProvider).map(([provider, count]) => (
              <Badge key={provider} variant="secondary" className="text-xs">
                {PROVIDER_NAMES[provider] || provider}: {count} ({Math.round(count / stats.total * 100)}%)
              </Badge>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg">
          <Filter className="h-4 w-4 text-muted-foreground" />
          
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Última hora</SelectItem>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>

          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="lovable">Lovable</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="groq">Groq</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="pdf_extraction">Extração PDF</SelectItem>
              <SelectItem value="resumo_peticao">Resumo Petição</SelectItem>
              <SelectItem value="resumo_contestacao">Resumo Contestação</SelectItem>
              <SelectItem value="descricao_doencas">Descrição Doenças</SelectItem>
              <SelectItem value="nexo_causal">Nexo Causal</SelectItem>
              <SelectItem value="incapacidade">Incapacidade</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[180px] h-9"
          />
        </div>

        {/* Logs Table */}
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum log encontrado para os filtros selecionados</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">#</th>
                    <th className="text-left py-2 px-3 font-medium">Data/Hora</th>
                    <th className="text-left py-2 px-3 font-medium">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium">Provider</th>
                    <th className="text-left py-2 px-3 font-medium">Modelo</th>
                    <th className="text-right py-2 px-3 font-medium">Latência</th>
                    <th className="text-center py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, idx) => (
                    <tr key={log.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="py-2 px-3 text-muted-foreground">
                        {page * pageSize + idx + 1}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs">
                          {PROMPT_TYPE_LABELS[log.prompt_type] || log.prompt_type}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        {PROVIDER_NAMES[log.provider] || log.provider}
                      </td>
                      <td className="py-2 px-3">
                        <code className="text-xs bg-muted px-1 rounded">
                          {log.model.length > 20 ? log.model.substring(0, 20) + '...' : log.model}
                        </code>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        {log.latency_ms ? `${log.latency_ms}ms` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {log.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                        ) : (
                          <span title={log.error_message || ''}>
                            <XCircle className="h-4 w-4 text-destructive inline" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
