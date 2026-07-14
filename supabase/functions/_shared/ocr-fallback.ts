/**
 * OCR Fallback Policy — leitura centralizada de `system_config.ocr_fallback_*`.
 *
 * REGRA DURA (nunca hardcodada):
 *   Nenhum provider de OCR pode ser invocado como fallback automático sem
 *   estar explicitamente configurado no DevPanel. Se o provider principal
 *   falhar e nenhuma configuração explícita existir, o erro é propagado.
 *
 * Defaults deste helper (rollout seguro):
 *   ocr_fallback_enabled           = false
 *   ocr_fallback_provider          = "none"
 *   ocr_fallback_on_size_exceeded  = false
 *
 * Com esses defaults, `resolveOcrFallback` SEMPRE retorna { action: "propagate" }.
 * Só quando o usuário entra no DevPanel, liga o toggle master e escolhe um
 * provider específico é que o fallback passa a ocorrer.
 *
 * Este arquivo é a única fonte de verdade para decisões de fallback de OCR.
 * Nenhum arquivo em `supabase/functions/*` deve encadear providers "no braço"
 * — sempre consultar `resolveOcrFallback` antes de tentar outro provider.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OcrProvider } from "./ocr-router.ts";

export type OcrFallbackProvider = OcrProvider | "none";

export interface OcrFallbackConfig {
  enabled: boolean;
  fallbackProvider: OcrFallbackProvider;
  fallbackOnSizeExceeded: boolean;
}

/**
 * Defaults seguros — nenhum caminho em código invoca outro provider sem
 * escolha explícita no DevPanel.
 */
const SAFE_DEFAULTS: OcrFallbackConfig = {
  enabled: false,
  fallbackProvider: "none",
  fallbackOnSizeExceeded: false,
};

const KNOWN_PROVIDERS: readonly OcrFallbackProvider[] = [
  "none",
  "gemini",
  "mistral",
  "minimax",
  "glm",
] as const;

function parseBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  if (v && typeof v === "object" && "value" in v) {
    // deno-lint-ignore no-explicit-any
    return parseBool((v as any).value, fallback);
  }
  return fallback;
}

function parseProvider(v: unknown): OcrFallbackProvider {
  const raw = typeof v === "string"
    ? v
    // deno-lint-ignore no-explicit-any
    : (v && typeof v === "object" && "value" in v) ? String((v as any).value ?? "") : "";
  const s = raw.trim().toLowerCase();
  return (KNOWN_PROVIDERS as readonly string[]).includes(s)
    ? (s as OcrFallbackProvider)
    : "none";
}

/**
 * Lê as 3 configs de fallback em `system_config`. Qualquer erro → defaults
 * seguros (fallback desligado).
 */
export async function getOcrFallbackConfig(): Promise<OcrFallbackConfig> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return { ...SAFE_DEFAULTS };

    const admin = createClient(url, key);
    const { data, error } = await admin
      .from("system_config")
      .select("id, value")
      .in("id", [
        "ocr_fallback_enabled",
        "ocr_fallback_provider",
        "ocr_fallback_on_size_exceeded",
      ]);

    if (error || !data) return { ...SAFE_DEFAULTS };

    const map: Record<string, unknown> = {};
    for (const row of data) {
      // deno-lint-ignore no-explicit-any
      map[(row as any).id] = (row as any).value;
    }

    return {
      enabled: parseBool(map.ocr_fallback_enabled, SAFE_DEFAULTS.enabled),
      fallbackProvider: parseProvider(map.ocr_fallback_provider),
      fallbackOnSizeExceeded: parseBool(
        map.ocr_fallback_on_size_exceeded,
        SAFE_DEFAULTS.fallbackOnSizeExceeded,
      ),
    };
  } catch (_e) {
    return { ...SAFE_DEFAULTS };
  }
}

export type OcrFallbackDecision =
  | { action: "propagate"; reason: string }
  | { action: "fallback"; provider: OcrProvider; reason: string };

/**
 * Decide se um erro de OCR do provider `primaryProvider` deve disparar
 * fallback para outro provider. Regras:
 *
 * - Se `enabled === false`                       → propaga.
 * - Se `fallbackProvider === "none"`             → propaga.
 * - Se `fallbackProvider === primaryProvider`    → propaga (evita loop).
 * - Se `restrictTo` foi passado e o fallback     → propaga (o call-site só aceita
 *   configurado não está na lista permitida         alguns providers).
 * - Caso contrário                               → fallback para o provider configurado.
 *
 * A decisão nunca depende do tipo do erro. Se o usuário configurou fallback,
 * qualquer erro do primário aciona o fallback. Se não configurou, nenhum erro
 * dispara fallback.
 */
export async function resolveOcrFallback(
  primaryProvider: OcrProvider,
  _error: unknown,
  opts: { restrictTo?: readonly OcrProvider[]; logPrefix?: string } = {},
): Promise<OcrFallbackDecision> {
  const cfg = await getOcrFallbackConfig();
  const prefix = opts.logPrefix || "[ocr-fallback]";

  if (!cfg.enabled) {
    console.log(`${prefix} fallback DESLIGADO (ocr_fallback_enabled=false) → propagando erro de '${primaryProvider}'`);
    return { action: "propagate", reason: "disabled" };
  }
  if (cfg.fallbackProvider === "none") {
    console.log(`${prefix} nenhum provider de fallback configurado → propagando erro de '${primaryProvider}'`);
    return { action: "propagate", reason: "no-provider" };
  }
  if (cfg.fallbackProvider === primaryProvider) {
    console.log(`${prefix} fallback === primário ('${primaryProvider}') → propagando (evita loop)`);
    return { action: "propagate", reason: "same-as-primary" };
  }
  if (opts.restrictTo && !opts.restrictTo.includes(cfg.fallbackProvider as OcrProvider)) {
    console.log(
      `${prefix} fallback configurado='${cfg.fallbackProvider}' não é aceito neste caminho ` +
      `(permitidos: ${opts.restrictTo.join(",")}) → propagando`,
    );
    return { action: "propagate", reason: "not-supported-here" };
  }

  console.log(
    `${prefix} fallback ATIVADO: '${primaryProvider}' → '${cfg.fallbackProvider}' (config explícita do DevPanel)`,
  );
  return {
    action: "fallback",
    provider: cfg.fallbackProvider as OcrProvider,
    reason: "configured",
  };
}

/**
 * Helper de decisão para o gate de tamanho: "trocar Mistral por outro provider
 * quando arquivo > 45 MB" só ocorre se BOTH: (1) fallback está ligado E
 * (2) `ocr_fallback_on_size_exceeded` está ligado E (3) o fallbackProvider é
 * um dos aceitos pelo call-site.
 *
 * Retorna null quando o gate NÃO deve disparar (comportamento default).
 */
export async function resolveSizeExceededFallback(
  primaryProvider: OcrProvider,
  opts: { restrictTo?: readonly OcrProvider[]; logPrefix?: string } = {},
): Promise<{ provider: OcrProvider } | null> {
  const cfg = await getOcrFallbackConfig();
  const prefix = opts.logPrefix || "[ocr-fallback-size]";

  if (!cfg.enabled || !cfg.fallbackOnSizeExceeded || cfg.fallbackProvider === "none") {
    console.log(
      `${prefix} gate de tamanho DESLIGADO (enabled=${cfg.enabled}, onSize=${cfg.fallbackOnSizeExceeded}, provider=${cfg.fallbackProvider}) → primary '${primaryProvider}' continuará tentando`,
    );
    return null;
  }
  if (cfg.fallbackProvider === primaryProvider) return null;
  if (opts.restrictTo && !opts.restrictTo.includes(cfg.fallbackProvider as OcrProvider)) {
    console.log(`${prefix} fallback '${cfg.fallbackProvider}' não suportado neste caminho → mantém primário`);
    return null;
  }
  console.log(`${prefix} gate de tamanho ATIVO: substituindo '${primaryProvider}' por '${cfg.fallbackProvider}' (config explícita)`);
  return { provider: cfg.fallbackProvider as OcrProvider };
}
