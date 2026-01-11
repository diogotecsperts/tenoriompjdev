import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, Download, CheckCircle, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AILog {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  prompt_type: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  latency_ms: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
  user_name?: string;
}

export function DevLogs() {
  const [logs, setLogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data: logsData, error: logsError } = await supabase
        .from("ai_usage_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (logsError) throw logsError;

      // Get user names
      const userIds = [...new Set(logsData?.map((l) => l.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);

      const profilesMap = new Map(profiles?.map((p) => [p.id, p.nome]) || []);

      const logsWithNames = (logsData || []).map((log) => ({
        ...log,
        user_name: profilesMap.get(log.user_id) || "Desconhecido",
      }));

      setLogs(logsWithNames);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesProvider = providerFilter === "all" || log.provider === providerFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "success" && log.success) ||
      (statusFilter === "error" && !log.success);
    const matchesSearch =
      !searchTerm ||
      log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.prompt_type?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesProvider && matchesStatus && matchesSearch;
  });

  const providers = [...new Set(logs.map((l) => l.provider))];

  const exportCSV = () => {
    const headers = [
      "Data",
      "Usuário",
      "Provider",
      "Modelo",
      "Tipo",
      "Tokens Input",
      "Tokens Output",
      "Latência (ms)",
      "Status",
      "Erro",
    ];
    const rows = filteredLogs.map((log) => [
      format(new Date(log.created_at), "dd/MM/yyyy HH:mm"),
      log.user_name,
      log.provider,
      log.model,
      log.prompt_type || "-",
      log.tokens_input || "-",
      log.tokens_output || "-",
      log.latency_ms || "-",
      log.success ? "Sucesso" : "Erro",
      log.error_message || "-",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  // Stats
  const totalTokensInput = filteredLogs.reduce((sum, l) => sum + (l.tokens_input || 0), 0);
  const totalTokensOutput = filteredLogs.reduce((sum, l) => sum + (l.tokens_output || 0), 0);
  const avgLatency =
    filteredLogs.filter((l) => l.latency_ms).length > 0
      ? filteredLogs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) /
        filteredLogs.filter((l) => l.latency_ms).length
      : 0;
  const successRate =
    filteredLogs.length > 0
      ? (filteredLogs.filter((l) => l.success).length / filteredLogs.length) * 100
      : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Logs & Métricas</h1>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Logs & Métricas</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tokens Input</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTokensInput.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tokens Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTokensOutput.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latência Média</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgLatency.toFixed(0)}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Logs de IA ({filteredLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuário, modelo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Providers</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Latência</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum log encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{log.user_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.provider}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.model}
                      </TableCell>
                      <TableCell className="text-sm">{log.prompt_type || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {log.tokens_input || 0} / {log.tokens_output || 0}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.latency_ms ? `${log.latency_ms}ms` : "-"}
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredLogs.length > 100 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Mostrando 100 de {filteredLogs.length} logs. Exporte o CSV para ver todos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
