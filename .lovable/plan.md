
## Diagnóstico

O log e o relatório mostram que o OCR **não** foi quem travou. O que aconteceu:

1. **Split ok e completo** — 6 partes cobrindo exatamente as 114 páginas do PDF (1-20, 21-40, 41-60, 61-80, 81-100, 101-114). Nenhuma página ficou de fora.
2. **OCR GLM concluiu com sucesso** — o próprio backend registrou `"OCR chunked concluído: 6 partes processadas"` em `01:34:38`. Todas as 6 chamadas GLM retornaram.
3. **Falha real:** fase seguinte — **estruturação pós-OCR com IA** (MiniMax-M3). A mensagem `"Tempo excedido no provider minimax/MiniMax-M3"` é gerada em `supabase/functions/_shared/ai-config.ts:123` (função `mapAIError` → código `provider_timeout`), disparada dentro de `callAI` no bloco de estruturação/resumos do `processar-autos`, **não** dentro do GLM-OCR.
4. **Por que a UI atribuiu isso ao OCR:** o modal deriva o status das etapas a partir da substring de `current_step` e do último `step_id`. Como o `failGlmPart` / fluxo de erro final sobrescreveu `current_step` com a mensagem "GLM-OCR: Tempo excedido no provider minimax/…" mesmo em falha da fase seguinte, a linha "OCR GLM por parte" foi marcada como erro retroativamente, apesar do OCR já ter concluído (5m 8s corresponde ao somatório real das 6 partes GLM, não a um timeout).
5. **Timeout observado (≈5 min na etapa de estruturação):** a chamada principal `callAI(...)` em `processar-autos/index.ts:1923` **não tem wrapper de timeout explícito**; e a fase de resumos usa `SUMMARY_TIMEOUT_MS = 90s` + retry 180s (soma ≈ 270s = ~4m30s) por resumo. Sem heartbeat durante essa espera, o watchdog `check-import-status` (>5min sem update) marca o job como zumbi/`failed` enquanto a IA ainda pode estar respondendo — foi exatamente isso que a impressão do usuário registrou ("só fechou pq bateu no tempo limite, sem verificar se estava rodando").

Ou seja: **não é problema do GLM/split**; é (a) rotulagem incorreta na UI e (b) ausência de heartbeat/timeout claro na fase de estruturação, o que faz o watchdog abortar uma chamada que ainda podia estar viva.

## Escopo e não-objetivos

- Alterações limitadas ao **provider GLM no Trabalhista** e à UI do `ImportarAutosDialog`.
- **Não** alterar Previdenciário, Mistral, MiniMax OCR client-side, nem lógica de split/rasterização (que provaram funcionar).
- **Não** trocar o provider de IA nem seus prompts; apenas proteger e rotular a espera.

## Correções propostas

### 1. Rotulagem correta da falha na UI (`src/components/tools/ImportarAutosDialog.tsx`)
- Detectar o `step_id` real reportado pelo backend na última atualização e usá-lo como fonte primária de qual etapa falhou. Quando `step_id === 'processing'` (estruturação) e `status === 'failed'`, marcar como erro a linha **"Estruturação pós-OCR"** — mantendo "OCR GLM por parte" como `completed`.
- Ignorar substrings enganosas de `current_step` quando o `step_id` já indica fase posterior. Isso preserva o diagnóstico correto no relatório baixado.
- Ajustar o texto do banner de erro para citar o provider real da fase falhada (ex.: "IA de estruturação `minimax/MiniMax-M3` excedeu o tempo"), não mais "GLM-OCR: …".

### 2. Heartbeat ativo na estruturação pós-OCR (`supabase/functions/processar-autos/index.ts`)
- Antes de `callAI` na linha 1923 e durante `gerarResumosIA`, ligar um `setInterval` que a cada ~20s faz `UPDATE import_jobs SET current_step = 'Estruturando dados com IA · Xs decorridos', updated_at = now()` para o job atual. Encerrar no `finally`.
- Isso impede que o watchdog de 5min do `check-import-status` marque o job como stale enquanto a IA ainda está respondendo, e dá visibilidade real ao usuário.

### 3. Timeout explícito e claro na estruturação principal
- Envolver a chamada `callAI` da fase 2 (linha 1923) num `Promise.race` com timeout dedicado (`STRUCTURING_TIMEOUT_MS`, ex.: 6 min, configurável), semelhante ao usado em `gerarResumosIA`.
- Ao atingir o timeout, marcar o job como `failed` com `step_id: 'processing'` e `current_step` explícito: "Estruturação pós-OCR: IA `<provider>/<modelo>` não respondeu em Xmin". Sem sobrescrever mensagens da fase de OCR.

### 4. Diagnóstico persistente após erro (UI)
- Garantir que, quando `status === 'failed'`, o modal permaneça aberto com o bloco "Diagnóstico preservado" e o botão "Baixar diagnóstico" (comportamento atual da imagem) — apenas ajustar as legendas para refletir a etapa correta. O botão "Nova importação" continua limpando `currentJobId` e `selectedFile`.

### 5. Telemetria complementar (sem custo funcional)
- Adicionar `logInfo`/`logError` com `phase: 'structuring'` ou `phase: 'summaries'` para separar falhas de OCR das falhas de IA nos relatórios do DevPanel.

## Verificação após aplicação

1. Rodar novamente o mesmo PDF de 63MB/114 págs:
   - OCR GLM: 6/6 partes concluídas (esperado, sem regressão).
   - Fase de estruturação: heartbeat visível no modal (contador de segundos avançando), watchdog não dispara antes do timeout dedicado.
2. Forçar timeout de estruturação (ex.: prompt gigante ou modelo lento): validar que o modal marca **"Estruturação pós-OCR"** como erro, "OCR GLM por parte" permanece verde, e o diagnóstico baixado descreve corretamente a fase.
3. Confirmar que módulo Previdenciário e provider Mistral não sofrem qualquer mudança (grep/lint nos arquivos tocados; nenhum arquivo `prev-*` alterado).

## Detalhes técnicos

- `processar-autos/index.ts`:
  - novo `STRUCTURING_TIMEOUT_MS` (const local, default 6 min);
  - helper `startStructuringHeartbeat(jobId, label)` / `stopStructuringHeartbeat()` reutilizável em fase 2 e 3;
  - novo bloco `Promise.race` em torno de `callAI` da linha 1923;
  - `failGlmPart` continua responsável somente pela fase 1; criar `failStructuringPhase` análogo para fase 2/3, que **preserva** as mensagens de fase 1 na UI.
- `check-import-status/index.ts`: nenhum ajuste na regra de "stale > 5 min", pois o heartbeat da fase 2 vai passar a atualizar `updated_at` regularmente. Opcional: aumentar tolerância para 8 min só quando `step_id === 'processing'` e provider AI ativo, como cinto de segurança.
- `ImportarAutosDialog.tsx`:
  - função `mapErrorToStep(job)` que prioriza `step_id`;
  - textos das linhas da timeline dependem do `step_id` da última atualização, não mais de substrings.

## Riscos e mitigação

- **Risco:** interval de heartbeat vazando (não limpo em erro). **Mitigação:** `try/finally` obrigatório em ambos os pontos.
- **Risco:** timeout maior mascarar travas reais. **Mitigação:** heartbeat + limite explícito (6 min); watchdog do `check-import-status` continua ativo como segunda linha.
- **Risco:** confundir mensagens antigas de jobs em execução. **Mitigação:** mudanças só afetam jobs novos; jobs em andamento seguem com labels legados até concluírem.
