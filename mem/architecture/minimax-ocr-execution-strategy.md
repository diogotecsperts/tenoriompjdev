---
name: MiniMax OCR execution strategy
description: Chunking/paralelismo exclusivo do MiniMax M3 no OCR; Mistral e Gemini continuam single-shot.
type: architecture
---

**Escopo:** aplica-se APENAS ao provider MiniMax M3 quando escolhido como OCR.
Mistral e Gemini continuam single-shot por parte (splitter client-side de ~50 páginas alimenta 1 request).

**Motivo:** a API do MiniMax não tem endpoint OCR nativo — cada página tem que virar JPEG base64
dentro de um `messages[].content[]` de chat completions. Mandar 50 imagens num só request
estoura payload/timeout e sofre lost-in-the-middle.

**Parâmetros fixos em `supabase/functions/_shared/minimax-client.ts`:**
- Chunk = **10 páginas** por request (sweet spot recomendado pelo time do M3).
- Paralelismo = **4** requests simultâneos (semáforo com `nextIdx++`).
- Rasterização = **150 dpi**, JPEG qualidade **80** via `npm:mupdf@1.3.0` (WASM, funciona em Deno Deploy).
- Cross-chunk context = `role:"assistant"` com resumo ~200 tokens do chunk imediatamente anterior.
- Retry por chunk = **2 tentativas com backoff exponencial** (1.5s, 3s) apenas em 429/500/502/503/504.
- Falha de chunk = marca `[FALHA CHUNK páginas X-Y]` e **continua** — não perde o doc todo.
- `thinking: { type: "disabled" }` sempre — economia 30-40% de tokens de output, evita lixo.

**Não mudar esses números sem entender o trade-off:**
- Chunk <8: overhead de request domina.
- Chunk >12: precisão cai em páginas centrais.
- Paralelismo >6: 429 do MiniMax vira frequente.

**Se `npm:mupdf` falhar em runtime:** o `extractWithMinimaxOCR` lança erro claro e o `ocr-router.ts`
faz fallback automático para Gemini/Mistral. IA geral (chat) do MiniMax não depende disso.
