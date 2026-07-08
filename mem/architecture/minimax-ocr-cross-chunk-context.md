---
name: MiniMax OCR — cross-chunk context via assistant role
description: Regra técnica para passar resumo entre chunks preservando cache do system prompt.
type: feature
---
**Regra:** Resumo cross-chunk do MiniMax M3 vai SEMPRE como `role: "assistant"`, NUNCA como `system` message.

**Razões (LOVABLE-QA.md jul/2026):**
1. M3 cacheia system messages pelo hash do conteúdo. Mudar system a cada chunk invalida cache → perde `cached_tokens` (-80% no input cost).
2. Semântica correta: `assistant` = memória de turno; `system` = instrução persistente.
3. Padrão OpenAI/Anthropic.

**Formato:**
- Máximo 500 tokens (~2000 chars); truncar sempre
- Preferir formato estruturado (bullets ou JSON inline) — modelo atende melhor que prosa
- Conteúdo essencial: nomes, CPFs, CNJ, datas relevantes, assuntos-chave

**Checkpoint merge:** a cada 5 chunks, enviar `isCheckpoint: true` para o endpoint re-consolidar contexto e evitar degradação em documentos muito longos.

**Implementação:** `supabase/functions/minimax-ocr-chunk/index.ts` monta `[system estável] + [assistant resumo] + [user imagens+prompt]`.
