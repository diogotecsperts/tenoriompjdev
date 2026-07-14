---
name: OCR key management via DevPanel
description: Chaves de providers de OCR (Mistral, GLM) são gerenciadas na tabela global_api_keys via nova seção "Provedores de OCR" do DevPanel; edge functions leem DB primeiro, env como fallback.
type: architecture
---

# Gerenciamento de chaves dos providers de OCR

## Fonte primária: `global_api_keys` (DB) + fallback env

Os helpers de OCR (`supabase/functions/_shared/mistral-ocr.ts` e `glm-ocr.ts`) resolvem a chave nesta ordem, seguindo exatamente o padrão de `getGeminiApiKey` em `pdf-visual-extractor.ts`:

```ts
export async function getMistralAPIKey(): Promise<string | null> {
  // 1. consulta global_api_keys.id = 'mistral-ocr'
  // 2. cai para Deno.env.get('MISTRAL_API_KEY')
  // 3. retorna null se nenhum tiver valor
}
```

Mesma lógica para `getGlmAPIKey()` com `id = 'glm'` e env `GLM_API_KEY`.

**Consequência importante:** `getMistralAPIKey` e `getGlmAPIKey` são **`async` obrigatoriamente** — sempre `await`. Call sites atuais: `ocr-router.ts` (2×) e `processar-autos/index.ts` (4×).

## UI: tabela "Provedores de OCR" no DevPanel

Componente: `src/components/dev-panel/DevSettings.tsx`.

- Array `OCR_PROVIDERS` (separado de `AI_PROVIDERS`) contém `mistral-ocr` (`mistral-ocr-latest`) e `glm` (`glm-ocr`).
- Nova `<Card>` renderiza esses providers em uma `<Table>` gêmea do "Provider Inventory v2.0", logo abaixo dele.
- `renderProviderRow(provider, 'ocr')` esconde crown/pin e desabilita `selectProvider` — providers de OCR **não** entram na Fase 2 (preenchimento).
- Filtros de Fase 2 (`text_fill_provider`) iteram apenas `AI_PROVIDERS`, então os providers de OCR ficam naturalmente fora.
- `saveApiKey/deleteApiKey/testConnection` gravam/lêem `global_api_keys` — mesma mecânica dos generalistas.
- `test-ai-connection` tem branches dedicadas para `mistral-ocr` (GET `/v1/models`) e `glm` (POST `layout_parsing` com body incompleto — 400 = auth OK, 401/403 = auth falhou).

## Regra de não-duplicação

Gemini e MiniMax também fazem OCR, mas continuam com chave gerenciada exclusivamente no Provider Inventory principal (não aparecem duas vezes). Uma nota logo acima da tabela de OCR explicita isso.

## Zero-hardcode e RLS

- RLS de `global_api_keys` continua restrita a `is_developer()`. Não editar.
- Nenhum caminho de código invoca Mistral ou GLM sem seleção explícita via DevPanel (`phase1_ocr_provider` ou `ocr_fallback_provider`), mantendo a regra descrita em [ocr-fallback-devpanel-config](mem://architecture/ocr-fallback-devpanel-config).
