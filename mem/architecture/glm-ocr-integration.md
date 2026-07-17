---
name: GLM-OCR Integration (Z.AI)
description: Integração do GLM-OCR (Z.AI layout_parsing) como provider selecionável pelo DevPanel, com partes reais e funções curtas.
type: architecture
---

# GLM-OCR Integration (Z.AI)

Provider server-side adicionado como opção do DevPanel (principal ou fallback). Segue exatamente o padrão do Mistral: helper puro em `_shared/`, chamado a partir de `ocr-router.ts`. Nenhum outro caminho em código invoca GLM diretamente.

## Endpoint e limites

- URL: `POST https://api.z.ai/api/paas/v4/layout_parsing`
- Autenticação: `Authorization: Bearer ${GLM_API_KEY}`
- Modelo: `"glm-ocr"` (enum obrigatório do body)
- Body mínimo: `{ model, file }` onde `file` é URL pública **ou** data URL base64 (`data:application/pdf;base64,...`)
- Limites da API: PDF ≤ 50 MB, imagens ≤ 10 MB, **máximo 30 páginas por request**
- Paginação: campos `start_page_id` e `end_page_id` (1-based) para PDFs com > 30 páginas

## Divisão e orquestração segura

O limite de 50MB da API GLM é global para o PDF inteiro (não por página) — a paginação por `start_page_id/end_page_id` sozinha não resolve arquivos grandes, porque o binário é reenviado a cada chamada. Por isso a divisão acontece em **duas camadas complementares**:

1. **Física real (client-side, antes do upload).** Em `ImportarAutosDialog.tsx`, quando `ocrConfig.provider === "glm"`, o PDF é rasterizado e remontado diretamente em PDFs de partes via `rebuildPdfAsRasterParts(...)`. Nunca montar um PDF rasterizado único e depois remover páginas, pois isso pode carregar recursos/imagens órfãs do documento inteiro em cada parte. Limite defensivo atual: 20 páginas por parte e 48MB.

2. **OCR por função curta.** Cada parte GLM do Trabalhista é enviada para `trabalhista-ocr-part`, que processa apenas aquela parte e retorna texto. O browser concatena os textos e chama `processar-autos` com `preExtractedText` para estruturar e gerar resumos. Não voltar a processar todas as partes GLM dentro de um único `EdgeRuntime.waitUntil` longo.

3. **Lógica (server-side, dentro do helper).** Dentro de cada parte que chega no `extractWithGlmOCR`, se ainda houver mais de 30 páginas (não deveria após a divisão física, mas serve como segunda linha), o helper itera com `start_page_id/end_page_id` em blocos de 30 páginas e concatena os `md_results`.

Regra crítica aprendida: se um PDF rasterizado inteiro de 20MB gera 4 partes de 20MB, o split não é físico de verdade e está incorreto. Cada parte deve ser proporcional às páginas que contém.


## Formato de resposta relevante

```
{
  id, created, model,
  md_results: "# ...\n...",              // markdown consolidado do range
  data_info: { num_pages: 5, pages: [...] },
  usage: {...}
}
```

- `md_results` é normalmente uma **string**; o helper aceita array como fallback defensivo.
- `data_info.num_pages` = total real do PDF (não apenas do range) — usado para decidir se há mais chunks a pedir.

## Fluxo do helper (`supabase/functions/_shared/glm-ocr.ts`)

1. Valida `pdfBytes.byteLength ≤ 50MB`; excedido → `throw` (sem fallback silencioso).
2. Converte para data URL base64 em chunks de 0x8000 (evita stack overflow do `String.fromCharCode`).
3. Chama `layout_parsing` com `start_page_id=1, end_page_id=30`.
4. Se `data_info.num_pages > 30`, itera em janelas de 30 páginas até cobrir todas.
5. Concatena os markdowns com cabeçalho `=== PÁGINAS X-Y ===`.
6. Retorna `{ text, pageCount, provider: "glm-ocr", model: "glm-ocr", processingTimeMs }`.

Retry: 3 tentativas com backoff exponencial (500 ms → 1500 ms → 4500 ms) apenas para 429/5xx e erros de rede. 4xx (exceto 429) não retentam.

## Integração no roteador

`supabase/functions/_shared/ocr-router.ts`:

- `OcrProvider` inclui `"glm"`.
- `getOcrRouterConfig` reconhece `phase1_ocr_provider = "glm"`.
- Novo branch no `try` executa `extractWithGlmOCR(bytes, glmKey)`.
- `restrictTo` do `resolveOcrFallback` inclui `"glm"` (server-side, sem rasterização).
- Fallback autorizado para `"glm"` executa o mesmo helper e sufixa `-fallback` no provider retornado.

`supabase/functions/_shared/ocr-fallback.ts`: `KNOWN_PROVIDERS` inclui `"glm"`.

## DevPanel (`src/components/dev-panel/DevSettings.tsx`)

- `SelectItem value="glm"` em: (a) Provider principal de OCR, (b) Provider de fallback de OCR.
- Painel informativo condicional quando `phase1_ocr_provider === "glm"` mostra limites e alerta se `GLM_API_KEY` ausente.

## Regra de invocação

GLM só é chamado quando:
1. `phase1_ocr_provider = "glm"` (principal), **ou**
2. `ocr_fallback_enabled = true` e `ocr_fallback_provider = "glm"` (fallback explícito).

Nenhum caminho hardcoded no código invoca GLM. Vale a mesma regra dura de [ocr-fallback-devpanel-config](mem://architecture/ocr-fallback-devpanel-config).

## Secret

`GLM_API_KEY` (obtida em https://z.ai/manage-apikey/apikey-list). Sem esta secret configurada, seleção de GLM no DevPanel retorna erro claro no primeiro job — nunca cai silenciosamente em outro provider.
