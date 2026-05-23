import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileClock, FilePlus2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PrevLaudo {
  id: string;
  title: string;
  status: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_VARIANTS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-700",
  em_andamento: "bg-blue-100 text-blue-700",
  concluido: "bg-emerald-100 text-emerald-700",
  finalizado: "bg-emerald-100 text-emerald-700",
};

export default function PrevidenciarioHistorico() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [laudos, setLaudos] = useState<PrevLaudo[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("laudos")
      .select("id, title, status, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("tipo_laudo", "previdenciario" as any)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setLaudos(data as PrevLaudo[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    return laudos.filter((l) => {
      const matchSearch = search
        ? l.title.toLowerCase().includes(search.toLowerCase())
        : true;
      const matchStatus =
        statusFilter === "all" ? true : (l.status ?? "rascunho") === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [laudos, search, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <FileClock className="h-3.5 w-3.5" />
            <span>Módulo Previdenciário</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Histórico de laudos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas laudos previdenciários. Laudos trabalhistas ficam em{" "}
            <button
              onClick={() => navigate("/historico")}
              className="text-primary hover:underline"
            >
              outro módulo
            </button>
            .
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button size="sm" disabled>
            <FilePlus2 className="h-4 w-4 mr-1.5" />
            Novo laudo
            <span className="ml-2 text-[10px] uppercase tracking-wider bg-primary-foreground/20 px-1.5 py-0.5 rounded">
              Em breve
            </span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <FileClock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">
                {laudos.length === 0
                  ? "Nenhum laudo previdenciário ainda"
                  : "Nenhum resultado para o filtro atual"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {laudos.length === 0
                  ? "Quando o editor for liberado, seus laudos aparecerão aqui."
                  : "Tente ajustar a busca ou o filtro de status."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead className="w-44">Criado em</TableHead>
                  <TableHead className="w-44">Atualizado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const status = l.status ?? "rascunho";
                  return (
                    <TableRow key={l.id} className="cursor-not-allowed opacity-90">
                      <TableCell className="font-medium">{l.title}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`${STATUS_VARIANTS[status] ?? STATUS_VARIANTS.rascunho} font-normal capitalize`}
                        >
                          {status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(l.created_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(l.updated_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Total: {filtered.length} laudo(s) previdenciário(s)
      </p>
    </div>
  );
}
