import { supabase } from "@/integrations/supabase/client";
import { runMinimaxClientOcr, type MinimaxOcrProgress } from "@/lib/minimax-ocr-client";

export interface PreProcessarResult {
  ok: true;
  periciaId: string;
  pages: number;
  documentosCriados: number;
  provider: string;
  model: string;
  durationMs: number;
}

interface AsyncPreProcessarStart {
  ok: true;
  async: true;
  jobId: string;
  periciaId: string;
  status: string;
  stage: string;
  progress: number;
  provider?: string;
  model?: string;
}

interface PrevProcessingStatus {
  ok: true;
  jobId: string;
  periciaId: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage: string;
  progress: number;
  provider?: string | null;
  model?: string | null;
  errorCode?: PreProcessarErrorCode;
  errorMessage?: string;
  technicalDetail?: string;
  result?: Partial<PreProcessarResult> & Record<string, unknown>;
  updatedAt?: string;
}

export type PreProcessarErrorCode =
  | "quota_exceeded"
  | "invalid_key"
  | "session_expired"
  | "rate_limited"
  | "provider_timeout"
  | "invalid_request"
  | "response_truncated"
  | "file_too_large"
  | "unsupported_file"
  | "provider_unavailable"
  | "canceled"
  | "unknown";

export class PreProcessarError extends Error {
  code: PreProcessarErrorCode;
  stage?: string;
  provider?: string;
  model?: string;
  upstreamStatus?: number | null;
  technicalDetail?: string;
  jobId?: string;
  constructor(
    message: string,
    code: PreProcessarErrorCode = "unknown",
    stage?: string,
    upstreamStatus?: number | null,
    provider?: string,
    model?: string,
    technicalDetail?: string,
    jobId?: string,
  ) {
    super(message);
    this.name = "PreProcessarError";
    this.code = code;
    this.stage = stage;
    this.upstreamStatus = upstreamStatus;
    this.provider = provider;
    this.model = model;
    this.technicalDetail = technicalDetail;
    this.jobId = jobId;
  }
}

type ClientRasterizeSignal = Record<string, unknown> & {
  needsClientRasterize: true;
  pdfPath?: string;
  bucket?: string;
  mode?: string;
  chunkEndpoint?: "minimax-ocr-chunk" | "gemini-ocr-chunk";
  provider?: string;
  model?: string;
};

function isAsyncStart(value: unknown): value is AsyncPreProcessarStart {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).async === true && typeof (value as Record<string, unknown>).jobId === "string";
}

function isClientRasterizeSignal(value: unknown): value is ClientRasterizeSignal {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).needsClientRasterize === true;
}

/**
 * Tenta extrair o corpo JSON da resposta de erro vinda do
 * supabase-js (FunctionsHttpError carrega a Response em `context`).
 */
async function readErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  try {
    const ctx = (error as { context?: Response | { json?: () => Promise<unknown> } })?.context;
    if (!ctx) return null;
    const status = typeof (ctx as Response).status === "number" ? (ctx as Response).status : undefined;
    if (typeof (ctx as Response).clone === "function") {
      const r = (ctx as Response).clone();
      const text = await r.text();
      if (!text) return status ? { upstreamStatus: status } : null;
      try {
        return { ...(JSON.parse(text) as Record<string, unknown>), upstreamStatus: status };
      } catch {
        return { error: text, upstreamStatus: status };
      }
    }
    if (typeof (ctx as { json?: () => Promise<unknown> }).json === "function") {
      return (await (ctx as { json: () => Promise<unknown> }).json()) as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function classifyInvokeError(error: unknown, body: Record<string, unknown> | null): PreProcessarError {
  const status = typeof body?.upstreamStatus === "number" ? body.upstreamStatus : null;
  const rawMessage =
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    (error as { message?: string })?.message ||
    "Falha no pré-processamento.";
  const lower = rawMessage.toLowerCase();

  let code = (body?.code as PreProcessarErrorCode) || "unknown";
  const rawErrorField = typeof body?.error === "string" ? body.error : "";
  const isAuthFailureBody =
    rawErrorField === "Sessão inválida" ||
    rawErrorField === "Não autenticado" ||
    /sess[aã]o inv[aá]lida|n[aã]o autenticad|jwt|invalid token/i.test(rawErrorField);
  if (code === "unknown") {
    if (status === 401 && isAuthFailureBody) code = "session_expired";
    else if (status === 504 || /timeout|timed out|edge function returned a non-2xx/i.test(lower)) code = "provider_timeout";
    else if (status === 402 || /quota|saldo|credit|billing|insufficient/i.test(lower)) code = "quota_exceeded";
    else if (status === 429 || /rate limit|too many/i.test(lower)) code = "rate_limited";
    else if (status === 401 || status === 403 || /unauthorized|forbidden|api key|credencial/i.test(lower)) code = "invalid_key";
    else if (status === 400 || /invalid|unsupported|bad request/i.test(lower)) code = "invalid_request";
    else if (status && status >= 500) code = "provider_unavailable";
  }

  const isGemini400 =
    code === "invalid_request" &&
    (/gemini|generation[_ ]?config|response[_ ]?mime|files api/i.test(rawMessage) || /gemini/i.test(String(body?.provider ?? "")));

  const fallbackMessage =
    code === "session_expired"
      ? "Sua sessão expirou. Saia e entre novamente para continuar."
      : code === "provider_timeout"
        ? "Tempo excedido no processamento da IA. O backend encerrou a chamada antes de receber uma resposta completa do provider."
        : isGemini400
          ? "O Gemini recusou a requisição (400). O modelo/parâmetro configurado no DevPanel pode não ser compatível. Verifique o modelo de OCR."
          : rawMessage;

  return new PreProcessarError(
    code === "session_expired" || isGemini400 || rawMessage.includes("Edge Function returned") ? fallbackMessage : rawMessage,
    code,
    typeof body?.stage === "string" ? body.stage : undefined,
    status,
    typeof body?.provider === "string" ? body.provider : undefined,
    typeof body?.model === "string" ? body.model : undefined,
    typeof body?.technicalDetail === "string" ? body.technicalDetail : undefined,
  );
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Na fila",
  download: "Baixando PDF",
  ocr_processing: "OCR Gemini em execução",
  ocr_completed: "OCR concluído",
  ai_extraction: "Extraindo dados",
  ai_refinement: "Refinando campos",
  saving: "Salvando resultado",
  completed: "Concluído",
  failed: "Falhou",
};

async function checkStatus(jobId: string): Promise<PrevProcessingStatus> {
  const { data, error } = await supabase.functions.invoke("check-prev-processing-status", {
    body: { jobId },
  });
  if (error) {
    const body = await readErrorBody(error);
    throw classifyInvokeError(error, body);
  }
  const d = data as PrevProcessingStatus | Record<string, unknown> | null;
  if (!d?.ok) {
    throw new PreProcessarError(String((d as any)?.error || "Falha ao consultar status."));
  }
  return d as PrevProcessingStatus;
}

async function pollPreProcessarJob(
  start: AsyncPreProcessarStart,
  onProgress?: (message: string) => void,
): Promise<PreProcessarResult> {
  const startedAt = Date.now();
  const maxWaitMs = 8 * 60_000;
  let delayMs = 2500;
  let lastUpdatedAt: string | undefined;
  let stagnantSince: number | null = null;
  // Se o `updated_at` do servidor não muda por mais de 130s, provavelmente
  // o worker morreu (o watchdog server-side finaliza em 120s). Não vale a pena
  // ficar em polling até o timeout global.
  const STAGNATION_LIMIT_MS = 130_000;

  while (Date.now() - startedAt < maxWaitMs) {
    const status = await checkStatus(start.jobId);
    const label = STAGE_LABELS[status.stage] || status.stage || status.status;
    onProgress?.(`${label}${typeof status.progress === "number" ? ` · ${status.progress}%` : ""}`);

    if (status.status === "completed") {
      const result = status.result || {};
      return {
        ok: true,
        periciaId: status.periciaId,
        pages: Number(result.pages || 0),
        documentosCriados: Number(result.documentosCriados || 0),
        provider: String(result.provider || status.provider || start.provider || "backend"),
        model: String(result.model || status.model || start.model || "processamento"),
        durationMs: Number(result.durationMs || Date.now() - startedAt),
      };
    }

    if (status.status === "failed") {
      throw new PreProcessarError(
        status.errorMessage || "Falha no processamento assíncrono.",
        status.errorCode || "unknown",
        status.stage,
        null,
        status.provider || start.provider,
        status.model || start.model,
        status.technicalDetail,
        start.jobId,
      );
    }

    // Detecta estagnação: se `updatedAt` do job não muda entre polls sucessivos,
    // o worker pode ter morrido. Aguarda o watchdog server-side (que finaliza em
    // 120s) e propaga o erro real ao invés de esperar 8 min em silêncio.
    if (status.updatedAt) {
      if (status.updatedAt === lastUpdatedAt) {
        stagnantSince ??= Date.now();
        if (Date.now() - stagnantSince > STAGNATION_LIMIT_MS) {
          throw new PreProcessarError(
            "Worker de OCR não respondeu — o processo travou em segundo plano. Tente novamente.",
            "provider_timeout",
            status.stage,
            null,
            status.provider || start.provider,
            status.model || start.model,
            `sem update há ${Math.round((Date.now() - stagnantSince) / 1000)}s (jobId=${start.jobId})`,
            start.jobId,
          );
        }
      } else {
        lastUpdatedAt = status.updatedAt;
        stagnantSince = null;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(7000, delayMs + 500);
  }

  throw new PreProcessarError(
    "O processamento continua em segundo plano há mais tempo que o esperado. Aguarde alguns instantes e atualize a pauta.",
    "provider_timeout",
    "ocr_processing",
    null,
    start.provider,
    start.model,
    `jobId=${start.jobId}`,
    start.jobId,
  );
}

/**
 * Garante que o access_token no client não está expirado antes de invocar
 * uma edge function longa. Se o refresh falhar (refresh_token_not_found ou
 * similar), lança PreProcessarError("session_expired") — evita queimar
 * minutos de OCR/IA num JWT morto e produz um toast claro para o usuário.
 */
async function ensureFreshSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new PreProcessarError(
      "Sua sessão expirou. Saia e entre novamente para continuar.",
      "session_expired",
    );
  }
  const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
  const secondsToExpire = expiresAt ? (expiresAt - Date.now()) / 1000 : Infinity;
  if (secondsToExpire < 60) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshed.session) {
      throw new PreProcessarError(
        "Sua sessão expirou. Saia e entre novamente para continuar.",
        "session_expired",
      );
    }
  }
}

/**
 * Dispara o pré-processamento IA de uma perícia previdenciária.
 * Reusa exatamente a infra de IA configurada no DevPanel (provider/fallback/retry).
 */
export async function preProcessarPericia(
  periciaId: string,
  opts: { onMinimaxProgress?: (p: MinimaxOcrProgress) => void; onJobProgress?: (message: string) => void } = {},
): Promise<PreProcessarResult> {
  await ensureFreshSession();
  // 1ª tentativa: envia só o periciaId. Se o DevPanel estiver com MiniMax como
  // provider de OCR, a edge function sinaliza needsClientRasterize e rodamos o
  // pipeline no navegador.
  const first = await supabase.functions.invoke("prev-pre-processar", {
    body: { periciaId },
  });

  const errorBody = first.error ? await readErrorBody(first.error) : null;
  const firstSignal = isClientRasterizeSignal(first.data)
    ? first.data
    : isClientRasterizeSignal(errorBody)
      ? errorBody
      : null;

  if (firstSignal) {
    // Baixa o PDF direto do storage e roda OCR client-side
    const bucket = String(firstSignal.bucket || "prev-pdfs");
    const pdfPath = String(firstSignal.pdfPath || "");
    if (!pdfPath) {
      throw new PreProcessarError("Servidor sinalizou rasterização client-side sem pdfPath.");
    }
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(pdfPath);
    if (dlErr || !blob) {
      throw new PreProcessarError(`Falha ao baixar PDF do storage: ${dlErr?.message ?? "vazio"}`);
    }
    const provider = firstSignal.mode === "gemini-client-rasterize" || firstSignal.chunkEndpoint === "gemini-ocr-chunk"
      ? "gemini"
      : "minimax";
    // Lê concorrência configurada pelo dev (default 4). Cap 1..8 aplicado no client OCR.
    let parallelism = 4;
    try {
      const { data: cfg } = await supabase
        .from("system_config")
        .select("value")
        .eq("id", "minimax_render_concurrency")
        .maybeSingle();
      const v = cfg?.value;
      const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
      if (Number.isFinite(n) && n > 0) parallelism = n;
    } catch { /* usa default */ }

    const ocr = await runMinimaxClientOcr(blob, {
      provider,
      chunkEndpoint: firstSignal.chunkEndpoint,
      model: typeof firstSignal.model === "string" ? firstSignal.model : undefined,
      parallelism,
      onProgress: opts.onMinimaxProgress,
    });
    // 2ª tentativa: reenvio com texto pré-extraído (garante JWT fresco após OCR longo)
    await ensureFreshSession();
    const second = await supabase.functions.invoke("prev-pre-processar", {
      body: {
        periciaId,
        preExtractedText: ocr.text,
        preExtractedProvider: ocr.provider,
        preExtractedModel: ocr.model,
        preExtractedPageCount: ocr.pageCount,
      },
    });
    return unwrap(second.data, second.error);
  }

  if (isAsyncStart(first.data)) {
    opts.onJobProgress?.("Processamento em segundo plano iniciado");
    return pollPreProcessarJob(first.data, opts.onJobProgress);
  }

  return unwrap(first.data, first.error);
}

async function unwrap(
  data: unknown,
  error: unknown,
): Promise<PreProcessarResult> {
  if (error) {
    const body = await readErrorBody(error);
    if (body && typeof body === "object") {
      throw classifyInvokeError(error, body);
    }
    throw classifyInvokeError(error, null);
  }
  const d = data as Record<string, unknown> | null;
  if (isAsyncStart(d)) {
    return pollPreProcessarJob(d);
  }
  if (d?.error) {
    throw new PreProcessarError(
      String(d.error),
      (d.code as PreProcessarErrorCode) || "unknown",
      typeof d.stage === "string" ? d.stage : undefined,
      typeof d.upstreamStatus === "number" ? d.upstreamStatus : null,
      typeof d.provider === "string" ? d.provider : undefined,
      typeof d.model === "string" ? d.model : undefined,
      typeof d.technicalDetail === "string" ? d.technicalDetail : undefined,
    );
  }
  if (!d?.ok) {
    throw new PreProcessarError("Resposta inesperada do servidor.");
  }
  return d as unknown as PreProcessarResult;
}
