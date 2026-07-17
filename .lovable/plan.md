## 1) Sua pergunta direta: a correção do fallback é segura para o Trabalhista atual?

**Sim, é segura**, mas quero deixar cristalino o que exatamente vai mudar e por quê não quebra o fluxo que acabou de funcionar:

- O que **é removido**: a "Tentativa 4" hardcoded que usava `google/gemini-2.5-flash` via Lovable Gateway. Essa tentativa **nunca foi executada** no seu processamento bem-sucedido — a estruturação passou na tentativa 1. Removê-la não altera o caminho feliz.
- O que **permanece intacto**: tentativas 1, 2 e 3 continuam usando **exclusivamente o provider configurado no DevPanel** (hoje `minimax/MiniMax-M3`). É o mesmo provider que funcionou agora.
- O que **é adicionado**: 3 chaves em `system_config` com defaults **desligados** (`structuring_fallback_enabled=false`, `structuring_fallback_provider='none'`). Enquanto você não ligar no DevPanel, o comportamento é **idêntico ao atual** — nenhuma chamada extra, nenhum provider extra.
- **Zero mudança** em: prompts, OCR, resumos, Previdenciário, Impugnação, `gerar-justificativa-medica`, `getAIConfig`, chaves de API.

Risco residual: nulo no caminho de sucesso; no caminho de falha, ao invés de tentar Gemini indevidamente, o erro é propagado com o diagnóstico — que é exatamente o que você pediu.

---

## 2) Erro em Referências Bibliográficas ("Edge Function returned a non-2xx status code")

### Diagnóstico honesto do que investiguei

- Edge function `gerar-justificativa-medica` está viva e respondendo bem para `gen_destino` (2-3s) e `gen_conclusao` (15s) no MiniMax-M3 — visto nos logs desta janela.
- Para `campo === 'referencias'` a função aplica `maxOutputTokens: 2200` e `requestTimeoutMs: 90_000` (linhas 669-672).
- **Não há nenhum log** de invocação com `campo=referencias` na janela recente — isso significa uma das duas coisas: (a) o request está falhando **antes** de chegar ao `console.log` de entrada (falha muito precoce — validação, auth, JSON parse, ou o próprio boot cold-start com timeout do cliente), ou (b) a invocação está sendo feita mas caindo em um branch de erro que hoje **não loga a fase**.
- No frontend, `extractErrorMessage` tenta `err?.context?.error`. Em `supabase-js v2`, `FunctionsHttpError.context` é um **Response**, não JSON — então `context.error` é `undefined` e a UI cai no fallback genérico "Edge Function returned a non-2xx status code", **mascarando a mensagem real que o backend está retornando**.

Ou seja: pode até já estar retornando um JSON `{error: "..."}` claro (ex.: "Preencha ao menos os CIDs..." ou "A IA demorou demais..."), e o frontend está engolindo por bug de extração.

### Correção proposta (cirúrgica, mantém a funcionalidade)

**Passo A — Frontend: extrair a mensagem real do `context: Response`**

Em `src/components/laudo/sections/ReferenciasBibliograficas.tsx`, ajustar `handleGerarReferencias` para, quando `supabase.functions.invoke` lançar `FunctionsHttpError`, ler o `context.clone()` como texto/JSON antes de mostrar toast. Isso revela imediatamente se o erro é:
  - 400 validação (falta CID/Conclusão) — o usuário sabe o que preencher;
  - 502 timeout MiniMax — mensagem amigável já existe no backend;
  - 500 outro — mensagem técnica real chega à UI e ao diagnóstico.

Nada muda no fluxo de sucesso; apenas o ramo de erro passa a mostrar a mensagem verdadeira.

**Passo B — Backend: logging da fase inicial e status HTTP correto**

Em `supabase/functions/gerar-justificativa-medica/index.ts`:
1. Adicionar `console.log('[gerar-justificativa-medica] request received campo=…')` **antes** das validações — hoje o primeiro log só ocorre após carregar o prompt (linha 639), então falhas de validação/auth não deixam rastro no log com nome de campo.
2. Manter todos os status codes atuais (`400/401/403/404/502/500`) — nenhum handler novo.
3. **Não** mexer em `maxOutputTokens: 2200` nem em `requestTimeoutMs: 90_000` (funcionam para conclusão de 3145 chars; referências pedem 5-8 itens, tamanho equivalente).

**Passo C — Retentativa suave (opcional, só se persistir)**

Se depois de A+B o diagnóstico mostrar que MiniMax está dando 5xx/timeout esporádico para referências, adicionar **um** retry único (mesmo provider, mesmo payload) — igual ao que já existe em outros lugares — sem trocar provider, sem fallback cruzado, respeitando sua regra.

### Arquivos afetados (apenas 2)

- `src/components/laudo/sections/ReferenciasBibliograficas.tsx` — melhoria de `extractErrorMessage` para ler `context: Response`.
- `supabase/functions/gerar-justificativa-medica/index.ts` — 1 log adicional no início do handler; nada mais.

### O que **NÃO** será tocado

- Prompt de referências (`DEFAULT_PROMPTS.referencias`).
- Provider/modelo de IA.
- Validações backend (CIDs / Conclusão obrigatórios).
- Qualquer outra função ou campo do módulo.

---

## Ordem de execução sugerida

1. Implementar Passo A + Passo B (baixíssimo risco).
2. Você clica novamente em "Gerar Referências" — a UI passará a mostrar a mensagem real do backend, e/ou o log passará a registrar a chamada.
3. Com base nesse resultado real, se ainda houver falha técnica, aplico o Passo C.

Confirma que sigo com **Passo A + B** primeiro (sem C, sem qualquer fallback de IA), e paralelamente a correção do fallback de estruturação como já descrito no `.lovable/plan.md`?
