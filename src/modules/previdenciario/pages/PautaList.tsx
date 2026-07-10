import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, MapPin, Plus, Loader2, FolderOpen, Trash2, ArrowUpDown, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { listPautas, deletePauta } from "../api/pautas";
import { NovaPautaDialog } from "../components/NovaPautaDialog";
import type { PrevPauta } from "../types";

function formatData(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type SortKey =
  | "data_desc"
  | "data_asc"
  | "local_asc"
  | "local_desc"
  | "cidade_asc"
  | "created_desc";

const SORT_LABELS: Record<SortKey, string> = {
  data_desc: "Data (mais recente)",
  data_asc: "Data (mais antiga)",
  local_asc: "Local (A–Z)",
  local_desc: "Local (Z–A)",
  cidade_asc: "Cidade / UF (A–Z)",
  created_desc: "Criação (mais recente)",
};

const SORT_STORAGE_KEY = "prev:pautas:sort";

function loadInitialSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY) as SortKey | null;
    if (v && v in SORT_LABELS) return v;
  } catch {}
  return "data_desc";
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function sortPautas(list: PrevPauta[], sortBy: SortKey): PrevPauta[] {
  const arr = [...list];
  switch (sortBy) {
    case "data_desc":
      return arr.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    case "data_asc":
      return arr.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    case "local_asc":
      return arr.sort((a, b) => collator.compare(a.local ?? "", b.local ?? ""));
    case "local_desc":
      return arr.sort((a, b) => collator.compare(b.local ?? "", a.local ?? ""));
    case "cidade_asc":
      return arr.sort((a, b) => {
        const ca = `${a.cidade ?? ""} ${a.uf ?? ""}`.trim();
        const cb = `${b.cidade ?? ""} ${b.uf ?? ""}`.trim();
        return collator.compare(ca, cb) || collator.compare(a.local ?? "", b.local ?? "");
      });
    case "created_desc":
      return arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
}

export default function PautaList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pautas, setPautas] = useState<PrevPauta[]>([]);
  const [novaOpen, setNovaOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>(loadInitialSort);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {}
  }, [sortBy]);

  const reload = async () => {
    setLoading(true);
    try {
      setPautas(await listPautas());
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao carregar pautas", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta pauta e todas as perícias dentro dela? Esta ação não pode ser desfeita.")) return;
    try {
      await deletePauta(id);
      toast({ title: "Pauta excluída" });
      void reload();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  };

  const isAgrupadoPorData = sortBy === "data_desc" || sortBy === "data_asc";
  const pautasOrdenadas = sortPautas(pautas, sortBy);

  // Agrupar por data (apenas nos modos por data)
  const grupos = pautasOrdenadas.reduce<Record<string, PrevPauta[]>>((acc, p) => {
    (acc[p.data] ??= []).push(p);
    return acc;
  }, {});
  const datasOrdenadas =
    sortBy === "data_asc"
      ? Object.keys(grupos).sort((a, b) => (a < b ? -1 : 1))
      : Object.keys(grupos).sort((a, b) => (a < b ? 1 : -1));

  const renderCard = (p: PrevPauta, showData: boolean) => (
    <Card
      key={p.id}
      className="p-4 hover:border-primary hover:shadow-sm transition cursor-pointer group relative"
      onClick={() => navigate(`/previdenciario/pauta/${p.id}`)}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{p.local}</h3>
          {(p.cidade || p.uf) && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[p.cidade, p.uf].filter(Boolean).join(" / ")}
            </p>
          )}
          {showData && (
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatData(p.data)}
            </p>
          )}
          {p.observacoes && (
            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
              {p.observacoes}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition"
        onClick={(e) => { e.stopPropagation(); void handleDelete(p.id); }}
        title="Excluir pauta"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pautas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize suas perícias por data e local. Cada pasta agrupa as perícias daquele dia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-[210px] h-9">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova pauta
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : pautas.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">Nenhuma pauta ainda</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Crie sua primeira pasta de perícias para começar.
          </p>
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova pauta
          </Button>
        </Card>
      ) : isAgrupadoPorData ? (
        <div className="space-y-6">
          {datasOrdenadas.map((data) => (
            <div key={data} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <CalendarDays className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  {formatData(data)}
                </h2>
                <Badge variant="outline" className="text-[10px]">
                  {grupos[data].length} pasta{grupos[data].length > 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {grupos[data].map((p) => renderCard(p, false))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pautasOrdenadas.map((p) => renderCard(p, true))}
        </div>
      )}

      <NovaPautaDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        onCreated={(p) => navigate(`/previdenciario/pauta/${p.id}`)}
      />
    </div>
  );
}
