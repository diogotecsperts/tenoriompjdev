import { supabase } from "@/integrations/supabase/client";

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
export async function preProcessarPericia(periciaId: string): Promise<PreProcessarResult> {
  const { data, error } = await supabase.functions.invoke("prev-pre-processar", {
    body: { periciaId },
  });

  if (error) {
    const body = await readErrorBody(error);
    if (body && typeof body === "object") {
      const code = (body.code as PreProcessarErrorCode) || "unknown";
      const message =
        (typeof body.error === "string" && body.error) ||
        error.message ||
        "Falha no pré-processamento.";
      throw new PreProcessarError(
        message,
        code,
        typeof body.stage === "string" ? body.stage : undefined,
        typeof body.upstreamStatus === "number" ? body.upstreamStatus : null,
      );
    }
    throw new PreProcessarError(error.message || "Falha no pré-processamento.");
  }

  if (data?.error) {
    throw new PreProcessarError(
      data.error,
      (data.code as PreProcessarErrorCode) || "unknown",
      typeof data.stage === "string" ? data.stage : undefined,
      typeof data.upstreamStatus === "number" ? data.upstreamStatus : null,
    );
  }
  if (!data?.ok) {
    throw new PreProcessarError("Resposta inesperada do servidor.");
  }
  return data as PreProcessarResult;
}
