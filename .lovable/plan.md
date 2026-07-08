
# Plano final — MiniMax M3 + clarificação do toggle de estratégia

## Etapa 1 — Secret

`MINIMAX_API_KEY` via `add_secret`. Sem chave, provider é ignorado com fallback silencioso.

## Etapa 2 — Cliente MiniMax compartilhado

Novo `supabase/functions/_shared/minimax-client.ts`.

**Constantes fixas (não configuráveis):**
- Endpoint: `POST https://api.minimax.io/v1/chat/completions`
- Model: `MiniMax-M3` (case-sensitive; único hardcode permitido — é identidade do provider)
- `thinking: { type: "disabled" }` sempre injetado em TODOS os requests, tanto IA geral quanto OCR
- `temperature: 0` como default (o caller pode sobrescrever pra IA geral se precisar de criatividade)

**Duas funções exportadas:**

**A) `callMinimaxChat({ messages, maxTokens, temperature?, jsonMode? })`** — chat OpenAI-compatible padrão. Usado pela IA geral. **Sem chunking, sem paralelismo, sem estratégia especial.** Um request, uma resposta. Igual a chamar OpenRouter ou Gemini via SDK.

**B) `extractWithMinimaxOCR(pdfBytes, opts)`** — OCR **chunked exclusivo do MiniMax**:
- Rasteriza páginas em JPEG ~150 dpi (reusa rasterizador do `pdf-visual-extractor.ts`).
- **Chunk = 10 páginas** por request, **paralelismo = 4** requests simultâneos (semáforo simples).
- Prompt: "transcreva TUDO em texto puro, marque `--- Página N ---` entre elas".
- **Cross-chunk context:** injeta `role: "assistant"` com resumo curto (~200 tokens) do chunk anterior, conforme o M3-REFERENCE sugeriu.
- **Retry por chunk** (2 tentativas com backoff): se um chunk falha, marca `[FALHA CHUNK páginas X-Y]` no texto e **continua** o resto. Não perde o doc inteiro.
- Erros do M3-REFERENCE: 401 → mensagem clara; 413 → sinaliza imagem grande; 429/500/502 → retry com backoff.
- Retorna `{ text, pageCount, provider: "minimax-ocr", model: "MiniMax-M3" }` — **mesma shape** de Mistral/Gemini, então nenhum caller precisa mudar.

**Reforço:** Mistral e Gemini continuam single-shot. Chunking é exclusivo do MiniMax porque a API dele não tem endpoint OCR nativo — cada página tem que virar imagem base64, e mandar 50 imagens num request só estoura payload/timeout. Nos outros, single-shot funciona bem e não muda.

## Etapa 3 — OCR Router aceita MiniMax

`supabase/functions/_shared/ocr-router.ts`:
- Tipo `provider: "gemini" | "mistral" | "minimax"`.
- Branch chamando `extractWithMinimaxOCR`.
- Cadeia de fallback quando a chave escolhida está ausente: `escolhido → gemini → mistral → minimax` (na ordem que tiver chave disponível). Loga o motivo.

Nenhum módulo (`processar-autos`, `prev-pre-processar`, `extrair-texto-pdf`) muda — todos já passam pelo router.

## Etapa 4 — Provider Inventory v2.0 (IA geral)

`DevSettings.tsx` + `DevUserSettings.tsx`: nova entrada em `AI_PROVIDERS`:
```
{ id: "minimax", name: "MiniMax", description: "MiniMax M3 — chat multimodal, thinking desativado.",
  models: ["MiniMax-M3"], requiresKey: true }
```
Aparece automaticamente no grid, no seletor de Provider Padrão e nos Fallbacks. Espelhado em user settings para respeitar a hierarquia global vs. usuário.

## Etapa 5 — Roteamento de IA geral

Onde `getAIConfig()` é consumido, adicionar `else if (provider === "minimax") await callMinimaxChat(...)`. Nenhum prompt mudado. Nenhum campo do laudo alterado.

## Etapa 6 — MiniMax no seletor de OCR

Card "Extração de PDF" (e sub-bloco "Fase 1" quando duas fases): terceira opção `MiniMax M3`. Sem sub-seletor de modelo (M3 é único). Aviso curto: "Executa em chunks de 10 páginas com paralelismo — mais resiliente para PDFs grandes, latência ~15–25s por parte."

## Etapa 7 — Correção da UI do toggle "Estratégia de Importação"

Diagnóstico atual: o toggle **só afeta o Trabalhista** (`processar-autos`), mas a UI dá a entender que rege todo o app. Realidade:

- **Passagem única:** Trabalhista manda o PDF direto pro modelo do Provider Inventory (OCR + preenchimento em um só request). O card "Extração de PDF" fica ocioso **no Trabalhista** nesse modo.
- **Duas fases:** Trabalhista faz Fase 1 (OCR via card "Extração de PDF") + Fase 2 (preenchimento via Provider Inventory). Economia ~60%.
- **Prev e Impugnação:** sempre usam o card "Extração de PDF" via `runOcrWithConfiguredProvider`, **independente do toggle**.

Correções de copy (sem mudar comportamento):

1. Subtítulo do card "Estratégia de Importação" (linha ~2405): esclarecer "Afeta apenas o pipeline de importação do módulo **Trabalhista**. Previdenciário e Impugnação sempre usam o card 'Extração de PDF' abaixo."
2. Subtítulo do card "Extração de PDF" (linha ~1991): mover o aviso "vale pra todos os módulos" pra fora do sub-bloco condicional, para ficar visível independente da estratégia. Texto: "Provider e modelo usados para OCR em **todos os módulos** (Trabalhista em duas fases, Previdenciário e Impugnação sempre)."

## Etapa 8 — Memórias

- Atualizar `mem://architecture/devpanel-ai-config-global-scope`: incluir MiniMax + registrar que `"MiniMax-M3"` é o único hardcode permitido, e que `thinking: {type:"disabled"}` é fixo.
- Criar `mem://architecture/minimax-ocr-execution-strategy`: chunk=10 páginas, paralelismo=4, cross-chunk assistant summary, retry por chunk. **Exclusivo do MiniMax** — Mistral e Gemini permanecem single-shot.
- Criar `mem://architecture/import-strategy-toggle-scope`: toggle single_pass vs two_phase **só afeta o Trabalhista**. Prev e Impugnação sempre usam o card "Extração de PDF". Evita confusão futura.

## O que NÃO muda

- Prompts, schemas, UI de laudo, DB — zero alteração.
- Mistral e Gemini — single-shot por parte, como sempre.
- Splitter client-side (20MB / 50 páginas) — alimenta os 3 providers.
- Toggle "Estratégia de Importação" — comportamento igual, só a copy fica mais clara.
- `thinking` do MiniMax — sempre desabilitado, não fica exposto na UI.

## Perguntas restantes (opcional — posso usar defaults)

1. **Ordem do fallback quando MiniMax é escolhido e a chave falhar:** default sugerido `minimax → gemini → mistral`. OK?
2. **Chunk/paralelismo do MiniMax OCR:** default sugerido `10 × 4` (recomendação do próprio time do M3). Prefere começar conservador `8 × 3`?

Se você não responder essas duas, vou com os defaults acima.
