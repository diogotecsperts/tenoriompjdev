---
name: OCR Fallback via DevPanel (Bloco A)
description: Fallback de OCR agora é decidido em system_config.ocr_fallback_*. Nenhum arquivo pode encadear providers hardcoded — sempre via resolveOcrFallback. Defaults nunca invocam Mistral sem escolha explícita.
type: constraint
---
Fallback de OCR é decidido **exclusivamente** em `system_config`:
- `ocr_fallback_enabled` (default `false`) — master switch.
- `ocr_fallback_provider` (default `"none"`) — none | gemini | mistral | minimax.
- `ocr_fallback_on_size_exceeded` (default `false`) — só ativa o gate "PDF > 45 MB pula Mistral".

Regras duras:
- Nenhum arquivo em `supabase/functions/*/index.ts` pode encadear providers de OCR
  hardcoded (try Gemini → catch → try Mistral, ou similar). Toda decisão passa
  por `resolveOcrFallback` (ou `resolveSizeExceededFallback`) em
  `supabase/functions/_shared/ocr-fallback.ts`.
- **Why:** o incidente da Mistral cobrar por chamadas que o usuário não autorizou
  aconteceu justamente por fallbacks silenciosos. Com defaults seguros (`enabled=false`,
  `provider="none"`), o sistema nunca invoca outro provider sem o usuário entrar no
  DevPanel, ligar o toggle master e escolher explicitamente o fallback.
- **Como aplicar:** ao adicionar/editar código de OCR nas edge functions, jamais
  chamar `extractWithMistralOCR`/`extractVisualContent`/`getMinimaxAPIKey` como
  cadeia try→catch→outro-provider. Se precisar de fallback, consultar
  `resolveOcrFallback(primary, error, { restrictTo, logPrefix })`; se `action ===
  "propagate"`, rethrow. Se `action === "fallback"`, executar o `decision.provider`.

Chamadas primárias ao provider escolhido no DevPanel continuam via
`runOcrWithConfiguredProvider` (`ocr-router.ts`), que já lê `phase1_ocr_provider`
e agora também consulta `resolveOcrFallback` no catch final (mesmo padrão).

Sites cirurgicamente adaptados em `processar-autos/index.ts`:
- L1141 (Gemini→Mistral em split por partes).
- L1663 (chunked hardcoded Mistral → agora usa `runOcrWithConfiguredProvider`).
- L2440 (`shouldSkipMistral` por >45 MB → gate `resolveSizeExceededFallback`).
- L2470 (Mistral key ausente → throw explícito em vez de fallback silencioso).
- L2636 (Mistral falhou → gate para Gemini).
- L2767 (Gemini "capacity error" → gate para Mistral).

Se um dia esses sites forem reescritos, manter o princípio: **defaults nunca
invocam Mistral ou outro provider sem escolha explícita no DevPanel**.
