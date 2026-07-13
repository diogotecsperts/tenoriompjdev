---
name: DevPanel AI config global scope
description: Config de IA (provider, modelo, OCR) do DevPanel vale para TODOS os módulos; sem fallback silencioso.
type: architecture
---

**Regra Core:** toda configuração de IA feita no DevPanel — provider padrão, modelo, provider de OCR,
modelo de OCR, chaves — DEVE valer para todos os módulos do app (Trabalhista,
Previdenciário, Impugnação e futuros). É proibido hardcodar provider ou modelo de IA em edge
function de módulo — sempre ler de `system_config` via os helpers existentes:
- `getAIConfig()` para geração de texto (Fase 2, campos, quesitos, etc).
- `runOcrWithConfiguredProvider()` para qualquer OCR de PDF.

Prompts e lógica de negócio ficam fora dessa regra: não são afetados pela troca de IA.

**Providers suportados na IA geral (`ai-config.ts`):**
`lovable`, `openai`, `gemini`, `claude`, `groq`, `deepseek`, `openrouter`, `minimax`.

**Providers suportados no OCR (`ocr-router.ts`):**
`gemini` (visual/Files API, single-shot), `mistral` (OCR endpoint nativo, single-shot),
`minimax` (chat multimodal, chunked/paralelo — ver `minimax-ocr-execution-strategy`).

**Hardcodes autorizados (identidade do provider, não configuração):**
- `"MiniMax-M3"` — id exato do modelo, case-sensitive (`callOpenAICompatible` força esse valor
  quando `provider === "minimax"` mesmo se `config.model` vier diferente).
- `"mistral-ocr-latest"` — id do endpoint de OCR do Mistral.
- `thinking: { type: "disabled" }` — sempre injetado para MiniMax e DeepSeek V4 (não-reasoner).
  Não expor na UI.

**Chaves de API:**
- MiniMax: `MINIMAX_API_KEY` (env), não usa `global_api_keys` — consistente com Mistral.
- Mistral OCR: `MISTRAL_API_KEY` (env).
- Demais providers: `global_api_keys` (tabela).

**Sem fallback silencioso no OCR (jul/2026):** `ocr-router.ts` **NÃO** faz mais cadeia
automática `escolhido → gemini → mistral → minimax`. Roda EXCLUSIVAMENTE o provider
configurado no DevPanel; se falhar, propaga o erro real ao caller. Fallback antigo gerou
cobrança inesperada da Mistral quando o Gemini 3.x quebrou por incompatibilidade de
`response_mime_type` em `generation_config` da Interactions API.

**Gemini 3.x — restrição de body:** modelos `gemini-3.*` rodam pela Interactions API
(`/v1beta/interactions`, background=true) e **NÃO** aceitam `response_mime_type` em
`generation_config`. A instrução de retorno JSON deve estar apenas no prompt.
Modelos `gemini-2.*` continuam aceitando `responseMimeType` no `generationConfig`
do `generateContent`.
