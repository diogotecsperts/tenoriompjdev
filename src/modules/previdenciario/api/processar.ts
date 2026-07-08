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
  | "file_too_large"
  | "unsupported_file"
  | "provider_unavailable"
  | "unknown";

export class PreProcessarError extends Error {
  code: PreProcessarErrorCode;
  stage?: string;
  upstreamStatus?: number | null;
  constructor(
    message: string,
    code: PreProcessarErrorCode = "unknown",
    stage?: string,
    upstreamStatus?: number | null,
  ) {
    super(message);
    this.name = "PreProcessarError";
    this.code = code;
    this.stage = stage;
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Tenta extrair o corpo JSON da resposta de erro vinda do
 * supabase-js (FunctionsHttpError carrega a Response em `context`).
 */
async function readErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  try {
    const ctx = (error as { context?: Response | { json?: () => Promise<unknown> } })?.context;
    if (!ctx) return null;
    if (typeof (ctx as Response).clone === "function") {
      const r = (ctx as Response).clone();
      const text = await r.text();
      if (!text) return null;
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { error: text };
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

/**
 * Dispara o pré-processamento IA de uma perícia previdenciária.
 * Reusa exatamente a infra de IA configurada no DevPanel (provider/fallback/retry).
 */
export async function preProcessarPericia(
  periciaId: string,
  opts: { onMinimaxProgress?: (p: MinimaxOcrProgress) => void } = {},
): Promise<PreProcessarResult> {
  // 1ª tentativa: envia só o periciaId. Se o DevPanel estiver com MiniMax como
  // provider de OCR, a edge function responde 409 com needsClientRasterize e
  // rodamos o pipeline no navegador.
  const first = await supabase.functions.invoke("prev-pre-processar", {
    body: { periciaId },
  });

  const firstData = first.data as
    | (Record<string, unknown> & { needsClientRasterize?: boolean; pdfPath?: string; bucket?: string })
    | null;
  if (firstData?.needsClientRasterize) {
    // Baixa o PDF direto do storage e roda OCR client-side
    const bucket = String(firstData.bucket || "prev-pdfs");
    const pdfPath = String(firstData.pdfPath || "");
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
      const code = (body.code as PreProcessarErrorCode) || "unknown";
      const message =
        (typeof body.error === "string" && body.error) ||
        (error as { message?: string })?.message ||
        "Falha no pré-processamento.";
      throw new PreProcessarError(
        message,
        code,
        typeof body.stage === "string" ? body.stage : undefined,
        typeof body.upstreamStatus === "number" ? body.upstreamStatus : null,
      );
    }
    throw new PreProcessarError((error as { message?: string })?.message || "Falha no pré-processamento.");
  }
  const d = data as Record<string, unknown> | null;
  if (d?.error) {
    throw new PreProcessarError(
      String(d.error),
      (d.code as PreProcessarErrorCode) || "unknown",
      typeof d.stage === "string" ? d.stage : undefined,
      typeof d.upstreamStatus === "number" ? d.upstreamStatus : null,
    );
  }
  if (!d?.ok) {
    throw new PreProcessarError("Resposta inesperada do servidor.");
  }
  return d as unknown as PreProcessarResult;
}
