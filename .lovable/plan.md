## Objetivo

Ao selecionar o provedor **Google Gemini** no DevPanel, o app deve sugerir por padrão um modelo **Flash** (free tier), evitando o erro `limit: 0` que ocorre em `gemini-2.5-pro` / `gemini-3-pro-preview` sem billing habilitado.

## Sobre os modelos Flash e free tier (situação atual — nov/2026)

Confirmado na documentação oficial do Google (`ai.google.dev/gemini-api/docs/rate-limits`):

| Modelo | Free tier | Observação |
|---|---|---|
| `gemini-2.5-flash` | ✅ Sim | Estável, recomendado como default seguro |
| `gemini-2.5-flash-lite` | ✅ Sim | Mais rápido/barato, menos capacidade |
| `gemini-2.0-flash` | ✅ Sim | Geração anterior, funciona |
| `gemini-3-flash-preview` | ✅ Sim (preview) | Mais novo, pode ter cota reduzida por ser preview |
| `gemini-3.5-flash` | ✅ Sim | Mais recente da linha Flash |
| `gemini-2.5-pro` | ❌ limit: 0 | Requer billing |
| `gemini-3-pro-preview` | ❌ limit: 0 | Requer billing |

Sua intuição está correta: **Flash 3 preview e 3.5 Flash têm free tier**. A escolha mais segura como default absoluto é **`gemini-2.5-flash`** — é o modelo Flash mais estável (não-preview), com free tier garantido há mais tempo e menor risco de ser puxado/renomeado pelo Google.

## Mudanças propostas (mínimas, cirúrgicas)

### 1. `supabase/functions/_shared/ai-config.ts`
- `DEFAULT_MODELS.gemini`: já está como `'gemini-2.5-flash'` (linha 33) ✅ — nenhuma alteração necessária no fallback do backend.

### 2. `src/components/dev-panel/DevSettings.tsx` e `DevUserSettings.tsx`
No componente do seletor de modelo, quando o usuário troca o **provedor** para `gemini`:
- Se o campo de modelo estiver **vazio** ou contiver um modelo **Pro** (`gemini-2.5-pro`, `gemini-3-pro-preview`), auto-preencher com **`gemini-2.5-flash`**.
- Se já contiver um Flash válido, preservar a escolha do usuário.

### 3. Reordenação da lista de modelos Gemini (visual)
Reordenar a dropdown para mostrar os modelos com free tier no topo, e marcar os Pro com sufixo `(requer billing)`:

```
gemini-2.5-flash            (recomendado — free tier)
gemini-2.5-flash-lite       (free tier — mais rápido)
gemini-3-flash-preview      (free tier — preview)
gemini-3.5-flash            (free tier — mais recente)
gemini-2.0-flash            (free tier — legado)
─────────
gemini-2.5-pro              (requer billing)
gemini-3-pro-preview        (requer billing)
```

A lista puxada dinamicamente pela função `list-gemini-models` continua funcionando; a ordenação/rotulagem é aplicada só na renderização.

### 4. Mensagem de erro amigável (opcional, mas recomendado)
Em `test-ai-connection` e no fluxo real de chamada Gemini, detectar o padrão `free_tier_requests` + `limit: 0` na resposta 429 e transformar em mensagem clara:

> "Este modelo Gemini requer billing habilitado no Google AI Studio. Use um modelo Flash (free tier) ou habilite billing em aistudio.google.com/apikey."

## O que NÃO será tocado

- **OpenRouter**: nenhuma linha alterada. É o provedor principal em produção e continua intocado.
- **DeepSeek**: mantido como está (V4 Flash default, ajustes anteriores preservados).
- **Lovable / Claude / Groq / OpenAI**: sem mudanças.
- **`callGeminiDirect` / `callGeminiVision`**: as correções anteriores (`safetySettings`, `systemInstruction`, detecção de resposta vazia) permanecem — apenas o default de UI muda.

## Validação após implementação

1. DevPanel → trocar provedor para `gemini` → confirmar que o campo modelo auto-preenche com `gemini-2.5-flash`.
2. Clicar "Testar conexão" → deve retornar OK (já funciona, confirmado por você).
3. Gerar um campo real → verificar em `DevAIUsageLogs` que a chamada saiu como `gemini / gemini-2.5-flash` sem fallback e sem erro 429.
4. (Opcional) Trocar manualmente para `gemini-2.5-pro` e clicar testar → deve mostrar a mensagem amigável de billing.

## Perguntas de decisão

1. **Default final:** confirma `gemini-2.5-flash` como o default automático ao trocar para provedor Gemini? Ou prefere `gemini-3-flash-preview` (mais novo, porém preview, com risco maior de instabilidade/renomeação pelo Google)?
2. **Mensagem amigável de billing (item 4):** quer que eu inclua nessa mesma leva, ou deixa para depois?
