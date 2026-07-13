/**
 * OCR Router — aplica a configuração de OCR do DevPanel (system_config)
 * a QUALQUER módulo (Trabalhista, Previdenciário, Impugnação, futuros).
 *
 * Regra do projeto: nenhum módulo pode hardcodar provider/modelo de OCR.
 * Toda extração de texto de PDF DEVE passar por aqui (ou pela mesma leitura
 * de `phase1_ocr_provider` / `phase1_gemini_model`) para respeitar o DevPanel.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractWithMistralOCR, getMistralAPIKey } from "./mistral-ocr.ts";
import { extractVisualContent } from "./pdf-visual-extractor.ts";
import { getMinimaxAPIKey, MINIMAX_CLIENT_RASTERIZE_ERROR } from "./minimax-client.ts";

export type OcrProvider = "gemini" | "mistral" | "minimax";

export interface OcrRouterResult {
  text: string;
  pageCount: number;
  provider: string;
  model: string;
}

export interface OcrRouterConfig {
  provider: OcrProvider;
  geminiModel: string;
}

/**
 * Lê `phase1_ocr_provider` e `phase1_gemini_model` de `system_config`.
 * Fallback silencioso para Gemini/gemini-2.5-flash se algo falhar.
 */
export async function getOcrRouterConfig(): Promise<OcrRouterConfig> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      return { provider: "gemini", geminiModel: "gemini-2.5-flash" };
    }
    const admin = createClient(url, key);
    const { data } = await admin
      .from("system_config")
      .select("id, value")
      .in("id", ["phase1_ocr_provider", "phase1_gemini_model"]);

    const map: Record<string, string> = {};
    for (const row of data || []) {
      // deno-lint-ignore no-explicit-any
      const v = (row as any).value;
      // deno-lint-ignore no-explicit-any
      map[(row as any).id] = typeof v === "string" ? v : (v?.value ?? "");
    }
    const providerRaw = (map.phase1_ocr_provider || "gemini").toLowerCase();
    const provider: OcrProvider =
      providerRaw === "mistral" ? "mistral" :
      providerRaw === "minimax" ? "minimax" : "gemini";
    const geminiModel = map.phase1_gemini_model || "gemini-2.5-flash";
    return { provider, geminiModel };
  } catch (_e) {
    return { provider: "gemini", geminiModel: "gemini-2.5-flash" };
  }
}

/**
 * Executa OCR usando **exclusivamente** o provider configurado no DevPanel.
 *
 * Sem cadeia de fallback silenciosa: se o provider escolhido falhar, o erro
 * é propagado direto ao caller. Fallback silencioso pra Mistral gerou cobrança
 * inesperada quando o Gemini 3.x quebrava (bug de `response_mime_type` no body
 * da Files API — jul/2026). DevPanel agora é fonte única da verdade.
 *
 * MiniMax continua sinalizando `MINIMAX_CLIENT_RASTERIZE_ERROR` para o caller
 * delegar ao pipeline client-side (`runMinimaxClientOcr`); isso não é fallback
 * pago, é o fluxo canônico do MiniMax.
 */
export async function runOcrWithConfiguredProvider(
  pdfBytes: Uint8Array,
  opts: { logPrefix?: string } = {},
): Promise<OcrRouterResult> {
  const cfg = await getOcrRouterConfig();
  const prefix = opts.logPrefix || "[ocr-router]";
  console.log(
    `${prefix} provider=${cfg.provider} model=${cfg.geminiModel} bytes=${pdfBytes.byteLength}`,
  );

  const mistralKey = getMistralAPIKey();
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  const minimaxKey = getMinimaxAPIKey();

  const missingKey =
    (cfg.provider === "mistral" && !mistralKey) ||
    (cfg.provider === "minimax" && !minimaxKey) ||
    (cfg.provider === "gemini" && !geminiKey);

  if (missingKey) {
    throw new Error(
      `Provider de OCR '${cfg.provider}' configurado no DevPanel está sem chave de API. ` +
      `Configure a chave correspondente ou troque o provider no DevPanel.`,
    );
  }

  try {
    if (cfg.provider === "mistral") {
      const r = await extractWithMistralOCR(pdfBytes, mistralKey!);
      return { text: r.text, pageCount: r.pageCount, provider: r.provider, model: r.model };
    }
    if (cfg.provider === "minimax") {
      // MiniMax OCR não pode rodar dentro da edge function (rasterização WASM
      // estoura o limite de CPU ~2s → WORKER_RESOURCE_LIMIT). O caller precisa
      // detectar este erro e delegar ao frontend (src/lib/minimax-ocr-client.ts).
      throw new Error(
        `${MINIMAX_CLIENT_RASTERIZE_ERROR}: MiniMax OCR requer rasterização no navegador. ` +
        `Frontend deve chamar 'minimax-ocr-chunk' endpoint diretamente.`,
      );
    }
    // gemini visual (default)
    const r = await extractVisualContent(pdfBytes, { model: cfg.geminiModel });
    return {
      text: r.rawText,
      pageCount: r.pageCount,
      provider: r.provider || "gemini-visual",
      model: r.model || cfg.geminiModel,
    };
  } catch (e) {
    const err = e as Error;
    console.error(`${prefix} provider ${cfg.provider} falhou (sem fallback): ${err.message.slice(0, 400)}`);
    throw err;
  }
}

