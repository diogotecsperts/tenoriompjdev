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

export type PreProcessarErrorCode =
  | "quota_exceeded"
  | "invalid_key"
  | "rate_limited"
  | "provider_timeout"
  | "invalid_request"
  | "response_truncated"
  | "file_too_large"
  | "unsupported_file"
  | "provider_unavailable"
  | "unknown";

export class PreProcessarError extends Error {
  code: PreProcessarErrorCode;
  stage?: string;
  provider?: string;
  model?: string;
  upstreamStatus?: number | null;
  technicalDetail?: string;
  constructor(
    message: string,
    code: PreProcessarErrorCode = "unknown",
    stage?: string,
    upstreamStatus?: number | null,
    provider?: string,
    model?: string,
    technicalDetail?: string,
  ) {
    super(message);
    this.name = "PreProcessarError";
    this.code = code;
    this.stage = stage;
    this.upstreamStatus = upstreamStatus;
    this.provider = provider;
    this.model = model;
    this.technicalDetail = technicalDetail;
  }
}

type ClientRasterizeSignal = Record<string, unknown> & {
  needsClientRasterize: true;
  pdfPath?: string;
  bucket?: string;
};

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
  if (code === "unknown") {
    if (status === 504 || /timeout|timed out|edge function returned a non-2xx/i.test(lower)) code = "provider_timeout";
    else if (status === 402 || /quota|saldo|credit|billing|insufficient/i.test(lower)) code = "quota_exceeded";
    else if (status === 429 || /rate limit|too many/i.test(lower)) code = "rate_limited";
    else if (status === 401 || status === 403 || /unauthorized|forbidden|api key|credencial/i.test(lower)) code = "invalid_key";
    else if (status === 400 || /invalid|unsupported|bad request/i.test(lower)) code = "invalid_request";
    else if (status && status >= 500) code = "provider_unavailable";
  }

  const fallbackMessage = code === "provider_timeout"
    ? "Tempo excedido no processamento da IA. O backend encerrou a chamada antes de receber uma resposta completa do provider."
    : rawMessage;

  return new PreProcessarError(
    rawMessage.includes("Edge Function returned") ? fallbackMessage : rawMessage,
    code,
    typeof body?.stage === "string" ? body.stage : undefined,
    status,
    typeof body?.provider === "string" ? body.provider : undefined,
    typeof body?.model === "string" ? body.model : undefined,
    typeof body?.technicalDetail === "string" ? body.technicalDetail : undefined,
  );
}

/**
 * Dispara o pré-processamento IA de uma perícia previdenciária.
 * Reusa exatamente a infra de IA configurada no DevPanel (provider/fallback/retry).
 */
export async function preProcessarPericia(
  periciaId: string,
  opts: { onMinimaxProgress?: (p: MinimaxOcrProgress) => void } = {},
): Promise<PreProcessarResult> {
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
    const ocr = await runMinimaxClientOcr(blob, { onProgress: opts.onMinimaxProgress });
    // 2ª tentativa: reenvio com texto pré-extraído
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
