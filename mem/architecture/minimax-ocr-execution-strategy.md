---
name: MiniMax OCR — estratégia client-rasterize + chunk endpoint
description: Rasterização no navegador (pdfjs) + minimax-ocr-chunk. Parâmetros oficiais MiniMax jul/2026.
type: feature
---
**Regra:** OCR do MiniMax M3 NUNCA roda dentro de edge function (rasterizar WASM estoura ~2s de CPU → WORKER_RESOURCE_LIMIT / 546). Sempre client-side.

**Arquitetura:**
- `src/lib/minimax-ocr-client.ts` → `runMinimaxClientOcr(fileOrBlob, opts)` rasteriza no browser via `pdfjs-dist` e orquestra chunks
- `supabase/functions/minimax-ocr-chunk/index.ts` → endpoint fino, só HTTP para `api.minimax.io`, zero CPU pesada
- `supabase/functions/_shared/ocr-router.ts` → branch `minimax` LANÇA `MINIMAX_CLIENT_RASTERIZE_ERROR`; callers detectam via `isMinimaxClientRasterizeError(e)` e respondem 409 com `{ needsClientRasterize: true, pdfPath, bucket, chunkEndpoint }`
- Frontend detecta 409, baixa PDF do storage, roda OCR client-side, re-invoca a edge function passando `preExtractedText`

**Parâmetros validados (LOVABLE-QA.md jul/2026):**
- Chunk: 10 páginas (sweet spot 8-12; >30 degrada severamente lost-in-the-middle)
- Imagem: 1500px maior lado + JPEG q=0.80 (~3k tokens/img)
- Paralelismo: 3 sustentado, 6 burst curto (RPM 200 do Plus plan; 4+ sustentado estoura)
- Cross-chunk context: `role: "assistant"` com resumo ≤500 tokens (~2000 chars) — NUNCA system message (invalida cache, perde -80% cached_tokens)
- Checkpoint merge: a cada 5 chunks (`isCheckpoint: true`) para re-consolidar contexto
- Body request: até 50MB (teto 64MB), 10MB por imagem
- API fixa: `thinking: {type:"disabled"}`, `temperature: 0`, `response_format: {type:"json_object"}`
- Retry: backoff 1s→2s→4s em 429/5xx respeitando `Retry-After`

**Prompts:** `supabase/functions/_shared/prompts/minimax-ocr.ts`
- `MINIMAX_OCR_SYSTEM_PROMPT`: estável entre chunks (cacheia), schema JSON completo, regras LGPD-safe (null em vez de invenção), preserva CNJ/CPF/RG formatados, anti-markdown
- `buildMinimaxOcrUserText(chunkIndex, pageStart, pageEnd, isCheckpoint)`: instrução por chunk

**Integração backend (contrato):**
Edge functions que ofereçam OCR devem aceitar `preExtractedText` + `preExtractedProvider/Model/PageCount` e pular download+OCR quando presentes. Ver `prev-pre-processar/index.ts` como referência canônica. Aplicar o mesmo pattern ao adicionar novos módulos.

**Files API MiniMax para PDF direto:** não usar em chat completion enquanto MiniMax não documentar explicitamente `mm_file://` para documents. Recomendação oficial deles: manter rasterização client-side.
