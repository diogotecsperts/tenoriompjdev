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
import { RefreshCw, Trash2, ChevronDown, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ErrorLog {
  id: string;
  user_id: string | null;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  component_stack: string | null;
  url: string;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
}

const ERROR_TYPE_COLORS: Record<string, string> = {
  boundary: "destructive",
  global: "secondary",
  promise: "outline",
  network: "secondary",
  api: "outline",
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  boundary: "React Boundary",
  global: "Global",
  promise: "Promise",
  network: "Network",
  api: "API",
};

export default function DevErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("24h");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from("error_logs") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      // Filtro de tipo
      if (typeFilter !== "all") {
        query = query.eq("error_type", typeFilter);
      }

      // Filtro de período
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
      setLogs((data as ErrorLog[]) || []);

      // Calcular estatísticas
      const newStats: Record<string, number> = { total: data?.length || 0 };
      data?.forEach((log) => {
        newStats[log.error_type] = (newStats[log.error_type] || 0) + 1;
      });
      setStats(newStats);
    } catch (err) {
      console.error("Erro ao buscar logs:", err);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar logs de erros.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [typeFilter, periodFilter]);

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("error_logs") as any)
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

  const getErrorIcon = (type: string) => {
    switch (type) {
      case "boundary":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "global":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
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
          <CardTitle className="text-lg">Logs de Erros</CardTitle>
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
          {/* Filtros */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tipo:</span>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="boundary">Boundary</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="promise">Promise</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                  <SelectItem value="api">API</SelectItem>
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
          </div>

          {/* Resumo */}
          <div className="flex flex-wrap gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm">
              <strong>Total:</strong> {stats.total || 0}
            </span>
            {Object.entries(stats)
              .filter(([key]) => key !== "total")
              .map(([type, count]) => (
                <span key={type} className="text-sm">
                  <strong>{ERROR_TYPE_LABELS[type] || type}:</strong> {count}
                </span>
              ))}
          </div>

          {/* Lista de logs */}
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum erro registrado no período selecionado.
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
                      {getErrorIcon(log.error_type)}
                      <Badge variant={ERROR_TYPE_COLORS[log.error_type] as "destructive" | "secondary" | "outline" | "default"}>
                        {ERROR_TYPE_LABELS[log.error_type] || log.error_type}
                      </Badge>
                      <span className="flex-1 text-sm truncate font-mono">
                        {log.error_message}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
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
                      <div>
                        <strong className="text-xs text-muted-foreground">URL:</strong>
                        <p className="text-sm font-mono break-all">{log.url}</p>
                      </div>
                      {log.error_stack && (
                        <div>
                          <strong className="text-xs text-muted-foreground">Stack Trace:</strong>
                          <pre className="text-xs font-mono mt-1 p-2 bg-background rounded border overflow-x-auto max-h-40">
                            {log.error_stack}
                          </pre>
                        </div>
                      )}
                      {log.component_stack && (
                        <div>
                          <strong className="text-xs text-muted-foreground">Component Stack:</strong>
                          <pre className="text-xs font-mono mt-1 p-2 bg-background rounded border overflow-x-auto max-h-40">
                            {log.component_stack}
                          </pre>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          <strong>User ID:</strong> {log.user_id || "Anônimo"}
                        </span>
                        <span>
                          <strong>User Agent:</strong> {log.user_agent?.substring(0, 50)}...
                        </span>
                      </div>
                      {log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata as object).length > 0 && (
                        <div>
                          <strong className="text-xs text-muted-foreground">Metadata:</strong>
                          <pre className="text-xs font-mono mt-1 p-2 bg-background rounded border overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
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
