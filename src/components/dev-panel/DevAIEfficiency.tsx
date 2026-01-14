import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Trophy, 
  Medal, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Download,
  BarChart3,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ImportJob {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  progress: number;
  current_step: string | null;
  error: string | null;
  result: {
    aiUsage?: {
      pdfExtraction?: {
        provider?: string;
        model?: string;
        durationMs?: number;
      };
      summaries?: {
        provider?: string;
        model?: string;
        count?: number;
        durationMs?: number;
      };
      totalDurationMs?: number;
    };
  } | null;
  user_id: string;
  file_path: string | null;
}

interface AIStats {
  model: string;
  provider: string;
  totalJobs: number;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  successRate: number;
  score: number;
}

interface StepTiming {
  step: string;
  durationMs: number;
  success: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  'gemini': 'Google Gemini',
  'openai': 'OpenAI',
  'lovable': 'IA Integrada',
  'openrouter': 'OpenRouter',
  'groq': 'Groq',
  'deepseek': 'DeepSeek',
  'claude': 'Claude',
  'grok': 'Grok'
};

const STEP_LABELS: Record<string, string> = {
  'upload': 'Upload PDF',
  'extraction': 'Extração Vision',
  'processing': 'Processamento',
  'resumo_peticao': 'Resumo Petição',
  'resumo_contestacao': 'Resumo Contestação',
  'descricao_doencas': 'Descrição Doenças',
  'nexo_causal': 'Nexo Causal',
  'incapacidade': 'Incapacidade',
  'finalizing': 'Finalizando',
  'completed': 'Concluído'
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider.toLowerCase()] || provider;
}

export function DevAIEfficiency() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [aiStats, setAiStats] = useState<AIStats[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState("7d");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      // Calculate date filter
      let dateFilter = new Date();
      switch (period) {
        case "24h":
          dateFilter.setHours(dateFilter.getHours() - 24);
          break;
        case "7d":
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case "30d":
          dateFilter.setDate(dateFilter.getDate() - 30);
          break;
        case "90d":
          dateFilter.setDate(dateFilter.getDate() - 90);
          break;
        default:
          dateFilter.setDate(dateFilter.getDate() - 7);
      }

      // Fetch import jobs
      let query = supabase
        .from('import_jobs')
        .select('*')
        .gte('created_at', dateFilter.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (statusFilter !== "all") {
        query = query.eq('status', statusFilter);
      }

      const { data: jobsData, error: jobsError } = await query;

      if (jobsError) throw jobsError;
      
      // Type-safe conversion of jobs
      const typedJobs: ImportJob[] = (jobsData || []).map(job => ({
        ...job,
        result: job.result as ImportJob['result']
      }));
      
      setJobs(typedJobs);

      // Calculate AI stats from jobs
      const statsMap = new Map<string, {
        totalJobs: number;
        successCount: number;
        failureCount: number;
        totalDuration: number;
        provider: string;
      }>();

      for (const job of typedJobs) {
        const result = job.result;
        if (!result?.aiUsage) continue;

        const pdfModel = result.aiUsage.pdfExtraction?.model || 'unknown';
        const summaryProvider = result.aiUsage.summaries?.provider || 'unknown';
        const summaryModel = result.aiUsage.summaries?.model || 'unknown';
        const totalDuration = result.aiUsage.totalDurationMs || 0;
        const isSuccess = job.status === 'completed';

        // Track PDF extraction model
        if (pdfModel !== 'unknown') {
          const existing = statsMap.get(pdfModel) || {
            totalJobs: 0,
            successCount: 0,
            failureCount: 0,
            totalDuration: 0,
            provider: 'gemini'
          };
          existing.totalJobs++;
          if (isSuccess) existing.successCount++;
          else existing.failureCount++;
          existing.totalDuration += result.aiUsage.pdfExtraction?.durationMs || 0;
          statsMap.set(pdfModel, existing);
        }

        // Track summary model
        if (summaryModel !== 'unknown' && summaryModel !== 'none') {
          const existing = statsMap.get(summaryModel) || {
            totalJobs: 0,
            successCount: 0,
            failureCount: 0,
            totalDuration: 0,
            provider: summaryProvider
          };
          existing.totalJobs++;
          if (isSuccess) existing.successCount++;
          else existing.failureCount++;
          existing.totalDuration += result.aiUsage.summaries?.durationMs || 0;
          statsMap.set(summaryModel, existing);
        }
      }

      // Convert to array with calculated metrics
      const statsArray: AIStats[] = Array.from(statsMap.entries())
        .map(([model, data]) => {
          const successRate = data.totalJobs > 0 ? (data.successCount / data.totalJobs) * 100 : 0;
          const avgDuration = data.totalJobs > 0 ? data.totalDuration / data.totalJobs : 0;
          // Score = (1 / avgDuration) * successRate * 1000 - higher is better
          const score = avgDuration > 0 ? (1 / avgDuration) * successRate * 1000 : 0;
          
          return {
            model,
            provider: data.provider,
            totalJobs: data.totalJobs,
            successCount: data.successCount,
            failureCount: data.failureCount,
            avgDurationMs: avgDuration,
            successRate,
            score
          };
        })
        .sort((a, b) => b.score - a.score);

      setAiStats(statsArray);
    } catch (error) {
      console.error('Error fetching AI efficiency data:', error);
      toast.error('Erro ao carregar dados de eficiência');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, statusFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Dados atualizados');
  };

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const recommendedAI = useMemo(() => {
    if (aiStats.length === 0) return null;
    return aiStats[0];
  }, [aiStats]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs;
    const query = searchQuery.toLowerCase();
    return jobs.filter(job => 
      job.id.toLowerCase().includes(query) ||
      job.file_path?.toLowerCase().includes(query) ||
      job.status.toLowerCase().includes(query)
    );
  }, [jobs, searchQuery]);

  const exportCSV = () => {
    const headers = ['ID', 'Data', 'Status', 'Duração Total', 'Modelo PDF', 'Modelo Resumos', 'Erro'];
    const rows = jobs.map(job => [
      job.id,
      format(new Date(job.created_at), 'dd/MM/yyyy HH:mm'),
      job.status,
      job.result?.aiUsage?.totalDurationMs ? formatDuration(job.result.aiUsage.totalDurationMs) : '-',
      job.result?.aiUsage?.pdfExtraction?.model || '-',
      job.result?.aiUsage?.summaries?.model || '-',
      job.error || '-'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-efficiency-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório exportado');
  };

  const getStepTimings = (job: ImportJob): StepTiming[] => {
    const timings: StepTiming[] = [];
    const result = job.result;
    
    if (!result?.aiUsage) return timings;

    // PDF Extraction
    if (result.aiUsage.pdfExtraction?.durationMs) {
      timings.push({
        step: 'extraction',
        durationMs: result.aiUsage.pdfExtraction.durationMs,
        success: job.status === 'completed'
      });
    }

    // Summaries (aggregate for now, could be split if we add step_timings)
    if (result.aiUsage.summaries?.durationMs) {
      timings.push({
        step: 'summaries',
        durationMs: result.aiUsage.summaries.durationMs,
        success: result.aiUsage.summaries.count > 0
      });
    }

    return timings;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Eficiência de IAs</h2>
          <p className="text-muted-foreground">Análise de performance e recomendações de modelos de IA</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Recommended AI Card */}
      {recommendedAI && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-lg">IA Recomendada Atual</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-foreground">{recommendedAI.model}</h3>
                <p className="text-muted-foreground">{getProviderLabel(recommendedAI.provider)}</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="flex items-center gap-1 text-primary">
                    <Zap className="h-4 w-4" />
                    <span className="font-semibold">{formatDuration(recommendedAI.avgDurationMs)}</span>
                  </div>
                  <span className="text-muted-foreground">Tempo médio</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-semibold">{recommendedAI.successRate.toFixed(1)}%</span>
                  </div>
                  <span className="text-muted-foreground">Taxa de sucesso</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1 text-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span className="font-semibold">{recommendedAI.totalJobs}</span>
                  </div>
                  <span className="text-muted-foreground">Importações</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Ranking Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="h-5 w-5" />
            Ranking de IAs
          </CardTitle>
          <CardDescription>
            Comparativo de performance entre modelos de IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aiStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum dado de IA disponível no período selecionado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Posição</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Velocidade</TableHead>
                  <TableHead className="text-right">Taxa Sucesso</TableHead>
                  <TableHead className="text-right">Sucessos</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiStats.map((stat, index) => (
                  <TableRow key={stat.model}>
                    <TableCell>
                      {index === 0 && <span className="text-lg">🥇</span>}
                      {index === 1 && <span className="text-lg">🥈</span>}
                      {index === 2 && <span className="text-lg">🥉</span>}
                      {index > 2 && <span className="text-muted-foreground">{index + 1}º</span>}
                    </TableCell>
                    <TableCell className="font-medium">{stat.model}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getProviderLabel(stat.provider)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {formatDuration(stat.avgDurationMs)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={stat.successRate >= 90 ? "default" : stat.successRate >= 70 ? "secondary" : "destructive"}
                      >
                        {stat.successRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-green-600 dark:text-green-400">
                      {stat.successCount}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {stat.failureCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detailed Analysis per Import */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Análise Detalhada por Importação
              </CardTitle>
              <CardDescription>
                Histórico de importações com tempo por etapa
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Últimas 24h</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="completed">Sucesso</SelectItem>
                  <SelectItem value="failed">Falha</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Input
              placeholder="Buscar por ID ou arquivo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma importação encontrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredJobs.map((job) => {
                const isExpanded = expandedJobs.has(job.id);
                const timings = getStepTimings(job);
                const pdfModel = job.result?.aiUsage?.pdfExtraction?.model || '-';
                const summaryModel = job.result?.aiUsage?.summaries?.model || '-';
                const totalDuration = job.result?.aiUsage?.totalDurationMs;

                return (
                  <Collapsible
                    key={job.id}
                    open={isExpanded}
                    onOpenChange={() => toggleJobExpanded(job.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{job.id.slice(0, 8)}...</span>
                              {job.file_path && (
                                <span className="text-muted-foreground text-sm">
                                  - {job.file_path.split('/').pop()}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(job.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {totalDuration && (
                            <span className="text-sm text-muted-foreground">
                              {formatDuration(totalDuration)}
                            </span>
                          )}
                          <Badge 
                            variant={
                              job.status === 'completed' ? 'default' : 
                              job.status === 'failed' ? 'destructive' : 
                              'secondary'
                            }
                          >
                            {job.status === 'completed' ? 'Sucesso' : 
                             job.status === 'failed' ? 'Falha' : 
                             job.status === 'processing' ? 'Processando' : job.status}
                          </Badge>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-7 mt-2 p-4 border rounded-lg bg-muted/30 space-y-3">
                        {/* AI Models Used */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Modelo PDF:</span>{' '}
                            <span className="font-medium">{pdfModel}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Modelo Resumos:</span>{' '}
                            <span className="font-medium">{summaryModel}</span>
                          </div>
                        </div>

                        {/* Step Timings */}
                        {timings.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-sm font-medium">Etapas:</span>
                            <div className="space-y-1">
                              {timings.map((timing, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    {timing.success ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-destructive" />
                                    )}
                                    <span>{STEP_LABELS[timing.step] || timing.step}</span>
                                  </div>
                                  <span className="text-muted-foreground">{formatDuration(timing.durationMs)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Error if any */}
                        {job.error && (
                          <div className="text-sm">
                            <span className="text-destructive font-medium">Erro:</span>{' '}
                            <span className="text-muted-foreground">{job.error}</span>
                          </div>
                        )}

                        {/* Total Duration */}
                        {totalDuration && (
                          <div className="pt-2 border-t text-sm">
                            <span className="text-muted-foreground">Duração Total:</span>{' '}
                            <span className="font-bold">{formatDuration(totalDuration)}</span>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{jobs.length}</div>
              <p className="text-sm text-muted-foreground">Total Importações</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {jobs.filter(j => j.status === 'completed').length}
              </div>
              <p className="text-sm text-muted-foreground">Sucesso</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-destructive">
                {jobs.filter(j => j.status === 'failed').length}
              </div>
              <p className="text-sm text-muted-foreground">Falhas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">
                {jobs.length > 0 ? 
                  ((jobs.filter(j => j.status === 'completed').length / jobs.length) * 100).toFixed(1) : 0}%
              </div>
              <p className="text-sm text-muted-foreground">Taxa Sucesso Geral</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
