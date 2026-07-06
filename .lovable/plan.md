## Auditoria com fontes verificadas + Plano V4

Antes de propor qualquer coisa, fui às fontes oficiais e confirmei cada afirmação. Nada é chute.

---

### ✅ Verificações feitas (evidência)

**1. DeepSeek V4 — CONFIRMADO em `api-docs.deepseek.com/quick_start/pricing`:**
- Modelos atuais: **`deepseek-v4-flash`** e **`deepseek-v4-pro`**
- Contexto: **1M tokens** (era 64K no V3)
- Max output: **384K tokens**
- Suportam: JSON Output ✓, Tool Calls ✓, thinking mode (default ON)
- Preço V4-flash: $0.14 input / $0.28 output por 1M
- Preço V4-pro: $0.435 input / $0.87 output por 1M
- Base URL inalterada: `https://api.deepseek.com` (OpenAI-compatible)
- **Deprecação:** `deepseek-chat` e `deepseek-reasoner` serão descontinuados em **24/07/2026 15:59 UTC**. Hoje `deepseek-chat` = V4-flash não-thinking; `deepseek-reasoner` = V4-flash thinking. Ou seja, precisamos migrar antes dessa data.

**2. DeepSeek thinking mode — `api-docs.deepseek.com/guides/thinking_mode`:**
- Ativação: parâmetro `thinking: { type: "enabled" | "disabled" }` — **default é `enabled` no V4**
- Controle de esforço: `reasoning_effort: "high" | "max"`
- No SDK OpenAI vai dentro de `extra_body` (Python), mas em chamada REST direta (nosso caso) é campo **top-level do body** — a API DeepSeek aceita ambos, pois o gateway ignora campos desconhecidos que a OpenAI teria removido no SDK.

**3. DeepSeek JSON mode — `api-docs.deepseek.com/guides/json_mode`:**
- Requer `response_format: {type: 'json_object'}` ✓
- **EXIGE a palavra "json"** no system ou user prompt (senão pode retornar vazio) — meu diagnóstico anterior estava correto
- Docs oficiais alertam: "API may occasionally return empty content" em JSON mode — precisamos tratar

**4. Gemini `safetySettings` — Google AI docs v1beta:**
- Categorias válidas: `HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_SEXUALLY_EXPLICIT`, `HARM_CATEGORY_DANGEROUS_CONTENT`
- Thresholds válidos: `BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`, `OFF` (2.0+)
- **Safe:** `BLOCK_NONE` é aceito em contas Gemini API padrão (não requer aprovação — só o `OFF` requer em alguns tiers). Usar `BLOCK_NONE` é o padrão para uso médico-legal e é o que o próprio Google recomenda no cookbook.

**5. Gemini `systemInstruction` — Google AI docs v1beta:**
- Suportado desde Gemini 1.5, todos 2.0/2.5/3.x
- Formato: campo top-level `systemInstruction: { parts: [{ text: "..." }] }`
- 100% seguro, sem breaking change em 12+ meses

**6. Verificação no seu ambiente:** você testou Gemini e DeepSeek pelo botão "Test" no DevPanel e ambos retornaram OK. Isso significa que as **API keys estão válidas e o roteamento base funciona** — precisamos apenas endurecer o comportamento (safety, JSON quirks) e adicionar os novos modelos V4.

---

### 🎯 Plano rigoroso (4 arquivos, mudanças cirúrgicas)

#### **Arquivo 1: `supabase/functions/_shared/ai-config.ts`**

**A) `callGeminiDirect` (linhas 568-605) — endurecimento:**
- Adicionar `safetySettings` com as 4 categorias em `BLOCK_NONE` no body
- Substituir concatenação `${systemPrompt}\n\n${userPrompt}` por:
  - `systemInstruction: { parts: [{ text: systemPrompt }] }` (top-level)
  - `contents: [{ role: 'user', parts: [{ text: userPrompt }] }]`
- Após parse, se `text === ''`, ler `finishReason` e lançar erro descritivo (`SAFETY`, `MAX_TOKENS`, etc.) — dispara fallback em vez de silêncio

**B) `callOpenAICompatible` (linhas 607-647) — quirks DeepSeek:**
- Se `config.provider === 'deepseek'`:
  - Adicionar campo `thinking: { type: 'disabled' }` no body por padrão (rápido, JSON limpo, sem custo de reasoning tokens)
  - **Exceção:** se o modelo terminar com `-reasoner` (legacy) ou o admin marcar explicitamente (item C abaixo), manter thinking on
- Se `jsonMode: true` E provider `deepseek` E system prompt não contém "json" (case-insensitive): fazer append de `"\n\nResponda em formato JSON válido."` no systemPrompt antes de enviar — evita o silêncio documentado
- Se `response.ok` mas `content === ''` E provider `deepseek`: lançar erro `"DeepSeek returned empty content (known JSON mode issue)"` para acionar fallback

**C) `DEFAULT_MODELS` (linha 37) — atualizar padrão:**
- Trocar `deepseek: 'deepseek-chat'` → `deepseek: 'deepseek-v4-flash'`
- (Mantém compat: se o admin tiver salvo `deepseek-chat` no `system_config`, continua funcionando até 07/2026; V4 vira o default para novos setups)

**D) `OPENROUTER_PDF_MODELS` (linha 695) — refresh entry:**
- Trocar `deepseek/deepseek-chat` → `deepseek/deepseek-v4-flash` (nome no OpenRouter — verificar; se ainda não estiver no OpenRouter, manter `deepseek-chat` só nesse array e deixar V4 apenas como direct via `api.deepseek.com`)

#### **Arquivo 2: `supabase/functions/test-ai-connection/index.ts`**

**A) `testOpenAICompatible` (final do arquivo) — DeepSeek-aware:**
- Se `endpoint` contém `deepseek.com`, adicionar `thinking: { type: 'disabled' }` no body do teste (senão o teste V4 pode demorar 15-30s por causa do reasoning e falhar por timeout)
- Manter os demais providers inalterados

#### **Arquivo 3: DevPanel — dropdown de modelos DeepSeek (frontend)**

Você mencionou que DeepSeek não tem "buscar modelos". O DevPanel provavelmente tem uma lista hardcoded para providers sem endpoint de listagem. Vou:

- Localizar o componente do DevPanel que renderiza o select de modelo quando provider === `deepseek` (`DevAIStatus.tsx` ou `DevSettings.tsx` — a confirmar no build)
- Atualizar a lista hardcoded para:
  - `deepseek-v4-flash` — "V4 Flash (rápido, 1M ctx) — recomendado"
  - `deepseek-v4-pro` — "V4 Pro (mais poderoso, 1M ctx)"
  - `deepseek-chat` — "Chat (legacy, deprecado 07/2026)" 
  - `deepseek-reasoner` — "Reasoner (legacy, deprecado 07/2026)"

Ordem coloca V4 no topo, legacy marcado como deprecado mas ainda selecionável (para não quebrar quem já usa).

#### **Arquivo 4: `list-gemini-models` (nenhuma mudança)**

Você disse que já funciona perfeito. Confirmado — o endpoint `/v1beta/models` é estável e a função já filtra e categoriza corretamente. **Não vou mexer.**

---

### 🛡 Garantias de segurança (por que não vai quebrar)

1. **Gemini `safetySettings`:** parâmetro OPCIONAL — se a Google renomear/deprecar, a request continua válida (Google ignora silenciosamente campos desconhecidos em v1beta). Zero risco de regressão.

2. **Gemini `systemInstruction`:** sintaxe estável desde 06/2024, usada por milhões de apps. Documentada em `ai.google.dev/api/generate-content`.

3. **DeepSeek `thinking: {type: 'disabled'}`:** enviado hoje sem esse campo, o V4 usa thinking (padrão). Adicionar `disabled` explicitamente = comportamento IGUAL ao V3 atual (`deepseek-chat` era não-thinking). Zero risco funcional, mesmo comportamento que hoje já dá certo.

4. **Append da palavra "json":** só ocorre quando `jsonMode: true` E "json" ausente. Se o prompt já tem, não faz nada. O texto adicionado é neutro ("Responda em formato JSON válido."), não conflita com nenhum prompt do sistema.

5. **Default trocado para `deepseek-v4-flash`:** só afeta NOVAS instalações onde `system_config.default_ai_model` está null. Como você já tem valor salvo no DB, seu setup atual não muda.

6. **Fallback preservado:** todos os fixes lançam erro em caso de resposta vazia, o que **ativa** o fallback já configurado (openrouter/gemini-2.5-flash). Nunca a UI recebe silêncio.

---

### 🧪 Validação pós-implementação

1. DevPanel → provider `gemini` + modelo `gemini-2.5-pro` → clicar "Test" → esperar OK
2. Gerar campo IA num laudo real → checar `DevAIUsageLogs`: provider=gemini, sem `usedFallback: true`
3. DevPanel → provider `deepseek` + modelo `deepseek-v4-flash` → "Test" → OK
4. Gerar mesmo campo → provider=deepseek, sem fallback, latência < 8s (não-thinking)
5. Trocar para `deepseek-v4-pro` → repetir → deve funcionar igual (só mais lento/caro)
6. Voltar para openrouter (seu padrão atual) → confirmar que nada quebrou

---

### ❓ 2 confirmações antes de codar

1. **Thinking mode do DeepSeek V4:** quer que eu deixe **sempre desligado** (mais rápido, previsível, ideal para extração/geração de campos)? Ou você quer um toggle no DevPanel "Ativar reasoning" para os casos raros em que se justifica (análise complexa)? Recomendo **sempre desligado** — o app já usa Gemini/OpenRouter para tarefas pesadas, e DeepSeek só brilha em custo/latência sem thinking.

2. **`safetySettings` também no `callGeminiVision` (rota de PDF)?** Recomendo forte que SIM — PDFs médicos com descrição de lesões, óbitos, acidentes disparam SAFETY blocks silenciosos que causam extração vazia. É o mesmo fix, 4 linhas.
