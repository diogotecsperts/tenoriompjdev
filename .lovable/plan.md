## Diagnóstico encontrado

O job informado parou exatamente aqui:

- Job: `39a231ef-4320-4d8a-9856-86cada7e6e0e`
- Status no banco: `processing`
- Etapa: `GLM-OCR: ocr_processing · parte 2/2 (págs 91-114)`
- Progresso: `27%`
- Último update: `2026-07-17T00:34:23Z`
- Logs de backend:
  - iniciou chunked com 2 partes / 114 páginas
  - iniciou OCR parte 1/2
  - parte 1/2 concluiu com 56.897 caracteres
  - iniciou OCR parte 2/2
  - depois disso não houve mais log de conclusão nem erro

Conclusão técnica: a parte 2 ficou presa dentro da chamada GLM no backend. O `import_jobs.updated_at` parou em `00:34:23`, então nem o heartbeat interno continuou. O job e a tentativa (`import_attempts`) ficaram em `processing`, sem erro persistido.

## Causa provável

Há dois problemas combinados:

1. **A função em background pode morrer sem executar o `catch` final.**
   O fluxo usa `EdgeRuntime.waitUntil(...)` para processar OCR longo após devolver o `jobId`. Se a runtime encerra por limite/timeout/recurso durante a chamada GLM, o código não chega ao `catch`, não marca `import_jobs.status = failed`, e não grava erro. Isso explica o estado atual: parado em `processing`, sem log de falha.

2. **O GLM está recebendo partes de até 90 páginas, mas o helper GLM ainda pagina internamente em chamadas de 30 páginas.**
   A parte 1 tinha páginas 1-90 e concluiu. A parte 2 tinha páginas 91-114, mas dentro do helper ela é tratada como um PDF independente e ainda chama `start_page_id: 1, end_page_id: 30`. Isso não é necessariamente fatal, mas torna a telemetria confusa e deixa menos claro qual subjanela GLM travou. O frontend mostra apenas “parte 2/2”, sem “subchamada GLM 1-24”.

3. **O diagnóstico desaparece porque o frontend muda para `processingStep = idle` ao abortar por trava.**
   O botão “Baixar diagnóstico” só existe enquanto `processingStep === analyzing` ou `isSplitting`. Quando a detecção de trava chama `abortWithStaleError`, ela limpa a tela de análise. Resultado: o modal volta para a tela inicial e o usuário perde o relatório exatamente quando mais precisa dele.

## Plano de correção

### 1. Persistir falhas de GLM no banco mesmo quando o frontend detecta travamento

No botão/fluxo de aborto por trava no Trabalhista:

- Manter o estado visual em uma nova tela/estado de erro, em vez de voltar para `idle` imediatamente.
- Gravar no job, via nova edge function pequena ou endpoint existente seguro, um status `failed` com erro claro quando o frontend detecta stale real:
  - “GLM sem avanço real há X minutos”
  - último `current_step`
  - último `progress`
  - últimos logs disponíveis
- Marcar também a tentativa (`import_attempts`) como `failed` quando possível.

Isso evita jobs eternos em `processing` e preserva a causa.

### 2. Manter o diagnóstico visível após erro

No `ImportarAutosDialog.tsx`:

- Criar estado dedicado, por exemplo `processingStep = 'error'` ou estado `glmFailedDiagnostic`.
- Quando o GLM abortar por trava:
  - parar polling;
  - manter `selectedFile`, `currentJobId`, `glmDiagnostics`, `glmLastSignal`, `backendLogs` e `splitParts`;
  - renderizar uma tela de erro com:
    - resumo do ponto exato onde parou;
    - botão “Baixar diagnóstico GLM”;
    - botão “Fechar”;
    - botão “Nova importação”.
- Não chamar `handleClose()` nem resetar diagnóstico automaticamente.

### 3. Corrigir a estratégia de partes do GLM para não depender de subpaginação interna

Para o caminho GLM no Trabalhista:

- Ajustar `RASTER_SPLIT_MAX_PAGES` de 90 para 30 ou criar constante específica para GLM chunked, gerando partes já no tamanho real de chamada do GLM.
- Cada parte enviada ao backend terá no máximo 30 páginas.
- No backend, quando `isChunkedUpload` + provider `glm`, chamar GLM sem precisar paginar internamente por `start_page_id/end_page_id` ou, se mantiver o helper, registrar subchamadas explicitamente.

Benefício: se travar, saberemos “parte 4/4, páginas 91-114”, e cada chamada GLM será menor e mais previsível.

### 4. Adicionar timeout de parte no backend, não apenas dentro do fetch GLM

Hoje existe timeout por `fetch` GLM, mas o caso real mostra que a execução pode morrer sem atualizar o job. Vou envolver cada OCR de parte em `Promise.race` com timeout operacional, por exemplo:

- GLM parte de até 30 páginas: 4 a 5 minutos;
- ao exceder:
  - gravar log `GLM-OCR: timeout da parte N/M`;
  - atualizar `import_jobs.status = failed`;
  - atualizar `import_attempts.status = failed`;
  - lançar erro claro.

Isso não altera Mistral, Gemini, MiniMax nem Previdenciário.

### 5. Melhorar logs e status granulares da GLM

No backend GLM chunked:

- Antes de cada chamada GLM, gravar:
  - parte N/M;
  - páginas reais;
  - tamanho MB;
  - timeout configurado.
- Durante o GLM, gravar heartbeat com etapa sem depender só de `updated_at`:
  - `GLM-OCR: parte N/M enviada ao provedor`
  - `GLM-OCR: aguardando resposta da parte N/M`
- No erro, incluir:
  - parte;
  - páginas;
  - provider;
  - duração;
  - mensagem técnica resumida.

### 6. Recuperação/limpeza de jobs antigos presos

Adicionar uma rotina defensiva no `check-import-status`:

- Se um job GLM está em `processing`, `updated_at` antigo e sem logs novos, retornar ao frontend um campo como `stale: true` e `staleReason`.
- Opcionalmente, marcar como failed por função dedicada quando o usuário clicar em “Encerrar e baixar diagnóstico”.

### 7. Isolamento garantido

- Não tocar no fluxo Mistral do Trabalhista.
- Não tocar no Previdenciário.
- Não alterar o pós-OCR / preenchimento dos campos do Trabalhista.
- As mudanças ficam condicionadas a provider GLM ou ao fluxo de diagnóstico do modal.

## Resultado esperado

Depois da correção:

- O GLM não ficará 10-15 minutos sem uma conclusão visível.
- Se travar, a tela não fecha nem volta para a importação inicial.
- O relatório de diagnóstico ficará disponível após o erro.
- O job no banco ficará como `failed`, não eternamente `processing`.
- O erro dirá exatamente qual parte/páginas travaram e qual foi o último sinal do backend.