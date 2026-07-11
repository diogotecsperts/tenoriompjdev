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
 * Executa OCR usando o provider configurado no DevPanel.
 * Se o provider escolhido estiver sem chave, faz fallback silencioso na ordem
 * declarada pelo próprio provider escolhido → gemini → mistral → minimax.
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

  const hasKey = (p: OcrProvider) =>
    p === "mistral" ? !!mistralKey : p === "minimax" ? !!minimaxKey : !!geminiKey;

  // Cadeia: escolhido → gemini → mistral → minimax (dedupe + só quem tem chave)
  const chain: OcrProvider[] = [];
  const push = (p: OcrProvider) => { if (!chain.includes(p) && hasKey(p)) chain.push(p); };
  push(cfg.provider);
  push("gemini");
  push("mistral");
  push("minimax");

  if (chain.length === 0) {
    throw new Error("Nenhum provider de OCR disponível (Gemini, Mistral e MiniMax sem chave)");
  }

  let lastErr: Error | null = null;
  for (const provider of chain) {
    if (provider !== cfg.provider) {
      console.warn(`${prefix} fallback → ${provider} (motivo: ${lastErr?.message?.slice(0, 200) || "sem chave do provider anterior"})`);
    }
    try {
      if (provider === "mistral") {
        const r = await extractWithMistralOCR(pdfBytes, mistralKey!);
        return { text: r.text, pageCount: r.pageCount, provider: r.provider, model: r.model };
      }
      if (provider === "minimax") {
        // MiniMax OCR não pode rodar dentro da edge function (rasterização WASM
        // estoura o limite de CPU ~2s → WORKER_RESOURCE_LIMIT). O caller precisa
        // detectar este erro e delegar ao frontend (src/lib/minimax-ocr-client.ts).
        throw new Error(
          `${MINIMAX_CLIENT_RASTERIZE_ERROR}: MiniMax OCR requer rasterização no navegador. ` +
          `Frontend deve chamar 'minimax-ocr-chunk' endpoint diretamente.`,
        );
      }
      // gemini visual
      const r = await extractVisualContent(pdfBytes, { model: cfg.geminiModel });
      return {
        text: r.rawText,
        pageCount: r.pageCount,
        provider: r.provider || "gemini-visual",
        model: r.model || cfg.geminiModel,
      };
    } catch (e) {
      lastErr = e as Error;
      if (lastErr.message.includes(MINIMAX_CLIENT_RASTERIZE_ERROR)) {
        console.warn(`${prefix} MiniMax requer rasterização client-side; sinalizando caller sem fallback pesado`);
        throw lastErr;
      }
      if (/timeout|timed out|aborterror|gateway timeout|504/i.test(lastErr.message)) {
        console.error(`${prefix} provider ${provider} excedeu o tempo seguro; interrompendo fallback para preservar resposta detalhada`);
        throw lastErr;
      }
      console.error(`${prefix} provider ${provider} falhou: ${lastErr.message.slice(0, 300)}`);
    }
  }
  throw lastErr || new Error("Todos os providers de OCR falharam");
}
