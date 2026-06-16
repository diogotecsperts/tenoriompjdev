import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Construction,
  FileDown,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getPericia, updatePericia, setPericiaStatus, getPauta } from "../api/pautas";
import { PERICIA_STATUS_COLOR, PERICIA_STATUS_LABEL } from "../types";
import type { PrevPericia, PrevPauta } from "../types";
import { downloadPrelaudoPdf } from "../lib/export/prelaudo-pdf";
import {
  PRELAUDO_STEPS,
  EMPTY_PRELAUDO,
  mergeFromExtracao,
  type PrelaudoData,
  type StepId,
} from "../lib/prelaudo-structure";
import { StepNav } from "../components/StepNav";
import { PainelLateralProcesso } from "../components/PainelLateralProcesso";
import { Step01Identificacao } from "../components/steps/Step01Identificacao";
import { Step02Queixa } from "../components/steps/Step02Queixa";
import { Step03Medicacao } from "../components/steps/Step03Medicacao";
import { Step04Acompanhamento } from "../components/steps/Step04Acompanhamento";
import { Step05Comorbidades } from "../components/steps/Step05Comorbidades";
import { Step06EstadoMental } from "../components/steps/Step06EstadoMental";
import { Step07Ectoscopia } from "../components/steps/Step07Ectoscopia";
import { Step08Ortopedico } from "../components/steps/Step08Ortopedico";
import { Step09Cid } from "../components/steps/Step09Cid";
import { Step10Conclusao } from "../components/steps/Step10Conclusao";

const AUTOSAVE_MS = 900;

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
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstSaveRef = useRef(true);

  // Load
  useEffect(() => {
    if (!periciaId) return;
    (async () => {
      setLoading(true);
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
      // Ao iniciar edição, marca como em_atendimento
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
    try {
      await setPericiaStatus(pericia.id, "concluido");
      setPericia({ ...pericia, status: "concluido" });
      toast({ title: "Perícia concluída" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  };

  const handleExportPdf = async () => {
    if (!pericia) return;
    try {
      await persist();
      const localStr = pauta
        ? [pauta.local, pauta.cidade, pauta.uf].filter(Boolean).join(" — ")
        : "";
      downloadPrelaudoPdf(data, {
        periciado: pericia.periciado_nome || data.identificacao?.nome || "",
        dataPericia: pauta?.data || new Date().toISOString().slice(0, 10),
        local: localStr,
        numeroProcesso: data.identificacao?.numero_processo || "",
      });
      toast({ title: "PDF gerado" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao exportar", description: err.message });
    }
  };

  // Steps completos = qualquer chave preenchida
  const completed = useMemo(() => {
    const s = new Set<StepId>();
    if (Object.values(data.identificacao || {}).some(Boolean)) s.add("identificacao");
    if (Object.values(data.queixa || {}).some(Boolean)) s.add("queixa");
    if ((data.medicacao?.itens?.length ?? 0) > 0 || data.medicacao?.observacoes) s.add("medicacao");
    if (Object.values(data.acompanhamento || {}).some(Boolean)) s.add("acompanhamento");
    if (
      (data.comorbidades?.lista?.length ?? 0) > 0 ||
      data.comorbidades?.texto ||
      data.comorbidades?.cirurgias_previas ||
      data.comorbidades?.internacoes ||
      data.comorbidades?.historico_familiar
    )
      s.add("comorbidades");
    if (Object.values(data.estado_mental || {}).some(Boolean)) s.add("estado_mental");
    if (Object.values(data.ectoscopia || {}).some(Boolean)) s.add("ectoscopia");
    if (Object.values(data.exame_ortopedico || {}).some(Boolean)) s.add("exame_ortopedico");
    if ((data.cid?.itens?.length ?? 0) > 0 || data.cid?.observacoes) s.add("cid");
    if (Object.values(data.conclusao || {}).some(Boolean)) s.add("conclusao");
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
            {pericia.periciado_nome || <span className="italic text-muted-foreground">Sem nome</span>}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-[10px] ${PERICIA_STATUS_COLOR[pericia.status]}`}>
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

        <Button variant="outline" size="sm" onClick={handleExportPdf}>
          <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={handleConcluir}
          disabled={pericia.status === "concluido"}
        >
          {pericia.status === "concluido" ? "Concluída" : "Concluir perícia"}
        </Button>
      </div>

      {/* Body: nav | editor | painel */}
      <div className="flex-1 flex overflow-hidden">
        <StepNav current={currentStep} completed={completed} onSelect={setCurrentStep} />

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-3xl mx-auto">
            {renderStep(currentStep, data, setData)}

            {/* Footer nav */}
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
              <Button size="sm" onClick={goNext} disabled={currentIdx >= PRELAUDO_STEPS.length - 1}>
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
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
    case "medicacao":
      return (
        <Step03Medicacao
          value={data.medicacao}
          onChange={(patch) =>
            setData((d) => ({ ...d, medicacao: { ...d.medicacao, ...patch } }))
          }
        />
      );
    case "acompanhamento":
      return (
        <Step04Acompanhamento
          value={data.acompanhamento}
          onChange={(patch) =>
            setData((d) => ({ ...d, acompanhamento: { ...d.acompanhamento, ...patch } }))
          }
        />
      );
    case "comorbidades":
      return (
        <Step05Comorbidades
          value={data.comorbidades}
          onChange={(patch) =>
            setData((d) => ({ ...d, comorbidades: { ...d.comorbidades, ...patch } }))
          }
        />
      );
    case "estado_mental":
      return (
        <Step06EstadoMental
          value={data.estado_mental}
          onChange={(patch) =>
            setData((d) => ({ ...d, estado_mental: { ...d.estado_mental, ...patch } }))
          }
        />
      );
    case "ectoscopia":
      return (
        <Step07Ectoscopia
          value={data.ectoscopia}
          onChange={(patch) =>
            setData((d) => ({ ...d, ectoscopia: { ...d.ectoscopia, ...patch } }))
          }
        />
      );
    case "exame_ortopedico":
      return (
        <Step08Ortopedico
          value={data.exame_ortopedico}
          onChange={(patch) =>
            setData((d) => ({ ...d, exame_ortopedico: { ...d.exame_ortopedico, ...patch } }))
          }
        />
      );
    case "cid":
      return (
        <Step09Cid
          value={data.cid}
          onChange={(patch) => setData((d) => ({ ...d, cid: { ...d.cid, ...patch } }))}
        />
      );
    case "conclusao":
      return (
        <Step10Conclusao
          value={data.conclusao}
          onChange={(patch) =>
            setData((d) => ({ ...d, conclusao: { ...d.conclusao, ...patch } }))
          }
        />
      );
    default:
      return (
        <Card className="p-8 text-center border-dashed">
          <Construction className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Etapa em construção (Fase E).</p>
        </Card>
      );
  }
}
