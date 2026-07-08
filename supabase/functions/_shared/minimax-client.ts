/**
 * MiniMax M3 client — chat completions (IA geral).
 *
 * Regras fixas (não configuráveis):
 *  - Endpoint: POST https://api.minimax.io/v1/chat/completions
 *  - Model:    "MiniMax-M3" (case-sensitive)
 *  - thinking: { type: "disabled" }  → sempre injetado
 *
 * OCR é feito via rasterização client-side (src/lib/minimax-ocr-client.ts) +
 * endpoint fino `minimax-ocr-chunk` — este arquivo NÃO faz OCR nem rasterização
 * (rasterizar via WASM na edge estoura o limite de CPU do runtime).
 */

const MINIMAX_ENDPOINT = "https://api.minimax.io/v1/chat/completions";
export const MINIMAX_MODEL = "MiniMax-M3";

export function getMinimaxAPIKey(): string | null {
  return Deno.env.get("MINIMAX_API_KEY") || null;
}

// ---------- Chat completions (IA geral + suporte a mensagens multimodais) ----------

export interface MinimaxChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface CallMinimaxChatOpts {
  messages: MinimaxChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  apiKey?: string;
}

export interface MinimaxChatResult {
  text: string;
  provider: "minimax";
  model: string;
  tokensInput?: number;
  tokensOutput?: number;
}

export async function callMinimaxChat(opts: CallMinimaxChatOpts): Promise<MinimaxChatResult> {
  const apiKey = opts.apiKey || getMinimaxAPIKey();
  if (!apiKey) throw new Error("MINIMAX_API_KEY não configurada");

  const body: Record<string, unknown> = {
    model: MINIMAX_MODEL,
    thinking: { type: "disabled" }, // FIXO — economiza tokens e latência
    temperature: opts.temperature ?? 0,
    messages: opts.messages,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(MINIMAX_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MiniMax API error (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return {
    text: typeof content === "string" ? content : JSON.stringify(content),
    provider: "minimax",
    model: data?.model || MINIMAX_MODEL,
    tokensInput: data?.usage?.prompt_tokens,
    tokensOutput: data?.usage?.completion_tokens,
  };
}

/**
 * Sentinel error jogada pelo ocr-router quando o provider configurado é MiniMax
 * mas o caller (edge function) recebeu apenas os bytes do PDF.
 * O caller deve capturar isso e sinalizar ao frontend para rodar o pipeline
 * client-side (rasterizar + chamar `minimax-ocr-chunk` por chunk).
 */
export const MINIMAX_CLIENT_RASTERIZE_ERROR = "MINIMAX_OCR_REQUIRES_CLIENT_RASTERIZE";

export function isMinimaxClientRasterizeError(e: unknown): boolean {
  return e instanceof Error && e.message.includes(MINIMAX_CLIENT_RASTERIZE_ERROR);
}
