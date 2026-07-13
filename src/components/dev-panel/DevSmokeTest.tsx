import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  PlayCircle,
  AlertCircle,
} from "lucide-react";
import { generateLaudoPDF } from "@/utils/generateLaudoPDF";
import { generateLaudoDOCX } from "@/utils/generateLaudoDOCX";
import type { LaudoData } from "@/contexts/LaudoContext";

type StepStatus = "pending" | "running" | "ok" | "fail" | "warn";

interface StepResult {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  duration_ms?: number;
}

interface FieldCheck {
  key: string;
  label: string;
  value: string | number | null | undefined;
  ok: boolean;
  reason?: string;
}

interface RunReport {
  fixture: string;
  jobId?: string;
  laudoId?: string;
  steps: StepResult[];
  fields: FieldCheck[];
  ended_at?: string;
}

const FIXTURES = [
  {
    id: "generico",
    label: "PDF pequeno (genérico)",
    path: "/dev-fixtures/smoke-generico.pdf",
    trabalhista: false,
  },
  {
    id: "trabalhista",
    label: "PDF trabalhista",
    path: "/dev-fixtures/smoke-trabalhista.pdf",
    trabalhista: true,
  },
];

// Campos-chave que devemos ver no import_jobs.result.data
const MIN_LEN = 3;
function checkField(data: any, path: string): FieldCheck {
  const parts = path.split(".");
  let v: any = data;
  for (const p of parts) v = v?.[p];
  const value = typeof v === "string" ? v : v == null ? "" : String(v);
  const ok = typeof value === "string" && value.trim().length >= MIN_LEN;
  return {
    key: path,
    label: path,
    value: value.slice(0, 80),
    ok,
    reason: ok ? undefined : "vazio ou muito curto",
  };
}

function statusIcon(s: StepStatus) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  if (s === "warn") return <AlertCircle className="h-4 w-4 text-amber-600" />;
  return <div className="h-4 w-4 rounded-full border border-muted-foreground/40" />;
}

async function pollJob(jobId: string, timeoutMs = 300_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase.functions.invoke("check-import-status", {
      body: { jobId },
    });
    if (error) throw new Error(error.message);
    if (data?.status === "completed") return data;
    if (data?.status === "failed") throw new Error(data?.error ?? "Job falhou");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Timeout esperando job (5min)");
}

function mapExtractedToLaudoRow(userId: string, extracted: any, isTrabalhista: boolean) {
  return {
    user_id: userId,
    is_smoke_test: true,
    status: "rascunho",
    title: `[SMOKE ${new Date().toISOString()}] ${extracted?.vitima?.nome ?? "sem nome"}`,
    perito_nome: "Perito Smoke Test",
    perito_crm: "CRM 00000-XX",
    processo_numero: extracted?.processo?.numero ?? "",
    processo_vara: extracted?.processo?.vara ?? "",
    reclamante: extracted?.processo?.reclamante ?? "",
    reclamada: extracted?.processo?.reclamada ?? "",
    vitima_nome: extracted?.vitima?.nome ?? "",
    vitima_profissao: extracted?.vitima?.profissao ?? "",
    quesitos_juizo: extracted?.quesitos?.juizo ?? extracted?.quesitos_juizo ?? "",
    quesitos_reclamante:
      extracted?.quesitos?.reclamante ?? extracted?.quesitos_reclamante ?? "",
    quesitos_reclamada:
      extracted?.quesitos?.reclamada ?? extracted?.quesitos_reclamada ?? "",
    conclusao_cid:
      extracted?.informacoes_medicas?.cids_mencionados?.join(", ") ?? "",
    dados_funcionais_cargo: extracted?.posto_trabalho?.cargo_funcao ?? "",
    descricao_atividades_laborais:
      extracted?.posto_trabalho?.ambiente_e_atividades ?? "",
    resumo_peticao_inicial: extracted?.resumos_ia?.resumo_peticao ?? "",
    resumo_contestacao: extracted?.resumos_ia?.resumo_contestacao ?? "",
    metodologia_pericial: "SMOKE TEST — metodologia padrão.",
    ai_metadata: { smoke_test: true, trabalhista: isTrabalhista },
  };
}

export default function DevSmokeTest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState<RunReport[]>([]);
  const [progress, setProgress] = useState(0);
  const [cleaning, setCleaning] = useState(false);

  const setStep = (
    reportIdx: number,
    stepId: string,
    patch: Partial<StepResult>,
  ) => {
    setReports((rs) => {
      const copy = [...rs];
      const r = { ...copy[reportIdx] };
      r.steps = r.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));
      copy[reportIdx] = r;
      return copy;
    });
  };

  const runOne = async (
    fx: typeof FIXTURES[number],
    reportIdx: number,
  ): Promise<void> => {
    if (!user) throw new Error("Sem usuário autenticado");
    const initSteps: StepResult[] = [
      { id: "fetch", label: "Baixar fixture", status: "pending" },
      { id: "upload", label: "Upload storage", status: "pending" },
      { id: "invoke", label: "Invocar processar-autos", status: "pending" },
      { id: "poll", label: "Aguardar OCR + preenchimento", status: "pending" },
      { id: "validate", label: "Validar campos extraídos", status: "pending" },
      { id: "laudo", label: "Criar laudo (smoke)", status: "pending" },
      { id: "pdf", label: "Gerar PDF em memória", status: "pending" },
      { id: "docx", label: "Gerar DOCX em memória", status: "pending" },
    ];
    setReports((rs) => {
      const copy = [...rs];
      copy[reportIdx] = {
        fixture: fx.label,
        steps: initSteps,
        fields: [],
      };
      return copy;
    });

    // 1. Fetch fixture
    setStep(reportIdx, "fetch", { status: "running" });
    let t = Date.now();
    const resp = await fetch(fx.path);
    if (!resp.ok) {
      setStep(reportIdx, "fetch", {
        status: "fail",
        detail: `HTTP ${resp.status}`,
        duration_ms: Date.now() - t,
      });
      throw new Error(`Fixture não encontrada: ${fx.path}`);
    }
    const blob = await resp.blob();
    setStep(reportIdx, "fetch", {
      status: "ok",
      detail: `${(blob.size / 1024).toFixed(1)} KB`,
      duration_ms: Date.now() - t,
    });

    // 2. Upload storage
    setStep(reportIdx, "upload", { status: "running" });
    t = Date.now();
    const filePath = `${user.id}/${Date.now()}-smoke-${fx.id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("processos-pdf")
      .upload(filePath, blob, { contentType: "application/pdf" });
    if (upErr) {
      setStep(reportIdx, "upload", {
        status: "fail",
        detail: upErr.message,
        duration_ms: Date.now() - t,
      });
      throw upErr;
    }
    setStep(reportIdx, "upload", { status: "ok", duration_ms: Date.now() - t });

    // 3. Invoke processar-autos
    setStep(reportIdx, "invoke", { status: "running" });
    t = Date.now();
    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
      "processar-autos",
      { body: { fileName: `smoke-${fx.id}.pdf`, filePath } },
    );
    if (invokeErr) {
      setStep(reportIdx, "invoke", {
        status: "fail",
        detail: invokeErr.message,
        duration_ms: Date.now() - t,
      });
      throw invokeErr;
    }
    const jobId = invokeData?.jobId as string;
    setReports((rs) => {
      const copy = [...rs];
      copy[reportIdx] = { ...copy[reportIdx], jobId };
      return copy;
    });
    setStep(reportIdx, "invoke", {
      status: "ok",
      detail: `job ${jobId.slice(0, 8)}`,
      duration_ms: Date.now() - t,
    });

    // 4. Poll
    setStep(reportIdx, "poll", { status: "running" });
    t = Date.now();
    let jobResult: any;
    try {
      jobResult = await pollJob(jobId);
    } catch (err: any) {
      setStep(reportIdx, "poll", {
        status: "fail",
        detail: err.message,
        duration_ms: Date.now() - t,
      });
      throw err;
    }
    setStep(reportIdx, "poll", {
      status: "ok",
      detail: `${((Date.now() - t) / 1000).toFixed(1)}s`,
      duration_ms: Date.now() - t,
    });

    const extracted = jobResult?.result?.data ?? {};

    // 5. Validate fields
    setStep(reportIdx, "validate", { status: "running" });
    const baseChecks = [
      "processo.numero",
      "vitima.nome",
      "quesitos.juizo",
    ];
    const trabChecks = fx.trabalhista
      ? ["posto_trabalho.cargo_funcao", "resumos_ia.nexo_causal"]
      : [];
    const fields = [...baseChecks, ...trabChecks].map((p) => checkField(extracted, p));
    const failedFields = fields.filter((f) => !f.ok);
    setReports((rs) => {
      const copy = [...rs];
      copy[reportIdx] = { ...copy[reportIdx], fields };
      return copy;
    });
    setStep(reportIdx, "validate", {
      status: failedFields.length === 0 ? "ok" : "warn",
      detail:
        failedFields.length === 0
          ? `${fields.length}/${fields.length} campos OK`
          : `${failedFields.length} campo(s) vazio(s) — OCR pobre no PDF sintético`,
    });

    // 6. Create laudo record
    setStep(reportIdx, "laudo", { status: "running" });
    t = Date.now();
    const laudoRow = mapExtractedToLaudoRow(user.id, extracted, fx.trabalhista);
    const { data: newLaudo, error: laudoErr } = await supabase
      .from("laudos")
      .insert(laudoRow)
      .select()
      .single();
    if (laudoErr) {
      setStep(reportIdx, "laudo", {
        status: "fail",
        detail: laudoErr.message,
        duration_ms: Date.now() - t,
      });
      throw laudoErr;
    }
    setReports((rs) => {
      const copy = [...rs];
      copy[reportIdx] = { ...copy[reportIdx], laudoId: newLaudo.id };
      return copy;
    });
    setStep(reportIdx, "laudo", {
      status: "ok",
      detail: newLaudo.id.slice(0, 8),
      duration_ms: Date.now() - t,
    });

    // 7. Generate PDF blob
    setStep(reportIdx, "pdf", { status: "running" });
    t = Date.now();
    try {
      const laudoData = { ...(newLaudo as any) } as LaudoData;
      const pdfBlob = (await generateLaudoPDF(laudoData, { returnBlob: true })) as Blob;
      const size = pdfBlob?.size ?? 0;
      const ok = size > 10_000;
      setStep(reportIdx, "pdf", {
        status: ok ? "ok" : "fail",
        detail: `${(size / 1024).toFixed(1)} KB${ok ? "" : " — muito pequeno"}`,
        duration_ms: Date.now() - t,
      });
    } catch (err: any) {
      setStep(reportIdx, "pdf", {
        status: "fail",
        detail: err.message,
        duration_ms: Date.now() - t,
      });
    }

    // 8. Generate DOCX blob
    setStep(reportIdx, "docx", { status: "running" });
    t = Date.now();
    try {
      const laudoData = { ...(newLaudo as any) } as LaudoData;
      const docxBlob = (await generateLaudoDOCX(laudoData, { returnBlob: true })) as Blob;
      const size = docxBlob?.size ?? 0;
      const ok = size > 10_000;
      setStep(reportIdx, "docx", {
        status: ok ? "ok" : "fail",
        detail: `${(size / 1024).toFixed(1)} KB${ok ? "" : " — muito pequeno"}`,
        duration_ms: Date.now() - t,
      });
    } catch (err: any) {
      setStep(reportIdx, "docx", {
        status: "fail",
        detail: err.message,
        duration_ms: Date.now() - t,
      });
    }
  };

  const runAll = async () => {
    setRunning(true);
    setReports(FIXTURES.map(() => ({ fixture: "", steps: [], fields: [] })));
    setProgress(0);
    try {
      for (let i = 0; i < FIXTURES.length; i++) {
        try {
          await runOne(FIXTURES[i], i);
        } catch (err: any) {
          toast({
            variant: "destructive",
            title: `Smoke test [${FIXTURES[i].label}] falhou`,
            description: err.message ?? String(err),
          });
        }
        setProgress(((i + 1) / FIXTURES.length) * 100);
      }
      toast({ title: "Smoke test concluído" });
    } finally {
      setRunning(false);
    }
  };

  const cleanup = async () => {
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "dev-cleanup-smoke-tests",
        { body: {} },
      );
      if (error) throw error;
      toast({
        title: "Smoke tests limpos",
        description: `${(data as any)?.deleted ?? 0} laudos deletados.`,
      });
      setReports([]);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao limpar",
        description: err.message ?? String(err),
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Smoke Test — upload → OCR → preenchimento → export</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Executa o fluxo real em 2 fixtures pequenas (<code>public/dev-fixtures/</code>):
            PDF genérico + PDF trabalhista. Cria laudos marcados como
            <Badge variant="outline" className="mx-1">is_smoke_test</Badge>
            e gera PDF/DOCX em memória para validar o pipeline ponta-a-ponta.
            Nada é salvo como laudo definitivo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button onClick={runAll} disabled={running || cleaning}>
              {running ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rodando...</>
              ) : (
                <><PlayCircle className="h-4 w-4 mr-2" /> Rodar smoke test</>
              )}
            </Button>
            <Button variant="outline" onClick={cleanup} disabled={running || cleaning}>
              {cleaning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Limpar smoke tests
            </Button>
          </div>

          {running && <Progress value={progress} />}

          {reports.length > 0 && reports.some((r) => r.steps.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {reports.map((r, idx) => {
                if (r.steps.length === 0) return null;
                return (
                  <Card key={idx} className="border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>{r.fixture}</span>
                        {r.jobId && (
                          <span className="text-xs font-mono text-muted-foreground">
                            job {r.jobId.slice(0, 8)}
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-1 text-sm">
                        {r.steps.map((s) => (
                          <li key={s.id} className="flex items-center gap-2">
                            {statusIcon(s.status)}
                            <span className="font-medium w-52 truncate">{s.label}</span>
                            <span className="text-xs text-muted-foreground truncate flex-1">
                              {s.detail ?? ""}
                            </span>
                            {typeof s.duration_ms === "number" && (
                              <span className="text-xs text-muted-foreground">
                                {s.duration_ms < 1000
                                  ? `${s.duration_ms}ms`
                                  : `${(s.duration_ms / 1000).toFixed(1)}s`}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {r.fields.length > 0 && (
                        <div className="border-t border-border pt-2">
                          <div className="text-xs text-muted-foreground mb-1">
                            Campos extraídos:
                          </div>
                          <ul className="space-y-0.5 text-xs font-mono">
                            {r.fields.map((f) => (
                              <li key={f.key} className="flex items-center gap-2">
                                {f.ok ? (
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-destructive" />
                                )}
                                <span className="w-40 truncate">{f.key}</span>
                                <span className="flex-1 truncate text-muted-foreground">
                                  {f.value || `— (${f.reason})`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
