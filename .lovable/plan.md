# Correções no processamento previdenciário

Duas correções pontuais, sem tocar no pipeline de OCR/IA em si.

---

## 1. Label "OCR Gemini em execução" — falso positivo de UI

**Diagnóstico (confirmado no código):**
- O texto vem de `src/modules/previdenciario/api/processar.ts:183`, dentro de um dicionário `STAGE_LABELS` que mapeia `stage` do job para uma string legível:
  ```ts
  ocr_processing: "OCR Gemini em execução",
  ```
- Esse label é **puramente decorativo** e foi hardcoded na época em que só existia Gemini. O backend (`prev-pre-processar/index.ts:14` e `:946`) já usa `runOcrWithConfiguredProvider(...)`, que respeita `phase1_ocr_provider` do DevPanel (GLM/Mistral/MiniMax/Gemini). O `provider` real vai preenchido em `prev_processing_jobs.provider` e chega ao cliente via `status.provider`.
- **Ou seja: o OCR real está usando GLM (se configurado). Só o texto na tela mente.**

**Correção:**
- Substituir o label estático por um label dinâmico baseado em `status.provider` (que já é retornado por `checkStatus`). Passar `status.provider` para o formatador em `pollPreProcessarJob` e montar algo como:
  - `glm-ocr` → "OCR GLM em execução"
  - `mistral-ocr` → "OCR Mistral em execução"
  - `minimax*` → "OCR MiniMax em execução"
  - `gemini*` → "OCR Gemini em execução"
  - fallback (sem provider ainda): "OCR em execução"
- Aplicar a mesma lógica para `ocr_completed` ("OCR GLM concluído" etc.). Os outros stages (download, ai_extraction, saving...) ficam iguais.
- Arquivo único: `src/modules/previdenciario/api/processar.ts`.

---

## 2. Botão "Parar" durante o processamento

**Situação hoje:**
- `PautaDetalhe.tsx` dispara `preProcessarPericia(id, ...)` e fica em polling (`pollPreProcessarJob`, loop até 8min ou watchdog server-side 120s). Não há forma de cancelar — o usuário só consegue "sair" excluindo o PDF, o que corrompe o registro.
- `prev_processing_jobs` tem status `queued | processing | completed | failed`. Não existe `canceled`.

**Correção mínima e segura (sem migração de banco):**

**Backend — nova edge function `cancel-prev-processing-job`:**
- Recebe `{ jobId }`, valida sessão do usuário (mesmo padrão de `check-prev-processing-status`), confirma que o job pertence ao `auth.uid()`.
- Faz `UPDATE prev_processing_jobs SET status='failed', stage='failed', progress=100, error_code='canceled', error_message='Processamento cancelado pelo usuário.', completed_at=now() WHERE id=? AND status IN ('queued','processing')`.
- Reusa `error_code='canceled'` (não requer alterar CHECK constraint — o campo já é string livre em `error_code`). Assim a UI diferencia cancelado de falha real.
- Não tenta matar o worker (edge function não é interrompível a partir do banco). O watchdog de 120s já limpa o resto; o importante é liberar a UI imediatamente.

**Frontend — botão + abort do polling:**
- `src/modules/previdenciario/api/processar.ts`:
  - Adicionar parâmetro opcional `signal?: AbortSignal` em `preProcessarPericia` e `pollPreProcessarJob`.
  - No loop do polling, checar `signal.aborted` a cada iteração; ao abortar, invocar `cancel-prev-processing-job` (best-effort, não bloqueia) e lançar `PreProcessarError("Processamento cancelado.", "canceled")`.
  - Adicionar `"canceled"` ao tipo `PreProcessarErrorCode`.
- `src/modules/previdenciario/pages/PautaDetalhe.tsx`:
  - Manter um `Map<periciaId, AbortController>` em `useRef`. Ao disparar, criar controller e passar `signal`.
  - Renderizar botão "Parar" (ícone `Square` ou `X` do lucide) ao lado do texto de progresso quando `processandoIds.has(pericia.id)`. Ao clicar, chamar `controller.abort()`.
  - No `catch`, quando `code === 'canceled'`, mostrar toast neutro ("Processamento interrompido"), sem erro vermelho.
- MiniMax client-side (`runMinimaxClientOcr`) já aceita `signal` internamente? Verificar; se não, encaminhar mesmo assim (fase 1 do fix cobre só o caminho async/polling, que é o problema reportado). Se `runMinimaxClientOcr` não suportar abort, deixar TODO documentado — o path GLM/Gemini/Mistral (que é o caso do usuário) já resolve.

**Estados finais:**
- Cancelamento imediato do ponto de vista da UI (polling para, botão some, mensagem clara).
- Job no banco fica com `status=failed`, `error_code=canceled` — nenhuma corrupção; próxima tentativa de processar a mesma perícia funciona normalmente.
- Excluir o PDF deixa de ser o único caminho de escape.

---

## Arquivos alterados

- `src/modules/previdenciario/api/processar.ts` (label dinâmico + suporte a AbortSignal + chamada de cancelamento)
- `src/modules/previdenciario/pages/PautaDetalhe.tsx` (AbortController + botão Parar)
- `supabase/functions/cancel-prev-processing-job/index.ts` (novo)

Nenhuma migração de banco. Nenhum toque em `prev-pre-processar`, `ocr-router`, `glm-ocr` ou no fluxo de Trabalhista/Impugnação.
