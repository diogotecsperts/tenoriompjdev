import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { RefreshCw, Trash2, ChevronDown, AlertTriangle, AlertCircle, Info, Bug, Server } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BackendLog {
  id: string;
  function_name: string;
  job_id: string | null;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const LEVEL_COLORS: Record<string, string> = {
  error: "destructive",
  warn: "secondary",
  info: "outline",
  debug: "default",
};

const LEVEL_ICONS: Record<string, React.ReactNode> = {
  error: <AlertTriangle className="h-4 w-4 text-destructive" />,
  warn: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
  debug: <Bug className="h-4 w-4 text-muted-foreground" />,
};

export default function DevBackendLogs() {
  const [logs, setLogs] = useState<BackendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [functionFilter, setFunctionFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("24h");
  const [jobIdFilter, setJobIdFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [functions, setFunctions] = useState<string[]>([]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("backend_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      // Level filter
      if (levelFilter !== "all") {
        query = query.eq("level", levelFilter);
      }

      // Function filter
      if (functionFilter !== "all") {
        query = query.eq("function_name", functionFilter);
      }

      // Job ID filter
      if (jobIdFilter.trim()) {
        query = query.eq("job_id", jobIdFilter.trim());
      }

      // Period filter
      const now = new Date();
      let since: Date;
      switch (periodFilter) {
        case "1h":
          since = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case "24h":
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      query = query.gte("created_at", since.toISOString());

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data as BackendLog[]) || []);

      // Calculate stats
      const newStats: Record<string, number> = { total: data?.length || 0 };
      const uniqueFunctions = new Set<string>();
      data?.forEach((log) => {
        newStats[log.level] = (newStats[log.level] || 0) + 1;
        uniqueFunctions.add(log.function_name);
      });
      setStats(newStats);
      setFunctions(Array.from(uniqueFunctions).sort());
    } catch (err) {
      console.error("Erro ao buscar logs:", err);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar logs de backend.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelFilter, functionFilter, periodFilter, jobIdFilter]);

  const handleClearLogs = async () => {
    if (!confirm("Tem certeza que deseja limpar todos os logs do período selecionado?")) {
      return;
    }

    try {
      const now = new Date();
      let since: Date;
      switch (periodFilter) {
        case "1h":
          since = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case "24h":
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const { error } = await supabase
        .from("backend_logs")
        .delete()
        .gte("created_at", since.toISOString());

      if (error) throw error;

      toast({
        title: "Logs limpos",
        description: "Os logs foram removidos com sucesso.",
      });
      fetchLogs();
    } catch (err) {
      console.error("Erro ao limpar logs:", err);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao limpar logs.",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Logs de Backend (Edge Functions)
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearLogs}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Nível:</span>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Função:</span>
              <Select value={functionFilter} onValueChange={setFunctionFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {functions.map((fn) => (
                    <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Período:</span>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="24h">Últimas 24h</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Job ID:</span>
              <Input
                placeholder="Filtrar por Job ID..."
                value={jobIdFilter}
                onChange={(e) => setJobIdFilter(e.target.value)}
                className="w-48"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="flex flex-wrap gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm">
              <strong>Total:</strong> {stats.total || 0}
            </span>
            <span className="text-sm text-destructive">
              <strong>Erros:</strong> {stats.error || 0}
            </span>
            <span className="text-sm text-yellow-600">
              <strong>Avisos:</strong> {stats.warn || 0}
            </span>
            <span className="text-sm text-blue-600">
              <strong>Info:</strong> {stats.info || 0}
            </span>
            <span className="text-sm text-muted-foreground">
              <strong>Debug:</strong> {stats.debug || 0}
            </span>
          </div>

          {/* Logs list */}
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum log registrado no período selecionado.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Collapsible
                  key={log.id}
                  open={expandedId === log.id}
                  onOpenChange={(open) => setExpandedId(open ? log.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors">
                      {LEVEL_ICONS[log.level] || <Info className="h-4 w-4" />}
                      <Badge variant={LEVEL_COLORS[log.level] as "destructive" | "secondary" | "outline" | "default"}>
                        {log.level.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs">
                        {log.function_name}
                      </Badge>
                      <span className="flex-1 text-sm truncate">
                        {log.message}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          expandedId === log.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 mt-1 rounded-lg border bg-muted/30 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <strong className="text-xs text-muted-foreground">Função:</strong>
                          <p className="font-mono">{log.function_name}</p>
                        </div>
                        {log.job_id && (
                          <div>
                            <strong className="text-xs text-muted-foreground">Job ID:</strong>
                            <p className="font-mono text-xs break-all">{log.job_id}</p>
                          </div>
                        )}
                      </div>
                      <div>
                        <strong className="text-xs text-muted-foreground">Mensagem:</strong>
                        <p className="text-sm mt-1">{log.message}</p>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div>
                          <strong className="text-xs text-muted-foreground">Metadata:</strong>
                          <pre className="text-xs font-mono mt-1 p-2 bg-background rounded border overflow-x-auto max-h-40">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        <strong>Criado em:</strong>{" "}
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
