import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Loader2,
  FileText,
  Trash2,
  CalendarDays,
  MapPin,
  ChevronUp,
  ChevronDown,
  User,
  Upload,
  Sparkles,
  Pencil,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getPauta,
  listPericias,
  deletePericia,
  updatePericia,
  uploadPericiaPdf,
} from "../api/pautas";
import { preProcessarPericia } from "../api/processar";
import type { MinimaxOcrProgress } from "@/lib/minimax-ocr-client";
import { NovaPericiaDialog } from "../components/NovaPericiaDialog";
import { EditarPautaDialog } from "../components/EditarPautaDialog";
import { PERICIA_STATUS_COLOR, PERICIA_STATUS_LABEL } from "../types";
import type { PrevPauta, PrevPericia } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import { useFakeProgress } from "../hooks/useFakeProgress";

function formatData(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function PautaDetalhe() {
  const { pautaId } = useParams<{ pautaId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pauta, setPauta] = useState<PrevPauta | null>(null);
  const [pericias, setPericias] = useState<PrevPericia[]>([]);
  const [novaOpen, setNovaOpen] = useState(false);
  const [processandoIds, setProcessandoIds] = useState<Set<string>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);
  const [processandoDetalhes, setProcessandoDetalhes] = useState<Record<string, string>>({});
  const [loteProgresso, setLoteProgresso] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const { progress, finish } = useFakeProgress(processandoIds.size > 0 || processandoLote);

  const reload = async () => {
    if (!pautaId) return;
    setLoading(true);
    try {
      const [p, list] = await Promise.all([getPauta(pautaId), listPericias(pautaId)]);
      setPauta(p);
      setPericias(list);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao carregar", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [pautaId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta perícia? Esta ação não pode ser desfeita.")) return;
    try {
      await deletePericia(id);
      toast({ title: "Perícia excluída" });
      void reload();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= pericias.length) return;
    const a = pericias[idx];
    const b = pericias[target];
    try {
      await Promise.all([
        updatePericia(a.id, { ordem: b.ordem }),
        updatePericia(b.id, { ordem: a.ordem }),
      ]);
      void reload();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao reordenar", description: err.message });
    }
  };

  const handleUploadPdf = async (pericia: PrevPericia, file: File) => {
    if (!user) return;
    try {
      const path = await uploadPericiaPdf(user.id, pericia.id, file);
      await updatePericia(pericia.id, { pdf_path: path, pdf_processado: false });
      toast({ title: "PDF anexado" });
      void reload();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro no upload", description: err.message });
    }
  };

  const proximaOrdem = pericias.length > 0
    ? Math.max(...pericias.map((p) => p.ordem)) + 1
    : 0;

  const pendentes = pericias.filter((p) => p.pdf_path && !p.pdf_processado);

  const formatMinimaxProgress = (p: MinimaxOcrProgress) => {
    if (p.message) return p.message;
    if (p.phase === "rasterizing") return `Rasterizando página ${p.currentPage}/${p.totalPages}`;
    if (p.phase === "extracting") return `Extraindo MiniMax ${p.currentChunk}/${p.totalChunks}`;
    return "Consolidando extração";
  };

  const handleProcessar = async (pericia: PrevPericia) => {
    if (!pericia.pdf_path) {
      toast({ variant: "destructive", title: "Sem PDF", description: "Anexe um PDF primeiro." });
      return;
    }
    setProcessandoIds((s) => new Set(s).add(pericia.id));
    setProcessandoDetalhes((s) => ({ ...s, [pericia.id]: "Preparando PDF" }));
    try {
      const r = await preProcessarPericia(pericia.id, {
        onMinimaxProgress: (p) => {
          setProcessandoDetalhes((s) => ({ ...s, [pericia.id]: formatMinimaxProgress(p) }));
        },
      });
      toast({
        title: "Processado com IA",
        description: `${r.pages} págs · ${r.documentosCriados} doc(s) · ${r.provider}/${r.model}`,
      });
      void reload();
    } catch (err: any) {
      const title =
        err?.code === "quota_exceeded"
          ? "Cota da IA esgotada"
          : err?.code === "invalid_key"
            ? "Credencial inválida"
            : err?.code === "rate_limited"
              ? "Muitas requisições"
              : err?.code === "file_too_large"
                ? "PDF muito grande"
                : err?.code === "unsupported_file"
                  ? "Arquivo não suportado"
                  : err?.code === "provider_unavailable"
                    ? "IA indisponível"
                    : "Erro IA";
      toast({ variant: "destructive", title, description: err.message });
    } finally {
      setProcessandoIds((s) => {
        const n = new Set(s);
        n.delete(pericia.id);
        return n;
      });
      setProcessandoDetalhes((s) => {
        const { [pericia.id]: _removed, ...rest } = s;
        return rest;
      });
      finish();
    }
  };

  const handleProcessarLote = async () => {
    if (pendentes.length === 0) return;
    setProcessandoLote(true);
    setLoteProgresso({ done: 0, total: pendentes.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < pendentes.length; i++) {
      const p = pendentes[i];
      try {
        await preProcessarPericia(p.id, {
          onMinimaxProgress: (progress) => {
            setProcessandoDetalhes((s) => ({ ...s, [p.id]: formatMinimaxProgress(progress) }));
          },
        });
        ok++;
      } catch (err: any) {
        console.error("[lote] falha em", p.id, err);
        fail++;
      }
      setProcessandoDetalhes((s) => {
        const { [p.id]: _removed, ...rest } = s;
        return rest;
      });
      setLoteProgresso({ done: i + 1, total: pendentes.length });
    }
    setProcessandoLote(false);
    finish();
    toast({
      title: "Lote concluído",
      description: `${ok} processada(s)${fail ? ` · ${fail} falha(s)` : ""}.`,
      variant: fail ? "destructive" : "default",
    });
    void reload();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!pauta) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-muted-foreground">Pauta não encontrada.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate("/previdenciario")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/previdenciario")}
          className="mb-3 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Pautas
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{pauta.local}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {formatData(pauta.data)}
              </span>
              {(pauta.cidade || pauta.uf) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[pauta.cidade, pauta.uf].filter(Boolean).join(" / ")}
                </span>
              )}
              <Badge variant="outline" className="text-[10px]">
                {pericias.length} perícia{pericias.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {pauta.observacoes && (
              <p className="text-xs text-muted-foreground mt-2 max-w-2xl">{pauta.observacoes}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {pendentes.length > 0 && (
              <Button
                variant="outline"
                onClick={() => void handleProcessarLote()}
                disabled={processandoLote}
              >
                {processandoLote ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                Processar pendentes ({pendentes.length})
                {processandoLote && (
                  <span className="ml-2 text-[11px] font-normal opacity-80 tabular-nums">
                    {loteProgresso.done}/{loteProgresso.total} · {progress}%
                  </span>
                )}
              </Button>
            )}
            <Button onClick={() => setNovaOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova perícia
            </Button>
          </div>
        </div>
      </div>

      {pericias.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">Nenhuma perícia ainda</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Adicione a primeira perícia desta pauta.
          </p>
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova perícia
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {pericias.map((p, idx) => (
            <Card key={p.id} className="p-3 hover:border-primary/40 transition">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => void move(idx, -1)}
                    disabled={idx === 0}
                    className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20"
                    title="Subir"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-mono font-semibold text-foreground py-0.5">
                    {idx + 1}
                  </span>
                  <button
                    onClick={() => void move(idx, 1)}
                    disabled={idx === pericias.length - 1}
                    className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20"
                    title="Descer"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => navigate(`/previdenciario/pericia/${p.id}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {p.periciado_nome || <span className="italic text-muted-foreground">Sem nome</span>}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${PERICIA_STATUS_COLOR[p.status]}`}
                    >
                      {PERICIA_STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    {p.pdf_path ? (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        PDF anexado
                        {p.pdf_processado && (
                          <span className="text-emerald-600 ml-1">• processado</span>
                        )}
                      </span>
                    ) : (
                      <span className="italic">Sem PDF</span>
                    )}
                  </div>
                </button>

                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadPdf(p, f);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Upload className="h-3 w-3" />
                    {p.pdf_path ? "Trocar PDF" : "Anexar PDF"}
                  </span>
                </label>

                {p.pdf_path && (
                  <div className="flex flex-col items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => void handleProcessar(p)}
                      disabled={processandoIds.has(p.id) || processandoLote}
                      title={p.pdf_processado ? "Reprocessar com IA" : "Processar com IA"}
                    >
                      {processandoIds.has(p.id) ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                      )}
                      {p.pdf_processado ? "Reprocessar" : "Processar"}
                    </Button>
                    {processandoIds.has(p.id) && (
                      <span className="text-[10px] text-muted-foreground tabular-nums leading-none mt-0.5">
                        {processandoDetalhes[p.id] || `${progress}%`}
                      </span>
                    )}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => void handleDelete(p.id)}
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovaPericiaDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        pautaId={pauta.id}
        proximaOrdem={proximaOrdem}
        onCreated={reload}
      />
    </div>
  );
}
