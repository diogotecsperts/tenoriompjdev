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

export interface OcrRouterResult {
  text: string;
  pageCount: number;
  provider: string;
  model: string;
}

export interface OcrRouterConfig {
  provider: "gemini" | "mistral";
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
      const v = (row as any).value;
      map[(row as any).id] = typeof v === "string" ? v : (v?.value ?? "");
    }
    const providerRaw = (map.phase1_ocr_provider || "gemini").toLowerCase();
    const provider: "gemini" | "mistral" =
      providerRaw === "mistral" ? "mistral" : "gemini";
    const geminiModel = map.phase1_gemini_model || "gemini-2.5-flash";
    return { provider, geminiModel };
  } catch (_e) {
    return { provider: "gemini", geminiModel: "gemini-2.5-flash" };
  }
}

/**
 * Executa OCR usando o provider configurado no DevPanel.
 * Se o provider escolhido estiver sem chave, faz fallback silencioso para o outro.
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

  let effective: "gemini" | "mistral" = cfg.provider;
  if (effective === "mistral" && !mistralKey) {
    console.warn(`${prefix} MISTRAL_API_KEY ausente — fallback para Gemini`);
    effective = "gemini";
  }
  if (effective === "gemini" && !geminiKey) {
    console.warn(`${prefix} GEMINI_API_KEY ausente — fallback para Mistral`);
    effective = "mistral";
  }

  if (effective === "mistral") {
    if (!mistralKey) throw new Error("Nenhum provider de OCR disponível (Mistral e Gemini sem chave)");
    const r = await extractWithMistralOCR(pdfBytes, mistralKey);
    return {
      text: r.text,
      pageCount: r.pageCount,
      provider: r.provider,
      model: r.model,
    };
  }

  // Gemini visual
  const r = await extractVisualContent(pdfBytes, { model: cfg.geminiModel });
  return {
    text: r.rawText,
    pageCount: r.pageCount,
    provider: r.provider || "gemini-visual",
    model: r.model || cfg.geminiModel,
  };
}
