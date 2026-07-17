## O que está acontecendo (diagnóstico honesto)

O OCR terminou bem: 6 partes, 114 páginas, 5m11s. O que quebrou é a **fase 2 — Estruturação pós-OCR**, que hoje é feita em UMA única chamada:

- Provider: `minimax/MiniMax-M3` (o que está configurado no DevPanel)
- Input: ~200 000 caracteres de OCR concatenado (todo o processo)
- Output pedido: `max_tokens = 65 536` em `response_format: json_object`
- Timeout do nosso lado: 6 minutos

O log mostra a etapa "Estruturação pós-OCR" morrendo em **1m 20s** com `provider_timeout`. Isso NÃO é o nosso timeout de 6 min. É o servidor da MiniMax (ou o gateway) devolvendo 504/erro em ~20-25s por tentativa; o `fetchWithRetry` está com `maxRetries=3` e faz 3 tentativas com backoff 1s → 2s → 4s. Somando as tentativas + backoff dá exatamente o ~1m 20s observado. Ou seja: **a MiniMax está recusando/derrubando o request grande, e a gente re-tenta 3× sem mudar nada, então falha do mesmo jeito**.

Por que a MiniMax derruba:
- Um único prompt com ~200k chars + pedido de JSON estruturado de até 65k tokens é fora do envelope prático da M3 para chat completions. Ela costuma cortar/504 quando a geração excede ~60-90s server-side.
- No Previdenciário isso não acontece porque lá a extração é **modular** (várias chamadas menores por seção/campo), como já registrado em `mem/import-autos/modular-extraction-architecture` e `modular-prompt-assembly-and-fallback`.

Comparação: no Trabalhista ainda usamos a estratégia "one-shot" para o preenchimento. É esse o gargalo. Não adianta aumentar timeout — a M3 encerra do lado dela.

E além disso, hoje o `fetchWithRetry` re-tenta 504 SEM alterar o payload — 3 tentativas com o mesmo prompt gigante caem no mesmo erro.

---

## Correção proposta (segura, cirúrgica, sem tocar Previdenciário)

Objetivo: fazer a estruturação sobreviver a documentos grandes usando a MiniMax M3 (ou GLM/Lovable), sem alterar nada da fase OCR nem de outros módulos.

### 1. Cascata de mitigação para a chamada única de estruturação
Em `supabase/functions/processar-autos/index.ts`, envolver o `callAI` da estruturação (linha ~1959) numa cascata de tentativas com **payloads progressivamente menores**, na mesma lógica que já usamos no OCR/import (`gemini-payload-cascading-retry-strategy`):

- **Tentativa 1:** payload atual (até 200k chars, `max_tokens: 65536`).
- **Tentativa 2 (se timeout/504/response_truncated):** reduzir `max_tokens` para 32 768 e cortar o input para 140k chars (mantendo head 60% / tail 40%).
- **Tentativa 3 (se ainda falhar):** cair para 90k chars, `max_tokens: 24 576`.
- **Tentativa 4 (último recurso):** fallback de **provider**: se `aiConfig.provider === 'minimax'` (ou provider "premium" que estourou), refazer a mesma chamada via Lovable Gateway (`google/gemini-2.5-flash` ou o modelo configurado como fallback global no DevPanel). Isso NÃO muda a configuração global do usuário — é fallback só para esta operação, exatamente como já é feito no OCR.

Cada tentativa registra fase (`structuring_attempt_1..4`) no `import_jobs.current_step` para o diagnóstico mostrar exatamente onde caiu.

### 2. Desativar o retry cego dentro do `fetchWithRetry` para chamadas com `requestTimeoutMs` grande
Hoje, um 504 vira 3 retries automáticos com o mesmo body — puro desperdício de wall-clock e a causa do "1m 20s exatos". Passar uma flag `retryOnServerError: false` na chamada de estruturação, deixando o retry só na camada da cascata acima (que muda o payload). Isso é escopo local — outras chamadas (OCR, resumos, previdenciário) mantêm o comportamento atual.

### 3. Classificação correta na UI
Já temos `phase: 'structuring'` no log de erro. Reforçar no `ImportarAutosDialog.tsx` que quando o erro vier com `phase === 'structuring'`, a UI mostre "**Estruturação pós-OCR falhou**" (não "GLM-OCR:" como no print). O prefixo "GLM-OCR:" está sendo colado no `current_step` porque a fase anterior deixou esse prefixo — corrigir para limpar o prefixo ao entrar em `structuring`.

### 4. Botão "Baixar diagnóstico" persistente
Confirmar que o botão já foi adicionado no bloco de erro atual (`Processamento GLM-OCR interrompido`) — o print mostra que sim. Manter.

### 5. Telemetria
- Loggar tempo real de cada tentativa da cascata.
- Loggar `input_chars` e `max_tokens` de cada tentativa.
- Loggar o provider efetivo usado (para diferenciar "MiniMax caiu → Gemini fallback assumiu").

---

## Arquivos afetados

- `supabase/functions/processar-autos/index.ts` — cascata de estruturação (~linhas 1937-1970 e 2600-2700 para o path não-chunked).
- `supabase/functions/_shared/ai-config.ts` — adicionar opção `retryOnServerError` no `fetchWithRetry` (default `true` para não quebrar callers existentes).
- `src/components/tools/ImportarAutosDialog.tsx` — texto do banner de erro quando `phase='structuring'` e sanitização do prefixo "GLM-OCR:".

Nenhuma alteração em: Previdenciário, Impugnação, prompts globais, OCR client-side, edge functions de OCR.

---

## Nota técnica (para revisão)

O motivo real do "1m 20s" no diagnóstico:

```text
Tentativa 1 → 504 do MiniMax em ~20s
   backoff 1s
Tentativa 2 → 504 em ~20s
   backoff 2s
Tentativa 3 → 504 em ~20s
   backoff 4s
Total ≈ 20+1+20+2+20+4 = 67s + overhead ≈ 80s → aborta
```

Se removermos o retry cego, cada tentativa da cascata usa payload diferente e temos chance real de sucesso já na tentativa 2 ou 3.
