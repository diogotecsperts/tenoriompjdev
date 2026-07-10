import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Users,
  FileText,
  CheckCircle2,
  Clock,
  Percent,
  Download,
  FileDown,
  Calendar as CalendarIcon,
  X,
  Loader2,
  Search,
  Gauge,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { downloadPrelaudoDocx } from "@/modules/previdenciario/lib/export/prelaudo-docx";
import { downloadPrelaudoPdf } from "@/modules/previdenciario/lib/export/prelaudo-pdf";

interface ProfileOption {
  id: string;
  nome: string;
  email: string;
  user_id: string | null;
}

interface Pauta {
  id: string;
  data: string;
  local: string;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  created_at: string;
}

interface Pericia {
  id: string;
  pauta_id: string;
  ordem: number;
  status: string;
  periciado_nome: string | null;
  pdf_path: string | null;
  pdf_processado: boolean;
  processo_numero: string | null;
  created_at: string;
}

interface Filters {
  userId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  status: string; // "all" | status value
  processado: string; // "all" | "sim" | "nao"
  onlyWithPdf: boolean;
  search: string;
}

const DEFAULT_FILTERS: Filters = {
  userId: null,
  dateFrom: null,
  dateTo: null,
  status: "all",
  processado: "all",
  onlyWithPdf: false,
  search: "",
};

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  faltou: "Faltou",
};

export function PrevUsagePanel() {
  const [users, setUsers] = useState<ProfileOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [pericias, setPericias] = useState<Pericia[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<
    Map<string, { size: number; pages: number | null }>
  >(new Map());
  const [loadingMetaIds, setLoadingMetaIds] = useState<Set<string>>(new Set());
  const [metaProgress, setMetaProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);


  // Load profiles + persisted filters
  useEffect(() => {
    (async () => {
      const [{ data: profiles }, { data: session }] = await Promise.all([
        supabase.from("profiles").select("id, nome, email, user_id").order("nome"),
        supabase.auth.getSession(),
      ]);
      setUsers((profiles ?? []) as ProfileOption[]);
      setLoadingUsers(false);
      const devId = session?.session?.user?.id;
      if (devId) {
        const { data: settings } = await (supabase.from as any)("user_settings")
          .select("dev_ui_prefs")
          .eq("user_id", devId)
          .maybeSingle();
        const stored = settings?.dev_ui_prefs?.prevUsageFilters;
        if (stored && typeof stored === "object") {
          setFilters({ ...DEFAULT_FILTERS, ...stored });
        }
      }
      setPrefsLoaded(true);
    })();
  }, []);

  // Persist filters (debounced-ish via effect)
  useEffect(() => {
    if (!prefsLoaded) return;
    const t = setTimeout(async () => {
      const { data: session } = await supabase.auth.getSession();
      const devId = session?.session?.user?.id;
      if (!devId) return;
      const { data: current } = await (supabase.from as any)("user_settings")
        .select("dev_ui_prefs")
        .eq("user_id", devId)
        .maybeSingle();
      const prefs = { ...(current?.dev_ui_prefs ?? {}), prevUsageFilters: filters };
      await (supabase.from as any)("user_settings")
        .update({ dev_ui_prefs: prefs })
        .eq("user_id", devId);
    }, 400);
    return () => clearTimeout(t);
  }, [filters, prefsLoaded]);

  // Load usage for selected user
  const loadUsage = useCallback(async (userId: string) => {
    setLoadingUsage(true);
    setPautas([]);
    setPericias([]);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-list-prev-usage?user_id=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPautas(data.pautas ?? []);
      setPericias(data.pericias ?? []);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar uso",
        description: err.message,
      });
    } finally {
      setLoadingUsage(false);
    }
  }, []);


  useEffect(() => {
    if (filters.userId) loadUsage(filters.userId);
  }, [filters.userId, loadUsage]);

  // Realtime subscription: keep pautas + pericias in sync for the selected user
  useEffect(() => {
    const uid = filters.userId;
    if (!uid) {
      setLiveConnected(false);
      return;
    }
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => loadUsage(uid), 500);
    };

    const channel = supabase
      .channel(`dev-usage-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prev_pautas",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          setPautas((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Pauta;
              if (prev.some((p) => p.id === row.id)) return prev;
              return [row, ...prev].sort((a, b) =>
                b.data.localeCompare(a.data),
              );
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Pauta;
              return prev.map((p) => (p.id === row.id ? { ...p, ...row } : p));
            }
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as { id: string };
              return prev.filter((p) => p.id !== oldRow.id);
            }
            return prev;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prev_pericias",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as any;
            setPericias((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev;
              return [
                ...prev,
                {
                  id: row.id,
                  pauta_id: row.pauta_id,
                  ordem: row.ordem,
                  status: row.status,
                  periciado_nome: row.periciado_nome,
                  pdf_path: row.pdf_path,
                  pdf_processado: !!row.pdf_processado,
                  processo_numero:
                    row.prev_extracao?.identificacao?.numero_processo ?? null,
                  created_at: row.created_at,
                },
              ].sort((a, b) => a.ordem - b.ordem);
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as any;
            setPericias((prev) =>
              prev.map((p) =>
                p.id === row.id
                  ? {
                      ...p,
                      status: row.status,
                      periciado_nome: row.periciado_nome,
                      pdf_path: row.pdf_path,
                      pdf_processado: !!row.pdf_processado,
                      processo_numero:
                        row.prev_extracao?.identificacao?.numero_processo ??
                        p.processo_numero,
                    }
                  : p,
              ),
            );
            // Invalida cache de meta se o pdf_path mudou
            const oldPath = (payload.old as any)?.pdf_path;
            if (oldPath && oldPath !== row.pdf_path) {
              setPdfMeta((prev) => {
                if (!prev.has(row.id)) return prev;
                const next = new Map(prev);
                next.delete(row.id);
                return next;
              });
            }
            // Heavy fields like prelaudo_data updated: schedule a full reload
            // in case downloads need the fresh copy on cache
            scheduleReload();
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id: string };
            setPericias((prev) => prev.filter((p) => p.id !== oldRow.id));
            setPdfMeta((prev) => {
              if (!prev.has(oldRow.id)) return prev;
              const next = new Map(prev);
              next.delete(oldRow.id);
              return next;
            });
          }

        },
      )
      .subscribe((status) => {
        setLiveConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
      setLiveConnected(false);
    };
  }, [filters.userId, loadUsage]);

  // Apply filters to pericias
  const filteredPericias = useMemo(() => {
    return pericias.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.processado === "sim" && !p.pdf_processado) return false;
      if (filters.processado === "nao" && p.pdf_processado) return false;
      if (filters.onlyWithPdf && !p.pdf_path) return false;
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const hay = `${p.periciado_nome ?? ""} ${p.processo_numero ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.dateFrom && p.created_at < filters.dateFrom) return false;
      if (filters.dateTo && p.created_at > filters.dateTo + "T23:59:59")
        return false;
      return true;
    });
  }, [pericias, filters]);

  const filteredPautas = useMemo(() => {
    return pautas.filter((pt) => {
      if (filters.dateFrom && pt.data < filters.dateFrom) return false;
      if (filters.dateTo && pt.data > filters.dateTo) return false;
      return true;
    });
  }, [pautas, filters]);

  const periciasByPauta = useMemo(() => {
    const map = new Map<string, Pericia[]>();
    filteredPericias.forEach((p) => {
      if (!map.has(p.pauta_id)) map.set(p.pauta_id, []);
      map.get(p.pauta_id)!.push(p);
    });
    return map;
  }, [filteredPericias]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPautas = filteredPautas.length;
    const totalPericias = filteredPericias.length;
    const totalPdfs = filteredPericias.filter((p) => p.pdf_path).length;
    const totalProc = filteredPericias.filter((p) => p.pdf_processado).length;
    const pct = totalPdfs > 0 ? Math.round((totalProc / totalPdfs) * 100) : 0;
    return { totalPautas, totalPericias, totalPdfs, totalProc, pct };
  }, [filteredPautas, filteredPericias]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.nome.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.user_id ?? "").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const selectedUser = users.find((u) => u.id === filters.userId);

  // Downloads
  const downloadOriginal = async (path: string, suggestedName?: string) => {
    setDownloadingId(path);
    try {
      const { data, error } = await supabase.functions.invoke(
        "dev-download-pdf",
        { body: { file_path: path, bucket: "prev-pdfs" } },
      );
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("URL não retornada");

      const fileName =
        suggestedName?.trim() ||
        path.split("/").pop() ||
        "documento.pdf";

      // Camada 1: fetch → blob → <a download> (sem popup, sem bloqueio).
      // Camada 2 (fallback): abre em nova aba se o fetch for bloqueado.
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const a = document.createElement("a");
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
        toast({ title: "Download iniciado", description: fileName });
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
        toast({
          title: "Download iniciado",
          description: `${fileName} (aberto em nova aba)`,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao baixar PDF",
        description: err.message,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadPrelaudo = async (
    periciaId: string,
    format: "docx" | "pdf",
  ) => {
    setDownloadingId(`${periciaId}-${format}`);
    try {
      // Query direto no banco (dev/admin tem policy is_developer). Muito mais
      // rápido do que passar por edge function (sem cold-start).
      const { data: pericia, error: perErr } = await (supabase.from as any)(
        "prev_pericias",
      )
        .select(
          "id, user_id, pauta_id, periciado_nome, prelaudo_data",
        )
        .eq("id", periciaId)
        .maybeSingle();
      if (perErr) throw perErr;
      if (!pericia) throw new Error("Perícia não encontrada");

      const [{ data: profile }, { data: pauta }] = await Promise.all([
        (supabase.from as any)("profiles")
          .select("nome, crm, uf_crm, especialidade")
          .eq("id", pericia.user_id)
          .maybeSingle(),
        (supabase.from as any)("prev_pautas")
          .select("data, local, cidade, uf")
          .eq("id", pericia.pauta_id)
          .maybeSingle(),
      ]);

      const prelaudoData = pericia.prelaudo_data ?? {};
      const localStr = pauta
        ? [pauta.local, pauta.cidade, pauta.uf].filter(Boolean).join(" — ")
        : "";
      const meta = {
        periciado:
          pericia.periciado_nome || prelaudoData?.identificacao?.nome || "",
        dataPericia:
          prelaudoData?.identificacao?.data_pericia ||
          pauta?.data ||
          new Date().toISOString().slice(0, 10),
        local: localStr,
        numeroProcesso: prelaudoData?.identificacao?.numero_processo || "",
        peritoNome: profile?.nome || "",
        peritoCRM: profile?.crm
          ? `${profile.crm}${profile.uf_crm ? "/" + profile.uf_crm : ""}`
          : "",
      };
      if (format === "docx") {
        await downloadPrelaudoDocx(prelaudoData, meta);
      } else {
        await downloadPrelaudoPdf(prelaudoData, meta);
      }
      toast({ title: `Pré-laudo ${format.toUpperCase()} gerado` });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar pré-laudo",
        description: err.message,
      });
    } finally {
      setDownloadingId(null);
    }
  };


  const clearFilters = () =>
    setFilters({ ...DEFAULT_FILTERS, userId: filters.userId });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Filtros</span>
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Usuário */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Usuário</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <Users className="mr-2 h-4 w-4" />
                  {selectedUser
                    ? `${selectedUser.nome} · ${selectedUser.user_id ?? ""}`
                    : loadingUsers
                      ? "Carregando..."
                      : "Selecionar usuário"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[380px] pointer-events-auto" align="start">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder="Buscar..."
                      className="pl-8 h-8"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="max-h-80 overflow-auto custom-scrollbar">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0",
                        filters.userId === u.id && "bg-primary/10",
                      )}
                      onClick={() =>
                        setFilters((f) => ({ ...f, userId: u.id }))
                      }
                    >
                      <div className="font-medium">{u.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email} · {u.user_id ?? "—"}
                      </div>
                    </button>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      Nenhum usuário
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Datas */}
          <div className="space-y-1.5">
            <Label className="text-xs">Data inicial</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateFrom
                    ? format(new Date(filters.dateFrom + "T00:00:00"), "dd/MM/yyyy", {
                        locale: ptBR,
                      })
                    : "Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <Calendar
                  mode="single"
                  selected={
                    filters.dateFrom
                      ? new Date(filters.dateFrom + "T00:00:00")
                      : undefined
                  }
                  onSelect={(d) =>
                    setFilters((f) => ({
                      ...f,
                      dateFrom: d ? format(d, "yyyy-MM-dd") : null,
                    }))
                  }
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data final</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateTo
                    ? format(new Date(filters.dateTo + "T00:00:00"), "dd/MM/yyyy", {
                        locale: ptBR,
                      })
                    : "Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <Calendar
                  mode="single"
                  selected={
                    filters.dateTo
                      ? new Date(filters.dateTo + "T00:00:00")
                      : undefined
                  }
                  onSelect={(d) =>
                    setFilters((f) => ({
                      ...f,
                      dateTo: d ? format(d, "yyyy-MM-dd") : null,
                    }))
                  }
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Processado */}
          <div className="space-y-1.5">
            <Label className="text-xs">Processado</Label>
            <Select
              value={filters.processado}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, processado: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sim">Só processados</SelectItem>
                <SelectItem value="nao">Não processados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Só com PDF */}
          <div className="flex items-end gap-2 pb-1">
            <Switch
              checked={filters.onlyWithPdf}
              onCheckedChange={(v) =>
                setFilters((f) => ({ ...f, onlyWithPdf: v }))
              }
              id="only-pdf"
            />
            <Label htmlFor="only-pdf" className="text-xs cursor-pointer">
              Só com PDF upado
            </Label>
          </div>

          {/* Busca */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Buscar periciado / processo</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                placeholder="Nome do periciado ou nº do processo"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      {filters.userId && (
        <>
          <div className="flex items-center justify-between px-1">
            <div className="text-xs text-muted-foreground">
              {selectedUser?.nome}
              {selectedUser?.user_id ? ` · ${selectedUser.user_id}` : ""}
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] rounded-full px-2 py-0.5 border",
                liveConnected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-muted text-muted-foreground border-border",
              )}
              title={
                liveConnected
                  ? "Recebendo atualizações em tempo real"
                  : "Conexão em tempo real inativa"
              }
            >
              <span className="relative flex h-2 w-2">
                {liveConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    liveConnected ? "bg-emerald-500" : "bg-muted-foreground/50",
                  )}
                />
              </span>
              {liveConnected ? "ao vivo" : "offline"}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard icon={Users} label="Pautas" value={kpis.totalPautas} />
            <KpiCard icon={FileText} label="Perícias" value={kpis.totalPericias} />
            <KpiCard icon={Download} label="PDFs upados" value={kpis.totalPdfs} />
            <KpiCard
              icon={CheckCircle2}
              label="Processados"
              value={kpis.totalProc}
              tone="success"
            />
            <KpiCard
              icon={Percent}
              label="Aproveitamento"
              value={`${kpis.pct}%`}
              tone="info"
            />
          </div>
        </>
      )}

      {/* Corpo */}
      {!filters.userId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione um usuário para começar.
          </CardContent>
        </Card>
      ) : loadingUsage ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredPautas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma pauta encontrada para este usuário/filtros.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {filteredPautas.map((pt) => {
            const ps = periciasByPauta.get(pt.id) ?? [];
            const psAll = pericias.filter((p) => p.pauta_id === pt.id);
            const pdfsCount = psAll.filter((p) => p.pdf_path).length;
            const procCount = psAll.filter((p) => p.pdf_processado).length;
            return (
              <AccordionItem
                key={pt.id}
                value={pt.id}
                className="border rounded-md px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex-1 flex items-center justify-between pr-4">
                    <div className="text-left">
                      <div className="font-medium">
                        {format(
                          new Date(pt.data + "T00:00:00"),
                          "dd 'de' MMM yyyy",
                          { locale: ptBR },
                        )}{" "}
                        · {pt.local}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[pt.cidade, pt.uf].filter(Boolean).join("/") || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">{psAll.length} perícias</Badge>
                      <Badge variant="outline">{pdfsCount} PDFs</Badge>
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                        {procCount} proc.
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {ps.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      Nenhuma perícia após aplicar filtros.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Periciado</TableHead>
                          <TableHead>Processo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>PDF</TableHead>
                          <TableHead>Processado</TableHead>
                          <TableHead>Criado</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ps.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-xs">
                              {p.ordem}
                            </TableCell>
                            <TableCell className="font-medium">
                              {p.periciado_nome ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.processo_numero ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {STATUS_LABEL[p.status] ?? p.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {p.pdf_path ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell>
                              {p.pdf_processado ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(p.created_at), "dd/MM/yy HH:mm")}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {p.pdf_path && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={downloadingId === p.pdf_path}
                                    onClick={() => {
                                      const safeName = (p.periciado_nome || "documento")
                                        .replace(/[^\p{L}\p{N}\s._-]/gu, "")
                                        .trim() || "documento";
                                      downloadOriginal(p.pdf_path!, `${safeName}.pdf`);
                                    }}

                                    title="Baixar PDF original"
                                  >
                                    {downloadingId === p.pdf_path ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Download className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                                {p.pdf_processado && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={
                                        downloadingId === `${p.id}-docx`
                                      }
                                      onClick={() =>
                                        downloadPrelaudo(p.id, "docx")
                                      }
                                      title="Baixar pré-laudo DOCX"
                                    >
                                      {downloadingId === `${p.id}-docx` ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <FileDown className="h-3 w-3" />
                                      )}
                                      <span className="ml-1 text-[10px]">DOCX</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={
                                        downloadingId === `${p.id}-pdf`
                                      }
                                      onClick={() =>
                                        downloadPrelaudo(p.id, "pdf")
                                      }
                                      title="Baixar pré-laudo PDF"
                                    >
                                      {downloadingId === `${p.id}-pdf` ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <FileDown className="h-3 w-3" />
                                      )}
                                      <span className="ml-1 text-[10px]">PDF</span>
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "success" | "info";
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center",
            tone === "success"
              ? "bg-emerald-100 text-emerald-700"
              : tone === "info"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
