## Estratégia: MiniMax M3 OCR para PDFs grandes
Rasterização client-side + fila paralela + cross-chunk via `assistant` role. Baseado em dados oficiais MiniMax jul/2026 (LOVABLE-QA.md).

## Parâmetros validados
- **Chunk**: 10 páginas (sweet spot 8-12)
- **Imagem**: 1500px maior lado, JPEG q=0.80 (~3k tokens/img)
- **Paralelismo**: 3 sustentado, 6 burst, backoff 1/2/4/8s no HTTP 429
- **Cross-chunk**: `role: assistant` com resumo ≤500 tokens (preserva cache, -80% input)
- **Checkpoint merge**: a cada 5 chunks re-envia consolidado
- **API**: `thinking:{type:"disabled"}`, `temperature:0`, `response_format:{type:"json_object"}`

## Arquivos

### 1. `src/lib/minimax-ocr-client.ts` (novo, browser)
- `rasterizePdfForMinimax(file, opts)` via `pdfjs-dist`
- Fila com 3 paralelas (`p-limit`), burst 6, backoff exponencial respeitando `Retry-After`
- Checkpoint merge automático
- Retorna texto concatenado + JSONs estruturados por chunk

### 2. `supabase/functions/minimax-ocr-chunk/index.ts` (novo)
- Body: `{ images:b64[], contextSummary, chunkIndex, isCheckpoint? }`
- Mensagens: `system` (estável, cacheado) + `assistant` (resumo) + `user` (imagens+prompt)
- Zero CPU pesada — só HTTP para `api.minimax.io`
- Retorna `{ text, summary, structured }`

### 3. `supabase/functions/_shared/prompts/minimax-ocr.ts` (novo)
- `OCR_SYSTEM_PROMPT`: regras + schema JSON completo (do QA doc)
- Templates: `receita_medica`, `certidao`, genérico
- Anti-markdown, null em vez de invenção (LGPD-safe), preserva CNJ/CPF/RG formatados

### 4. `supabase/functions/_shared/minimax-client.ts` (limpar)
- Remover `rasterizePdfPages`, dependência `npm:mupdf`, `extractWithMinimaxOCR`
- Manter `callMinimaxChat` (IA geral) intacto

### 5. `supabase/functions/_shared/ocr-router.ts`
- Branch `minimax` retorna `{ mode: "client-rasterize", chunkEndpoint: "minimax-ocr-chunk" }`
- Gemini/Mistral inalterados

### 6. `prev-pre-processar` + `processar-autos`
- Detectar sinal `client-rasterize`, delegar ao frontend
- Após texto concatenado, seguir fluxo normal de extração/geração

### 7. Frontend (hooks de importação Prev + Trabalhista)
- Detectar sinal, chamar `rasterizePdfForMinimax`, aguardar conclusão, prosseguir

### 8. DevPanel — OCR card
- Copy MiniMax: *"Rasterização no navegador. Ótimo para PDFs grandes (100+ páginas). 3 chunks paralelos, backoff automático."*

### 9. Memórias
- Atualizar `mem://architecture/minimax-ocr-execution-strategy.md` com parâmetros oficiais
- Nova `mem://architecture/minimax-ocr-cross-chunk-context.md`

## Não muda
Gemini, Mistral, IA geral (chat), Impugnação, config global DevPanel, prompts de geração existentes.

## Trade-off aceito
Files API do MiniMax para PDF direto não é bulletproof ainda — mantemos rasterização client-side. Migração futura quando MiniMax documentar `mm_file://` para documentos em chat completion.
