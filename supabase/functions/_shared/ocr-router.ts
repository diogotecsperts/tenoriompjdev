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
import { extractWithGlmOCR, getGlmAPIKey } from "./glm-ocr.ts";
import { resolveOcrFallback } from "./ocr-fallback.ts";

/**
 * Acima deste tamanho, o Gemini OCR roda via **streaming** direto ao Files API
 * (sem carregar o PDF inteiro em memória do worker). Elimina risco de OOM em
 * PDFs grandes (63 MB+). Files API aceita até 2 GB.
 */
const GEMINI_STREAM_THRESHOLD_BYTES = 30_000_000; // 30 MB

export type OcrHeartbeat = (stage: string, progress: number) => Promise<void> | void;

export type OcrProvider = "gemini" | "mistral" | "minimax" | "glm";

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
      providerRaw === "minimax" ? "minimax" :
      providerRaw === "glm" ? "glm" : "gemini";
    const geminiModel = map.phase1_gemini_model || "gemini-2.5-flash";
    return { provider, geminiModel };
  } catch (_e) {
    return { provider: "gemini", geminiModel: "gemini-2.5-flash" };
  }
}

/**
 * Executa OCR usando **exclusivamente** o provider configurado no DevPanel.
 *
 * Sem fallback silencioso para outro provider: se o provider escolhido falhar,
 * o erro é propagado direto ao caller. Exceção técnica: dentro do próprio
 * provider Gemini, modelos 3.x instáveis para PDF podem cair uma vez para
 * `gemini-2.5-flash`, registrando o modelo efetivo no resultado.
 *
 * MiniMax continua sinalizando `MINIMAX_CLIENT_RASTERIZE_ERROR` para o caller
 * delegar ao pipeline client-side (`runMinimaxClientOcr`); isso não é fallback
 * pago, é o fluxo canônico do MiniMax.
 */
export async function runOcrWithConfiguredProvider(
  pdfInput: Uint8Array | { blob: Blob; size: number },
  opts: { logPrefix?: string; onHeartbeat?: OcrHeartbeat } = {},
): Promise<OcrRouterResult> {
  const cfg = await getOcrRouterConfig();
  const prefix = opts.logPrefix || "[ocr-router]";

  const isBlobInput = !(pdfInput instanceof Uint8Array);
  const sizeBytes = isBlobInput ? pdfInput.size : pdfInput.byteLength;

  console.log(
    `${prefix} provider=${cfg.provider} model=${cfg.geminiModel} bytes=${sizeBytes} input=${isBlobInput ? "blob" : "bytes"}`,
  );

  const mistralKey = await getMistralAPIKey();
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  const minimaxKey = getMinimaxAPIKey();
  const glmKey = await getGlmAPIKey();

  const missingKey =
    (cfg.provider === "mistral" && !mistralKey) ||
    (cfg.provider === "minimax" && !minimaxKey) ||
    (cfg.provider === "glm" && !glmKey) ||
    (cfg.provider === "gemini" && !geminiKey);

  if (missingKey) {
    throw new Error(
      `Provider de OCR '${cfg.provider}' configurado no DevPanel está sem chave de API. ` +
      `Configure a chave correspondente ou troque o provider no DevPanel.`,
    );
  }

  const materializeBytes = async (): Promise<Uint8Array> => {
    if (!isBlobInput) return pdfInput;
    return new Uint8Array(await pdfInput.blob.arrayBuffer());
  };

  try {
    if (cfg.provider === "mistral") {
      const bytes = await materializeBytes();
      const r = await extractWithMistralOCR(bytes, mistralKey!);
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
    if (cfg.provider === "glm") {
      const bytes = await materializeBytes();
      await opts.onHeartbeat?.("ocr_processing", 25);
      const r = await extractWithGlmOCR(bytes, glmKey!);
      await opts.onHeartbeat?.("ocr_processing", 55);
      return { text: r.text, pageCount: r.pageCount, provider: r.provider, model: r.model };
    }

    // Gemini visual — streaming direto ao Files API para PDFs grandes (>30 MB).
    // Evita OOM: não materializa Uint8Array no worker, o stream é passado direto
    // ao fetch de upload. Files API aceita até 2 GB.
    if (sizeBytes > GEMINI_STREAM_THRESHOLD_BYTES && isBlobInput) {
      await opts.onHeartbeat?.("ocr_processing", 22);
      console.log(`${prefix} PDF ${(sizeBytes / 1024 / 1024).toFixed(2)}MB → streaming direto ao Gemini Files API`);
      const stream = pdfInput.blob.stream();
      const r = await extractVisualContent(
        { stream, size: sizeBytes },
        { model: cfg.geminiModel, useFilesAPI: true },
      );
      await opts.onHeartbeat?.("ocr_processing", 55);
      return {
        text: r.rawText,
        pageCount: r.pageCount,
        provider: r.provider || "gemini-streaming",
        model: r.model || cfg.geminiModel,
      };
    }

    // Caminho tradicional (<30 MB, ou caller ainda passou bytes)
    const bytes = await materializeBytes();
    await opts.onHeartbeat?.("ocr_processing", 30);
    const r = await extractVisualContent(bytes, { model: cfg.geminiModel });
    await opts.onHeartbeat?.("ocr_processing", 55);
    return {
      text: r.rawText,
      pageCount: r.pageCount,
      provider: r.provider || "gemini-visual",
      model: r.model || cfg.geminiModel,
    };
  } catch (e) {
    const err = e as Error;
    console.error(`${prefix} provider ${cfg.provider} falhou: ${err.message.slice(0, 400)}`);

    // MiniMax exige rasterização client-side — não é fallback, é fluxo canônico.
    // Nunca aciona fallback automático a partir deste erro.
    if (err.message?.includes(MINIMAX_CLIENT_RASTERIZE_ERROR)) {
      throw err;
    }

    // Fallback só ocorre se explicitamente configurado no DevPanel
    // (system_config.ocr_fallback_*). Defaults: propaga.
    // Neste hook, aceitamos fallback apenas para providers que rodam server-side
    // (gemini, mistral, glm) — MiniMax é excluído porque exige rasterização no browser.
    const decision = await resolveOcrFallback(cfg.provider, err, {
      restrictTo: ["gemini", "mistral", "glm"],
      logPrefix: `${prefix}[fallback]`,
    });
    if (decision.action === "propagate") {
      throw err;
    }

    // Fallback autorizado. Executa o provider configurado.
    if (decision.provider === "mistral") {
      if (!mistralKey) {
        throw new Error(
          `Fallback configurado para Mistral mas MISTRAL_API_KEY ausente. ` +
          `Configure a chave no DevPanel.`,
        );
      }
      const bytes = await materializeBytes();
      const r = await extractWithMistralOCR(bytes, mistralKey);
      return { text: r.text, pageCount: r.pageCount, provider: `${r.provider}-fallback`, model: r.model };
    }
    if (decision.provider === "gemini") {
      if (!geminiKey) {
        throw new Error(
          `Fallback configurado para Gemini mas GEMINI_API_KEY/LOVABLE_API_KEY ausente. ` +
          `Configure a chave no DevPanel.`,
        );
      }
      // Preferir streaming quando possível para não estourar memória.
      if (sizeBytes > GEMINI_STREAM_THRESHOLD_BYTES && isBlobInput) {
        const stream = pdfInput.blob.stream();
        const r = await extractVisualContent(
          { stream, size: sizeBytes },
          { model: cfg.geminiModel, useFilesAPI: true },
        );
        return {
          text: r.rawText,
          pageCount: r.pageCount,
          provider: `${r.provider || "gemini-streaming"}-fallback`,
          model: r.model || cfg.geminiModel,
        };
      }
      const bytes = await materializeBytes();
      const r = await extractVisualContent(bytes, { model: cfg.geminiModel });
      return {
        text: r.rawText,
        pageCount: r.pageCount,
        provider: `${r.provider || "gemini-visual"}-fallback`,
        model: r.model || cfg.geminiModel,
      };
    }
    if (decision.provider === "glm") {
      if (!glmKey) {
        throw new Error(
          `Fallback configurado para GLM mas GLM_API_KEY ausente. ` +
          `Configure a chave no DevPanel.`,
        );
      }
      const bytes = await materializeBytes();
      const r = await extractWithGlmOCR(bytes, glmKey);
      return { text: r.text, pageCount: r.pageCount, provider: `${r.provider}-fallback`, model: r.model };
    }
    // Não deveria chegar aqui (restrictTo filtrou), mas por segurança:
    throw err;
  }
}


