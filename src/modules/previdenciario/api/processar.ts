import { supabase } from "@/integrations/supabase/client";
import { runMinimaxClientOcr, type MinimaxOcrProgress } from "@/lib/minimax-ocr-client";
import {
  prevPdfNeedsSplit,
  splitPrevPdf,
  splitCleanPdfByPages,
  probePdfPageCount,
  PREV_SPLIT_MAX_PAGES,
  PREV_SPLIT_MAX_BYTES,
  uploadPericiaPdfPart,
  downloadPericiaPdf,
  deletePericiaPdfParts,
  rasterAndUploadCleanPdf,
  deletePericiaPdfClean,
  updatePericia,
  type PrevPdfSplitPart,
} from "./pautas";

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
  ocr_processing: "OCR em execução",
  ocr_completed: "OCR concluído",
  ai_extraction: "Extraindo dados",
  ai_refinement: "Refinando campos",
  saving: "Salvando resultado",
  completed: "Concluído",
  failed: "Falhou",
};

/**
 * Nome legível do provider — usado tanto para OCR (fase 1) quanto para IA
 * generalista (fase 2). O provider vem de `status.provider`, que é atualizado
 * pelo backend em cada transição de stage refletindo o que está ativo no
 * DevPanel. Nada aqui é hardcode: se um novo provider aparecer, cai no
 * fallback capitalizado.
 */
function providerDisplayName(provider?: string | null): string | null {
  if (!provider) return null;
  const p = provider.toLowerCase();
  if (p.includes("glm") || p.includes("zhipu")) return "GLM";
  if (p.includes("mistral")) return "Mistral";
  if (p.includes("minimax")) return "MiniMax";
  if (p.includes("gemini") || p.includes("google")) return "Gemini";
  if (p.includes("claude") || p.includes("anthropic")) return "Claude";
  if (p.includes("openai") || p.startsWith("gpt")) return "OpenAI";
  if (p.includes("lovable")) return "Lovable AI";
  // Fallback: mostra o próprio token (primeira letra maiúscula) para não perder o nome.
  const token = p.split(/[\/\-_.:]/)[0] || p;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function formatStageLabel(stage: string, provider?: string | null): string {
  const base = STAGE_LABELS[stage] || stage;
  const name = providerDisplayName(provider);
  if (!name) return base;
  if (stage === "ocr_processing") return `OCR ${name} em execução`;
  if (stage === "ocr_completed") return `OCR ${name} concluído`;
  if (stage === "ai_extraction") return `Extraindo dados via ${name}`;
  if (stage === "ai_refinement") return `Refinando campos via ${name}`;
  return base;
}


// ============================================================================
// withRetry — 3 tentativas com backoff exponencial + jitter
// ----------------------------------------------------------------------------
// Retryable: rate_limited, provider_timeout, provider_unavailable,
// response_truncated, erros de rede, 5xx/504.
// Não retryable: quota_exceeded, invalid_key, session_expired, canceled,
// invalid_request, unsupported_file, file_too_large.
// Respeita signal.aborted entre tentativas.
// ============================================================================

const RETRYABLE_CODES: PreProcessarErrorCode[] = [
  "rate_limited",
  "provider_timeout",
  "provider_unavailable",
  "response_truncated",
];

function isRetryable(err: unknown): boolean {
  if (err instanceof PreProcessarError) {
    if (RETRYABLE_CODES.includes(err.code)) return true;
    if (err.upstreamStatus && err.upstreamStatus >= 500) return true;
    return false;
  }
  // Erros de rede genéricos (fetch)
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? "";
  if (/network|fetch failed|failed to fetch|timeout|econnreset|socket/.test(msg)) return true;
  return false;
}

async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  opts: { attempts?: number; signal?: AbortSignal; onProgress?: (msg: string) => void } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    if (opts.signal?.aborted) throwCanceled(undefined, label);
    try {
      if (i > 1) {
        opts.onProgress?.(`${label} — tentativa ${i}/${attempts}`);
        // Sessão pode ter envelhecido entre tentativas
        try { await ensureFreshSession(); } catch { /* propaga na próxima chamada */ }
      }
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts) {
        throw err;
      }
      // Backoff exponencial 2s → 4s → 8s com jitter ±25%
      const base = 2000 * Math.pow(2, i - 1);
      const jitter = base * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.max(500, Math.round(base + jitter));
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[withRetry] ${label} falhou (${i}/${attempts}): ${errMsg} — retry em ${delay}ms`);
      opts.onProgress?.(`${label} — aguardando retry (${Math.round(delay / 1000)}s)...`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          opts.signal?.removeEventListener("abort", onAbort);
          resolve();
        }, delay);
        const onAbort = () => { clearTimeout(t); resolve(); };
        opts.signal?.addEventListener("abort", onAbort, { once: true });
      });
      if (opts.signal?.aborted) throwCanceled(undefined, label);
    }
  }
  throw lastErr;
}


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

async function requestJobCancel(jobId: string): Promise<void> {
  try {
    await supabase.functions.invoke("cancel-prev-processing-job", { body: { jobId } });
  } catch (e) {
    console.warn("[prev-pre-processar] cancel invoke failed", e);
  }
}

function throwCanceled(jobId?: string, stage?: string): never {
  throw new PreProcessarError(
    "Processamento cancelado.",
    "canceled",
    stage,
    null,
    undefined,
    undefined,
    undefined,
    jobId,
  );
}

async function pollPreProcessarJob(
  start: AsyncPreProcessarStart,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
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
    if (signal?.aborted) {
      void requestJobCancel(start.jobId);
      throwCanceled(start.jobId, "ocr_processing");
    }
    const status = await checkStatus(start.jobId);
    const label = formatStageLabel(status.stage, status.provider || start.provider);
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

    // Sleep responsivo ao abort: acorda cedo se signal disparar durante a espera.
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delayMs);
      const onAbort = () => {
        clearTimeout(t);
        resolve();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    if (signal?.aborted) {
      void requestJobCancel(start.jobId);
      throwCanceled(start.jobId, "ocr_processing");
    }
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
  opts: { onMinimaxProgress?: (p: MinimaxOcrProgress) => void; onJobProgress?: (message: string) => void; signal?: AbortSignal } = {},
): Promise<PreProcessarResult> {
  const { signal } = opts;
  if (signal?.aborted) throwCanceled();
  await ensureFreshSession();
  // 1ª tentativa: envia só o periciaId. Se o DevPanel estiver com MiniMax como
  // provider de OCR, a edge function sinaliza needsClientRasterize e rodamos o
  // pipeline no navegador.
  const first = await withRetry(
    "Iniciando processamento",
    async () => {
      const r = await supabase.functions.invoke("prev-pre-processar", {
        body: { periciaId },
      });
      // Retryable somente se erro E ainda não é sinal de client-rasterize.
      if (r.error) {
        const body = await readErrorBody(r.error);
        if (isClientRasterizeSignal(body)) return r;
        const classified = classifyInvokeError(r.error, body);
        if (isRetryable(classified)) throw classified;
      }
      return r;
    },
    { signal, onProgress: opts.onJobProgress },
  );

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

    // runMinimaxClientOcr já tem retry interno por chunk — não envelopar.
    const ocr = await runMinimaxClientOcr(blob, {
      provider,
      chunkEndpoint: firstSignal.chunkEndpoint,
      model: typeof firstSignal.model === "string" ? firstSignal.model : undefined,
      parallelism,
      onProgress: opts.onMinimaxProgress,
    });
    // 2ª tentativa: reenvio com texto pré-extraído — envolvida em retry (a IA
    // generalista precisa ter chance de recuperar de rate_limit/timeout).
    await ensureFreshSession();
    const second = await withRetry(
      "Extração final",
      async () => {
        const r = await supabase.functions.invoke("prev-pre-processar", {
          body: {
            periciaId,
            preExtractedText: ocr.text,
            preExtractedProvider: ocr.provider,
            preExtractedModel: ocr.model,
            preExtractedPageCount: ocr.pageCount,
          },
        });
        if (r.error) {
          const body = await readErrorBody(r.error);
          const classified = classifyInvokeError(r.error, body);
          if (isRetryable(classified)) throw classified;
        }
        return r;
      },
      { signal, onProgress: opts.onJobProgress },
    );
    return unwrap(second.data, second.error);
  }

  if (isAsyncStart(first.data)) {
    opts.onJobProgress?.("Processamento em segundo plano iniciado");
    return pollPreProcessarJob(first.data, opts.onJobProgress, signal);
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

// ============================================================================
// preProcessarPericiaComSplit
// ----------------------------------------------------------------------------
// Wrapper que baixa o PDF completo, decide se precisa split (>48MB) e, quando
// precisa, divide client-side, OCR-a cada parte via `prev-ocr-part` (mesmo
// provider do DevPanel) e reinvoca `prev-pre-processar` com `preExtractedText`.
// PDFs ≤48MB caem 100% no fluxo original — zero regressão no caminho rápido.
// ============================================================================

interface OcrPartResult {
  text: string;
  pageCount: number;
  provider: string;
  model: string;
}

interface ClientRasterizeSignalResponse {
  ok?: false;
  needsClientRasterize: true;
  mode?: string;
  chunkEndpoint?: "minimax-ocr-chunk" | "gemini-ocr-chunk";
  provider?: string;
  model?: string;
  pdfPath?: string;
  bucket?: string;
}

function isRasterizeResp(v: unknown): v is ClientRasterizeSignalResponse {
  return !!v && typeof v === "object" && (v as Record<string, unknown>).needsClientRasterize === true;
}

async function ocrSinglePart(
  periciaId: string,
  part: PrevPdfSplitPart,
  partPath: string,
  opts: {
    onMinimaxProgress?: (p: MinimaxOcrProgress) => void;
    signal?: AbortSignal;
  },
): Promise<OcrPartResult> {
  const { data, error } = await withRetry(
    "OCR desta parte",
    async () => {
      const r = await supabase.functions.invoke("prev-ocr-part", {
        body: { periciaId, partPath },
      });
      if (r.error) {
        const body = await readErrorBody(r.error);
        if (isRasterizeResp(body)) return r; // sinal — não retentar
        const classified = classifyInvokeError(r.error, body);
        if (isRetryable(classified)) throw classified;
      }
      return r;
    },
    { signal: opts.signal },
  );

  if (error) {
    const body = await readErrorBody(error);
    if (isRasterizeResp(body)) {
      return await ocrPartClientSide(part, body, opts);
    }
    throw classifyInvokeError(error, body);
  }

  if (isRasterizeResp(data)) {
    return await ocrPartClientSide(part, data, opts);
  }

  const d = data as {
    ok?: boolean;
    text?: string;
    pageCount?: number;
    provider?: string;
    model?: string;
    error?: string;
  } | null;

  if (!d?.ok || typeof d.text !== "string") {
    throw new PreProcessarError(
      d?.error || "Falha no OCR desta parte do PDF.",
      "unknown",
      "ocr_processing",
    );
  }

  return {
    text: d.text,
    pageCount: Number(d.pageCount || 0),
    provider: String(d.provider || "backend"),
    model: String(d.model || "processamento"),
  };
}

async function ocrPartClientSide(
  part: PrevPdfSplitPart,
  signal: ClientRasterizeSignalResponse,
  opts: {
    onMinimaxProgress?: (p: MinimaxOcrProgress) => void;
    signal?: AbortSignal;
  },
): Promise<OcrPartResult> {
  const provider =
    signal.mode === "gemini-client-rasterize" || signal.chunkEndpoint === "gemini-ocr-chunk"
      ? "gemini"
      : "minimax";

  // Concorrência client-side lida da config
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

  const ocr = await runMinimaxClientOcr(part.blob, {
    provider,
    chunkEndpoint: signal.chunkEndpoint,
    model: typeof signal.model === "string" ? signal.model : undefined,
    parallelism,
    onProgress: opts.onMinimaxProgress,
    signal: opts.signal,
  });
  return {
    text: ocr.text,
    pageCount: ocr.pageCount,
    provider: ocr.provider,
    model: ocr.model,
  };
}

/**
 * Variante inteligente de preProcessarPericia:
 *   - PDF ≤ 48MB → chama preProcessarPericia (fluxo idêntico ao original).
 *   - PDF  > 48MB → rasteriza no browser, remonta um PDF limpo (só-imagens)
 *     abaixo do limite, sobe como `-clean.pdf`, aponta pdf_path da perícia
 *     temporariamente pro clean, chama preProcessarPericia normalmente, e
 *     restaura o pdf_path original ao final.
 *
 * Preserva callbacks/signal para o UI (progresso e cancelamento).
 * Retry universal (3 tentativas) já embutido em preProcessarPericia.
 */
export async function preProcessarPericiaComSplit(
  periciaId: string,
  pdfPath: string | null,
  opts: {
    signal?: AbortSignal;
    onJobProgress?: (message: string) => void;
    onMinimaxProgress?: (p: MinimaxOcrProgress) => void;
  } = {},
): Promise<PreProcessarResult> {
  if (opts.signal?.aborted) throwCanceled();

  // Sem pdf_path em memória → cai no fluxo canônico (que já valida no server).
  if (!pdfPath) {
    return preProcessarPericia(periciaId, opts);
  }

  await ensureFreshSession();

  // Baixa o PDF completo para inspecionar tamanho antes de decidir rebuild.
  let blob: Blob;
  try {
    blob = await downloadPericiaPdf(pdfPath);
  } catch (err) {
    console.warn("[prev-rebuild] falha ao baixar PDF para checagem de tamanho; usando fluxo original:", err);
    return preProcessarPericia(periciaId, opts);
  }

  // Probe rápido de pageCount (pdf-lib load, ~50-200ms). Ativa rebuild
  // quando `size > 48MB` OU `pageCount > 90` (limite duro do GLM).
  let pageCountProbe = 0;
  try {
    pageCountProbe = await probePdfPageCount(blob);
  } catch (err) {
    console.warn("[prev-rebuild] probePdfPageCount falhou; usando fallback só por tamanho:", err);
  }
  const needsSplitByBytes = prevPdfNeedsSplit(blob);
  const needsSplitByPages = pageCountProbe > PREV_SPLIT_MAX_PAGES;

  if (!needsSplitByBytes && !needsSplitByPages) {
    // Caminho rápido — zero alteração no comportamento.
    return preProcessarPericia(periciaId, opts);
  }

  const totalMB = (blob.size / 1024 / 1024).toFixed(1);
  const trigger = needsSplitByBytes && needsSplitByPages
    ? `${totalMB}MB / ${pageCountProbe} págs`
    : needsSplitByBytes
      ? `${totalMB}MB > 48MB`
      : `${pageCountProbe} págs > ${PREV_SPLIT_MAX_PAGES}`;
  console.log(`[prev-rebuild] PDF ${trigger} → rasterizando e remontando limpo`);
  opts.onJobProgress?.(`PDF grande (${trigger}): rasterizando páginas...`);

  const userIdFromPath = pdfPath.split("/")[0]; // path é `{userId}/{periciaId}.pdf`
  const started = Date.now();
  let cleanPath: string | null = null;
  let pathSwapped = false;

  try {
    // Concorrência lida da config (mesma chave usada pelo client OCR).
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

    // Rasteriza + monta PDF limpo + sobe pro storage
    const { path, sizeBytes, pageCount } = await rasterAndUploadCleanPdf(
      userIdFromPath,
      periciaId,
      blob,
      {
        parallelism,
        signal: opts.signal,
        onPageProgress: (done, total) => {
          opts.onJobProgress?.(`Rasterizando página ${done}/${total}...`);
        },
      },
    );
    cleanPath = path;
    const cleanMB = (sizeBytes / 1024 / 1024).toFixed(1);
    const singleShot = sizeBytes <= PREV_SPLIT_MAX_BYTES && pageCount <= PREV_SPLIT_MAX_PAGES;
    console.log(
      `[prev-rebuild] limpo: ${cleanMB}MB / ${pageCount} págs → decisão: ${singleShot ? "single-shot" : "split por páginas"}`,
    );
    opts.onJobProgress?.(`PDF limpo gerado (${cleanMB}MB, ${pageCount} págs).`);

    if (opts.signal?.aborted) throwCanceled();

    // Se o PDF limpo cabe em UMA chamada (bytes E páginas dentro do limite),
    // aponta pdf_path da perícia pro limpo e chama o fluxo normal.
    if (singleShot) {
      await updatePericia(periciaId, { pdf_path: cleanPath });
      pathSwapped = true;
      opts.onJobProgress?.("Enviando para OCR (chamada única)...");
      return await preProcessarPericia(periciaId, opts);
    }

    // Caso contrário: split sequencial por páginas do PDF LIMPO (que agora tem
    // páginas independentes, sem inflação de /Resources). Cada parte respeita
    // simultaneamente 48MB e 90 páginas.
    const cleanBlob = await downloadPericiaPdf(cleanPath);
    const parts = await splitCleanPdfByPages(cleanBlob, PREV_SPLIT_MAX_PAGES, PREV_SPLIT_MAX_BYTES);
    console.log(`[prev-rebuild] split em ${parts.length} parte(s)`);
    const collectedText: string[] = [];
    let repProvider = "";
    let repModel = "";
    let sumPages = 0;
    for (let i = 0; i < parts.length; i++) {
      if (opts.signal?.aborted) throwCanceled();
      const part = parts[i];
      const label = `parte ${i + 1}/${parts.length} (págs ${part.startPage}-${part.endPage})`;
      opts.onJobProgress?.(`OCR ${label}...`);
      const partPath = await uploadPericiaPdfPart(userIdFromPath, periciaId, i + 1, part.blob);
      const r = await ocrSinglePart(periciaId, part, partPath, {
        onMinimaxProgress: (p) => {
          opts.onMinimaxProgress?.(p);
          opts.onJobProgress?.(`OCR ${label} · ${p.message ?? p.phase}`);
        },
        signal: opts.signal,
      });
      collectedText.push(
        `=== CONTINUAÇÃO (parte ${i + 1}/${parts.length}, págs ${part.startPage}-${part.endPage}) ===\n${r.text}`,
      );
      sumPages += r.pageCount || (part.endPage - part.startPage + 1);
      if (!repProvider) repProvider = r.provider;
      if (!repModel) repModel = r.model;
    }
    const preExtractedText = collectedText.join("\n\n");
    opts.onJobProgress?.("OCR concluído. Enviando para extração final...");
    await ensureFreshSession();
    const final = await withRetry(
      "Extração final",
      async () => {
        const r = await supabase.functions.invoke("prev-pre-processar", {
          body: {
            periciaId,
            preExtractedText,
            preExtractedProvider: repProvider,
            preExtractedModel: repModel,
            preExtractedPageCount: sumPages,
          },
        });
        if (r.error) {
          const body = await readErrorBody(r.error);
          const classified = classifyInvokeError(r.error, body);
          if (isRetryable(classified)) throw classified;
        }
        return r;
      },
      { signal: opts.signal, onProgress: opts.onJobProgress },
    );
    if (final.error) {
      const body = await readErrorBody(final.error);
      throw classifyInvokeError(final.error, body);
    }
    if (isAsyncStart(final.data)) {
      opts.onJobProgress?.("Processamento em segundo plano iniciado");
      return await pollPreProcessarJob(final.data, opts.onJobProgress, opts.signal);
    }
    return await unwrap(final.data, null);
  } finally {
    // Restaura pdf_path original e apaga o -clean.pdf (best-effort).
    if (pathSwapped) {
      try {
        await updatePericia(periciaId, { pdf_path: pdfPath });
      } catch (e) {
        console.warn("[prev-rebuild] falha ao restaurar pdf_path original:", e);
      }
    }
    if (cleanPath) {
      void deletePericiaPdfClean(userIdFromPath, periciaId);
    }
    // Limpa partes temporárias caso o fallback split tenha rodado.
    void deletePericiaPdfParts(userIdFromPath, periciaId);
    console.log(`[prev-rebuild] cleanup em ${Date.now() - started}ms`);
  }
}
