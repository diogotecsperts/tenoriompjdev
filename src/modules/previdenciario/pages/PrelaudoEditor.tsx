import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileDown,
  ArrowLeftRight,
  Scroll,
  LayoutGrid,
  RotateCcw,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { useScrollSpy } from "@/hooks/useScrollSpy";

import { getPericia, updatePericia, setPericiaStatus, getPauta } from "../api/pautas";
import { PERICIA_STATUS_COLOR, PERICIA_STATUS_LABEL } from "../types";
import type { PrevPericia, PrevPauta } from "../types";
import { downloadPrelaudoPdf } from "../lib/export/prelaudo-pdf";
import { downloadPrelaudoDocx } from "../lib/export/prelaudo-docx";
import {
  PRELAUDO_STEPS,
  EMPTY_PRELAUDO,
  ALL_STEP_IDS,
  COMORBIDADES_FIXAS_KEYS,
  mergeFromExtracao,
  type PrelaudoData,
  type StepId,
} from "../lib/prelaudo-structure";
import { StepNav } from "../components/StepNav";
import { ExportStepsSelector } from "../components/ExportStepsSelector";
import { ExportChromeSelector, type ExportChromeValue } from "../components/ExportChromeSelector";
import { PainelLateralProcesso } from "../components/PainelLateralProcesso";
import { ProcessoHeader } from "../components/ProcessoHeader";
import { Step01Identificacao } from "../components/steps/Step01Identificacao";
import { Step02Queixa } from "../components/steps/Step02Queixa";
import { Step03ExameFisico } from "../components/steps/Step03ExameFisico";
import { Step04Resumo } from "../components/steps/Step04Resumo";

const AUTOSAVE_MS = 900;
const VIEW_MODE_STORAGE_KEY = "prev-prelaudo-view-mode";
const EXPORT_STEPS_STORAGE_KEY = "prev:prelaudo:export-steps";
const EXPORT_CHROME_STORAGE_KEY = "prev:prelaudo:export-chrome";
type ViewMode = "paginated" | "infinite";

export default function PrelaudoEditor() {
  const { periciaId } = useParams<{ periciaId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pericia, setPericia] = useState<PrevPericia | null>(null);
  const [pauta, setPauta] = useState<PrevPauta | null>(null);
  const [data, setData] = useState<PrelaudoData>(EMPTY_PRELAUDO);
  const [currentStep, setCurrentStep] = useState<StepId>("identificacao");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [exporting, setExporting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "paginated";
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return (stored as ViewMode) || "paginated";
  });
  const [exportSteps, setExportSteps] = useState<StepId[]>(() => {
    if (typeof window === "undefined") return [...ALL_STEP_IDS];
    try {
      const raw = window.localStorage.getItem(EXPORT_STEPS_STORAGE_KEY);
      if (!raw) return [...ALL_STEP_IDS];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...ALL_STEP_IDS];
      const valid = new Set(ALL_STEP_IDS);
      const filtered = parsed.filter(
        (s): s is StepId => typeof s === "string" && valid.has(s as StepId),
      );
      return ALL_STEP_IDS.filter((s) => filtered.includes(s));
    } catch {
      return [...ALL_STEP_IDS];
    }
  });
  const [exportChrome, setExportChrome] = useState<ExportChromeValue>(() => {
    if (typeof window === "undefined") return { header: true, footer: true };
    try {
      const raw = window.localStorage.getItem(EXPORT_CHROME_STORAGE_KEY);
      if (!raw) return { header: true, footer: true };
      const parsed = JSON.parse(raw);
      return {
        header: parsed?.header !== false,
        footer: parsed?.footer !== false,
      };
    } catch {
      return { header: true, footer: true };
    }
  });
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstSaveRef = useRef(true);
  const mainContentRef = useRef<HTMLDivElement | null>(null);

  const sectionIds = useMemo(
    () => PRELAUDO_STEPS.filter((s) => s.implemented).map((s) => `step-${s.id}`),
    [],
  );

  const { activeId: scrollSpyActiveId, scrollToSection } = useScrollSpy({
    sectionIds,
    offset: 120,
    enabled: viewMode === "infinite",
    scrollContainerRef: mainContentRef,
  });

  useEffect(() => {
    if (viewMode !== "infinite" || !scrollSpyActiveId) return;
    const id = scrollSpyActiveId.replace("step-", "") as StepId;
    setCurrentStep((prev) => (prev !== id ? id : prev));
  }, [scrollSpyActiveId, viewMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXPORT_STEPS_STORAGE_KEY, JSON.stringify(exportSteps));
    }
  }, [exportSteps]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXPORT_CHROME_STORAGE_KEY, JSON.stringify(exportChrome));
    }
  }, [exportChrome]);

  // Load
  useEffect(() => {
    if (!periciaId) return;
    (async () => {
      setLoading(true);
      dirtyRef.current = false;
      skipFirstSaveRef.current = true;
      try {
        const p = await getPericia(periciaId);
        if (!p) {
          toast({ variant: "destructive", title: "Perícia não encontrada" });
          return;
        }
        setPericia(p);
        const initial = mergeFromExtracao(
          (p.prelaudo_data as PrelaudoData) ?? EMPTY_PRELAUDO,
          p.prev_extracao as Record<string, any>,
        );
        setData(initial);
        const previousData = (p.prelaudo_data as PrelaudoData) ?? EMPTY_PRELAUDO;
        if (
          !previousData?.identificacao?.escolaridade &&
          initial?.identificacao?.escolaridade
        ) {
          skipFirstSaveRef.current = false;
          dirtyRef.current = true;
        }
        getPauta(p.pauta_id).then(setPauta).catch(() => {});
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro", description: err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [periciaId]);

  // Debounced autosave
  useEffect(() => {
    if (!pericia) return;
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const persist = async () => {
    if (!pericia || !dirtyRef.current) return;
    setSaving(true);
    try {
      const patch: Parameters<typeof updatePericia>[1] = {
        prelaudo_data: data as unknown as Record<string, any>,
      };
      if (pericia.status === "aguardando") {
        patch.status = "em_atendimento" as any;
      }
      await updatePericia(pericia.id, patch);
      dirtyRef.current = false;
      setSavedAt(new Date());
      if (patch.status) {
        setPericia({ ...pericia, status: "em_atendimento" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleConcluir = async () => {
    if (!pericia) return;
    await persist();
    setStatusUpdating(true);
    try {
      await setPericiaStatus(pericia.id, "concluido");
      setPericia((prev) => (prev ? { ...prev, status: "concluido" } : prev));
      toast({ title: "Perícia concluída" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleReabrir = async () => {
    if (!pericia) return;
    await persist();
    setStatusUpdating(true);
    try {
      await setPericiaStatus(pericia.id, "em_atendimento");
      setPericia((prev) => (prev ? { ...prev, status: "em_atendimento" } : prev));
      toast({ title: "Perícia reaberta" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleExport = async () => {
    if (!pericia) return;
    if (exportSteps.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma etapa selecionada",
        description: "Marque ao menos uma etapa para exportar.",
      });
      return;
    }
    setExporting(true);
    try {
      await persist();
      const localStr = pauta
        ? [pauta.local, pauta.cidade, pauta.uf].filter(Boolean).join(" — ")
        : "";
      const meta = {
        periciado: pericia.periciado_nome || data.identificacao?.nome || "",
        dataPericia:
          data.identificacao?.data_pericia ||
          pauta?.data ||
          new Date().toISOString().slice(0, 10),
        local: localStr,
        numeroProcesso: data.identificacao?.numero_processo || "",
      };
      if (exportFormat === "pdf") {
        await downloadPrelaudoPdf(data, meta, exportSteps);
        toast({ title: "PDF gerado" });
      } else {
        await downloadPrelaudoDocx(data, meta, exportSteps);
        toast({ title: "DOCX gerado" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao exportar", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  // Cálculo de completude
  const completed = useMemo(() => {
    const s = new Set<StepId>();
    if (Object.values(data.identificacao || {}).some(Boolean)) s.add("identificacao");
    const q = data.queixa || {};
    const anyFixa = COMORBIDADES_FIXAS_KEYS.some((k) => !!q.comorbidades_fixas?.[k]);
    const anyExtra = (q.comorbidades_extras ?? []).some((e) => e.marcado && e.texto.trim());
    if (q.queixa_principal || q.medicacoes_uso || anyFixa || anyExtra) s.add("queixa");
    const ex = data.exame_fisico || {};
    if (ex.incap_funcao_habitual || ex.incap_vida_independente) s.add("exame_fisico");
    if (data.resumo?.texto) s.add("resumo");
    return s;
  }, [data]);

  const currentDef = PRELAUDO_STEPS.find((s) => s.id === currentStep)!;
  const currentIdx = PRELAUDO_STEPS.findIndex((s) => s.id === currentStep);
  const goPrev = () => {
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (PRELAUDO_STEPS[i].implemented) {
        setCurrentStep(PRELAUDO_STEPS[i].id);
        return;
      }
    }
  };
  const goNext = () => {
    for (let i = currentIdx + 1; i < PRELAUDO_STEPS.length; i++) {
      if (PRELAUDO_STEPS[i].implemented) {
        setCurrentStep(PRELAUDO_STEPS[i].id);
        return;
      }
    }
  };

  const handleStepSelect = (id: StepId) => {
    if (viewMode === "infinite") {
      setCurrentStep(id);
      scrollToSection(`step-${id}`);
    } else {
      setCurrentStep(id);
    }
  };

  const handleViewModeToggle = () => {
    setViewMode((prev) => (prev === "paginated" ? "infinite" : "paginated"));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!pericia) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-muted-foreground">Perícia não encontrada.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate("/previdenciario")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </div>
    );
  }

  const aiSuggested = !!pericia.prev_extracao && Object.keys(pericia.prev_extracao).length > 0;

  const updateIdentificacao = (patch: Partial<PrelaudoData["identificacao"]>) =>
    setData((d) => ({ ...d, identificacao: { ...d.identificacao, ...patch } }));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/previdenciario/pauta/${pericia.pauta_id}`)}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Pauta
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-foreground truncate">
            {pericia.periciado_nome || (
              <span className="italic text-muted-foreground">Sem nome</span>
            )}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant="outline"
              className={`text-[10px] ${PERICIA_STATUS_COLOR[pericia.status]}`}
            >
              {PERICIA_STATUS_LABEL[pericia.status]}
            </Badge>
            {aiSuggested && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Sugestões da IA carregadas
              </span>
            )}
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
            </>
          ) : savedAt ? (
            <>
              <Check className="h-3 w-3 text-emerald-600" /> Salvo {savedAt.toLocaleTimeString()}
            </>
          ) : (
            <span>—</span>
          )}
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleViewModeToggle}
                className="h-9 w-9"
              >
                {viewMode === "paginated" ? (
                  <Scroll className="h-4 w-4" />
                ) : (
                  <LayoutGrid className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{viewMode === "paginated" ? "Modo scroll infinito" : "Modo paginado"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ExportStepsSelector value={exportSteps} onChange={setExportSteps} disabled={exporting} />

        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-r-none border-r-0"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-1.5" />
            )}
            <span className="hidden sm:inline">Baixar em {exportFormat.toUpperCase()}</span>
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportFormat((prev) => (prev === "pdf" ? "docx" : "pdf"))}
                  className="rounded-l-none px-2"
                  disabled={exporting}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Alternar para {exportFormat === "pdf" ? "DOCX" : "PDF"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {pericia.status === "concluido" ? (
          <Button variant="outline" size="sm" onClick={handleReabrir} disabled={statusUpdating}>
            {statusUpdating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-1.5" />
            )}
            Reabrir perícia
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={handleConcluir} disabled={statusUpdating}>
            {statusUpdating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Concluir perícia
          </Button>
        )}
      </div>

      {/* Body: nav | editor | painel */}
      <div className="flex-1 flex overflow-hidden">
        <StepNav current={currentStep} completed={completed} onSelect={handleStepSelect} />

        <div ref={mainContentRef} className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-3">
              <h2 className="text-sm font-bold tracking-wider text-primary">
                PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO
              </h2>
            </div>
            <ProcessoHeader value={data.identificacao} onChange={updateIdentificacao} />

            {viewMode === "paginated" ? (
              <>
                {renderStep(currentStep, data, setData)}

                <div className="mt-8 pt-4 border-t border-border flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goPrev}
                    disabled={currentIdx === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Etapa {currentDef.ordem} de {PRELAUDO_STEPS.length}
                  </span>
                  <Button
                    size="sm"
                    onClick={goNext}
                    disabled={currentIdx >= PRELAUDO_STEPS.length - 1}
                  >
                    Próxima <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-10 pb-12">
                {PRELAUDO_STEPS.filter((s) => s.implemented).map((s) => (
                  <section key={s.id} id={`step-${s.id}`} className="scroll-mt-24 space-y-3">
                    <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                      {s.ordem}. {s.label}
                    </h2>
                    {renderStep(s.id, data, setData)}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>

        <PainelLateralProcesso
          extracao={pericia.prev_extracao as Record<string, any>}
          hasPdf={!!pericia.pdf_path}
        />
      </div>
    </div>
  );
}

function renderStep(
  id: StepId,
  data: PrelaudoData,
  setData: React.Dispatch<React.SetStateAction<PrelaudoData>>,
) {
  switch (id) {
    case "identificacao":
      return (
        <Step01Identificacao
          value={data.identificacao}
          onChange={(patch) =>
            setData((d) => ({ ...d, identificacao: { ...d.identificacao, ...patch } }))
          }
        />
      );
    case "queixa":
      return (
        <Step02Queixa
          value={data.queixa}
          onChange={(patch) => setData((d) => ({ ...d, queixa: { ...d.queixa, ...patch } }))}
        />
      );
    case "exame_fisico":
      return (
        <Step03ExameFisico
          value={data.exame_fisico}
          onChange={(patch) =>
            setData((d) => ({ ...d, exame_fisico: { ...d.exame_fisico, ...patch } }))
          }
        />
      );
    case "resumo":
      return (
        <Step04Resumo
          value={data.resumo}
          onChange={(patch) => setData((d) => ({ ...d, resumo: { ...d.resumo, ...patch } }))}
        />
      );
    default:
      return null;
  }
}
