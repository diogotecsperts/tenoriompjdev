
# Plano final — MiniMax M3 + clarificação do toggle de estratégia

Secret `MINIMAX_API_KEY` já salva (formato `sk-cp-...`, sem prefixo `Bearer`). O código injeta o `Authorization: Bearer <token>` na chamada.

## Etapa 1 — Cliente MiniMax compartilhado

Novo `supabase/functions/_shared/minimax-client.ts`.

**Constantes fixas (não configuráveis):**
- Endpoint: `POST https://api.minimax.io/v1/chat/completions`
- Model: `MiniMax-M3` (case-sensitive)
- `thinking: { type: "disabled" }` sempre injetado em TODOS os requests, tanto IA geral quanto OCR
- `temperature: 0` como default (caller pode sobrescrever pra IA geral se precisar)

**Duas funções exportadas:**

**A) `callMinimaxChat({ messages, maxTokens, temperature?, jsonMode? })`** — chat OpenAI-compatible padrão, usado pela IA geral. Sem chunking, sem paralelismo. Um request, uma resposta.

**B) `extractWithMinimaxOCR(pdfBytes, opts)`** — OCR **chunked exclusivo do MiniMax**:
- Rasteriza páginas em PNG usando `npm:mupdf` (WASM, funciona em Deno edge).
- **Chunk = 10 páginas** por request, **paralelismo = 4** requests simultâneos.
- Prompt: "transcreva TUDO em texto puro, marque `--- Página N ---` entre elas".
- **Cross-chunk context:** injeta `role: "assistant"` com resumo de ~200 tokens do chunk anterior.
- **Retry por chunk** (2 tentativas, backoff): se um falha, marca `[FALHA CHUNK páginas X-Y]` e continua.
- Erros do M3-REFERENCE: 401, 413, 429/500/502 tratados especificamente.
- Retorna `{ text, pageCount, provider: "minimax-ocr", model: "MiniMax-M3" }` — mesma shape que Mistral/Gemini.

**Reforço:** Mistral e Gemini continuam single-shot. Chunking é exclusivo do MiniMax porque a API dele não tem endpoint OCR nativo — cada página vira imagem base64 e mandar 50 num request só estoura payload/timeout.

## Etapa 2 — OCR Router aceita MiniMax

`supabase/functions/_shared/ocr-router.ts`:
- Tipo `provider: "gemini" | "mistral" | "minimax"`.
- Branch novo chamando `extractWithMinimaxOCR`.
- Cadeia de fallback quando chave escolhida falta: `escolhido → gemini → mistral → minimax` (ordem que tiver chave). Loga o motivo.

Nenhum módulo (`processar-autos`, `prev-pre-processar`, `extrair-texto-pdf`) muda — todos passam pelo router.

## Etapa 3 — Provider Inventory v2.0 (IA geral)

`DevSettings.tsx` + `DevUserSettings.tsx`: nova entrada em `AI_PROVIDERS`:
```
{ id: "minimax", name: "MiniMax", description: "MiniMax M3 — chat multimodal, thinking desativado.",
  models: ["MiniMax-M3"], requiresKey: true }
```
Aparece automaticamente no grid, no seletor de Provider Padrão e nos Fallbacks. Espelhado em user settings pra respeitar hierarquia global vs. usuário.

## Etapa 4 — Roteamento de IA geral no backend

`supabase/functions/_shared/ai-config.ts`:
- Adicionar `minimax: 'https://api.minimax.io/v1/chat/completions'` em `PROVIDER_ENDPOINTS`.
- Adicionar `minimax: 'MiniMax-M3'` em `DEFAULT_MODELS`.
- `getAIConfig`: quando `provider === 'minimax'`, ler chave do `MINIMAX_API_KEY` (env), não da tabela `global_api_keys` — consistente com Mistral.
- `callProvider`: `case 'minimax'` roteia para `callOpenAICompatible` com injeção do `thinking: { type: 'disabled' }` no body (mesmo padrão que DeepSeek já usa).

Nenhum prompt mudado. Nenhum campo do laudo alterado.

## Etapa 5 — MiniMax no seletor de OCR

Card "Extração de PDF" (e sub-bloco "Fase 1"): terceira opção `MiniMax M3`. Sem sub-seletor de modelo (M3 é único). Aviso curto: "Executa em chunks de 10 páginas com paralelismo — mais resiliente para PDFs grandes, latência ~15–25s por parte."

## Etapa 6 — Correção da UI do toggle "Estratégia de Importação"

Diagnóstico: o toggle **só afeta o Trabalhista** (`processar-autos`), mas a UI dá a entender que rege todo o app. Realidade:

- **Passagem única:** Trabalhista manda PDF direto pro modelo do Provider Inventory (OCR + preenchimento em um só request). Card "Extração de PDF" fica ocioso no Trabalhista.
- **Duas fases:** Trabalhista faz Fase 1 (OCR via card "Extração de PDF") + Fase 2 (preenchimento via Provider Inventory). Economia ~60%.
- **Prev e Impugnação:** sempre usam o card "Extração de PDF" via `runOcrWithConfiguredProvider`, **independente do toggle**.

Correções de copy (sem mudar comportamento):

1. Subtítulo do card "Estratégia de Importação" (linha ~2411): "Afeta apenas o pipeline de importação do módulo **Trabalhista**. Previdenciário e Impugnação sempre usam o card 'Extração de PDF' abaixo."
2. Subtítulo do card "Extração de PDF" (linha ~1990–1995): reescrever para "Provider e modelo usados para OCR em **todos os módulos** (Trabalhista em duas fases; Previdenciário e Impugnação sempre)." Remover o badge "Inativo (modo duas fases)" e o `opacity-60`, porque o card está ativo para Prev/Impugnação mesmo em Passagem Única — a UI atual é enganosa.

## Etapa 7 — Memórias

- Atualizar `mem://architecture/devpanel-ai-config-global-scope`: incluir MiniMax + registrar que `MiniMax-M3` é único hardcode permitido e `thinking:{type:"disabled"}` é fixo.
- Criar `mem://architecture/minimax-ocr-execution-strategy`: chunk=10 páginas, paralelismo=4, cross-chunk assistant summary, retry por chunk. Exclusivo do MiniMax.
- Criar `mem://architecture/import-strategy-toggle-scope`: toggle single_pass vs two_phase **só afeta o Trabalhista**. Prev e Impugnação sempre usam o card "Extração de PDF".

## O que NÃO muda

- Prompts, schemas, UI de laudo, DB — zero alteração.
- Mistral e Gemini — single-shot por parte, como sempre.
- Splitter client-side (20MB / 50 páginas) — alimenta os 3 providers.
- `thinking` do MiniMax — sempre desabilitado, não exposto na UI.

## Defaults que vou usar sem perguntar de novo

- Fallback quando MiniMax escolhido e chave falha: `minimax → gemini → mistral`.
- Chunk MiniMax OCR: `10 páginas × 4 paralelos` (recomendação do M3-REFERENCE).
- Rasterização: `npm:mupdf` (WASM, sem dep nativa, roda em Deno Deploy).

## Riscos conhecidos

- `npm:mupdf` em Deno Deploy: se o WASM não carregar corretamente no runtime, MiniMax OCR falha de forma limpa (throw com mensagem clara) e o router faz fallback pra Gemini automaticamente. IA geral (chat) do MiniMax não depende disso e funciona independentemente.
