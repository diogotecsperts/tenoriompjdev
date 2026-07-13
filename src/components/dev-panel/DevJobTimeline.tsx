import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface JobRow {
  id: string;
  user_id: string;
  user_email: string | null;
  status: string;
  current_step: string | null;
  progress: number;
  error: string | null;
  route: string | null;
  created_at: string;
  updated_at: string;
  step_count: number;
  error_count: number;
  total_duration_ms: number;
}

interface StepEntry {
  step: string;
  status: "ok" | "error" | "info";
  duration_ms: number | null;
  provider: string | null;
  model: string | null;
  at: string;
  message: string;
  meta: Record<string, unknown>;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusBadge(s: string) {
  if (s === "completed" || s === "ok") {
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">OK</Badge>;
  }
  if (s === "failed" || s === "error") {
    return <Badge variant="destructive">Falha</Badge>;
  }
  if (s === "processing") {
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Processando</Badge>;
  }
  return <Badge variant="secondary">{s}</Badge>;
}

export default function DevJobTimeline() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { job: any; steps: StepEntry[]; raw_logs: any[] }>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { limit: 80 };
      if (statusFilter !== "all") body.status = statusFilter;
      const { data, error } = await supabase.functions.invoke("dev-list-jobs", {
        body,
      });
      if (error) throw error;
      setJobs((data as any)?.jobs ?? []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar jobs",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadDetail = async (jobId: string) => {
    if (detail[jobId]) return;
    setDetailLoading(jobId);
    try {
      const { data, error } = await supabase.functions.invoke(
        `dev-list-jobs?job_id=${encodeURIComponent(jobId)}`,
        { method: "GET" },
      );
      if (error) throw error;
      setDetail((d) => ({ ...d, [jobId]: data as any }));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar timeline",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDetailLoading(null);
    }
  };

  const toggle = (jobId: string) => {
    setExpanded((cur) => {
      const next = cur === jobId ? null : jobId;
      if (next) loadDetail(next);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.id.toLowerCase().includes(q) ||
        (j.user_email ?? "").toLowerCase().includes(q) ||
        (j.current_step ?? "").toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const downloadJson = (jobId: string) => {
    const d = detail[jobId];
    if (!d) return;
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Job Timeline</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Linha do tempo ponta-a-ponta de cada import de PDF: OCR → preenchimento → dispatch.
              Duração, provider e erros por etapa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por id / email / etapa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="failed">Com falha</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchJobs} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum job encontrado.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((j) => {
                const isOpen = expanded === j.id;
                return (
                  <div
                    key={j.id}
                    className="border border-border rounded-md bg-card overflow-hidden"
                  >
                    <button
                      onClick={() => toggle(j.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(j.status)}
                          {j.route && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {j.route}
                            </Badge>
                          )}
                          <span className="text-sm text-muted-foreground truncate">
                            {j.user_email ?? j.user_id.slice(0, 8)}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {j.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {j.current_step ?? "-"} · {new Date(j.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {fmtMs(j.total_duration_ms)}
                        </span>
                        <span>{j.step_count} etapas</span>
                        {j.error_count > 0 && (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {j.error_count}
                          </span>
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 p-4">
                        {detailLoading === j.id && !detail[j.id] ? (
                          <div className="text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando timeline...
                          </div>
                        ) : detail[j.id] ? (
                          <>
                            <div className="flex justify-between items-center mb-3">
                              <div className="text-xs text-muted-foreground">
                                {detail[j.id].steps.length} eventos registrados
                              </div>
                              <Button variant="outline" size="sm" onClick={() => downloadJson(j.id)}>
                                <Download className="h-3 w-3 mr-2" /> Baixar JSON
                              </Button>
                            </div>
                            {j.error && (
                              <div className="mb-3 p-2 rounded bg-destructive/10 text-destructive text-xs font-mono">
                                {j.error}
                              </div>
                            )}
                            <ol className="space-y-1">
                              {detail[j.id].steps.map((s, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2 text-xs font-mono py-1 border-b border-border/50 last:border-0"
                                >
                                  {s.status === "error" ? (
                                    <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                                  ) : s.status === "ok" ? (
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <div className="h-3 w-3 rounded-full bg-muted-foreground/40 flex-shrink-0 mt-0.5" />
                                  )}
                                  <span className="text-muted-foreground w-16 flex-shrink-0">
                                    {new Date(s.at).toLocaleTimeString()}
                                  </span>
                                  <span className="font-semibold w-40 flex-shrink-0 truncate">
                                    {s.step}
                                  </span>
                                  <span className="w-16 flex-shrink-0 text-muted-foreground">
                                    {fmtMs(s.duration_ms)}
                                  </span>
                                  {s.provider && (
                                    <span className="w-24 flex-shrink-0 text-muted-foreground truncate">
                                      {s.provider}
                                    </span>
                                  )}
                                  <span className="flex-1 truncate text-muted-foreground">
                                    {s.message}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
