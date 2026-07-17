
## Diagnóstico

Observado no print + código:

- OCR client-side (GLM por partes) completou (6 partes / 114 págs).
- Backend `processar-autos` foi chamado com `preExtractedText`, pulou a fase 1 e entrou direto na **fase 2 (estruturação)**.
- A UI mostra `Extração do PDF · glm-ocr · 966ms` e `Resumos · MiniMax-M3 · 203ms · 0 resumos`. Esses números são impossíveis para o trabalho real e revelam a causa:
  - `pdfExtraction.durationMs` mede só o overhead do branch `preExtractedText` (não o OCR real, que rodou no cliente).
  - `summaries.durationMs = 203ms` = o loop de resumos **saiu no primeiro `break`** por causa da checagem de orçamento de tempo em `gerarResumosIA` (`processar-autos/index.ts` ~1371-1387): quando `remaining < 30_000ms`, ele pula **todos** os resumos.
- Ou seja: a **estruturação (callAI) consumiu quase todos os 600 s** de wall-clock da edge function (STRUCTURING_TIMEOUT_MS=6 min), e quando chegou a hora de gerar os 2 resumos automáticos (`resumo_peticao`, `resumo_contestacao`), o budget já era < 30 s → `summariesGenerated = 0` → job termina com `status:'completed'` mas `summaries.count=0` → UI cai na branch "Extração parcial" **sem botão de baixar diagnóstico** (esse botão só existe no bloco de erro).

Problema secundário: `background processing` empacota estruturação + resumos na mesma invocação. Qualquer chamada de IA lenta na fase 2 canibaliza o orçamento da fase 3 — mesmo com OCR já feito no cliente.

Escopo isolado: apenas import Trabalhista via `glm` (branch `processarChunkedPDFBackground` com `preExtractedText`). Mistral e Previdenciário intocados.

## Plano de correção

### 1. Desacoplar resumos da mesma invocação da estruturação (GLM/Trabalhista)

Na branch `preExtractedText`, após a estruturação bem-sucedida:

- Salvar `extractedData` no job (`result.partial=true`, `resumos_parciais={}`, `step_id='structuring_done'`, `progress: 60`) e **retornar / encerrar a background function**, marcando `status='awaiting_summaries'`.
- O frontend, ao ver `status='awaiting_summaries'`, dispara uma nova edge function fina — `trabalhista-gerar-resumo` — **uma chamada por tipo de resumo** (`resumo_peticao`, `resumo_contestacao`). Igual ao padrão que já usamos para OCR por parte via `trabalhista-ocr-part`.
- Cada chamada é curta (< 3 min), tem seu próprio timeout, e falhas individuais não afetam as outras.
- Ao final da última chamada, o frontend marca o job como `completed` (ou o backend faz isso na última chamada de resumo, quando `todosGerados === true`).

Vantagem: elimina a corrida por budget entre estruturação e resumos, que é a raiz do "0/2".

### 2. Rotular corretamente o `aiUsage` na preview

Em `processar-autos` (branch preExtractedText):

- `aiUsage.pdfExtraction.durationMs` **não** deve refletir o overhead do branch. Aceitar `preExtractedDurationMs` do payload (já enviado pelo cliente com o total real do OCR client-side) e usar esse valor. Se ausente, mostrar `—` na UI em vez de "966 ms".
- `aiUsage.summaries.durationMs` só é calculado no fluxo antigo. Na nova arquitetura, é agregado no cliente a partir das durações de cada chamada `trabalhista-gerar-resumo`.

### 3. Botão "Baixar diagnóstico" também no estado de preview parcial

Em `ImportarAutosDialog.tsx`, no bloco `isIncompleteExtraction` (linhas ~2302-2335), acrescentar um botão "Baixar diagnóstico" ao lado de "Tentar novamente", chamando o mesmo `downloadGlmDiagnostic()` já existente. Assim o usuário nunca fica sem log — hoje o botão só aparece no bloco de erro fatal.

Também acrescentar o mesmo botão no bloco `partialFailures` (linhas ~2338-2361).

### 4. Watchdog: não marcar como `completed` com 0 resumos

No fim de `processarChunkedPDFBackground` (~2043-2106): se `resumosResult.aiInfo.summariesGenerated === 0` **e** havia resumos esperados (`summariesToGenerate.filter(s => s.shouldGenerate).length > 0`), marcar `status='failed'` com `step_id='summaries_timeout'` e `error='Orçamento de tempo esgotado antes dos resumos. Estruturação demorou X min.'`. Isso garante que o dialog cai na branch de erro (com diagnóstico) em vez da preview enganosa.

### 5. Telemetria adicional

`logInfo` marcando quanto tempo a estruturação levou e quanto sobrou de budget quando entrou nos resumos. Facilita depurar próximos casos.

## Arquivos afetados

- `supabase/functions/processar-autos/index.ts` — desacoplar resumos, corrigir duração reportada, marcar `failed` quando `count=0`.
- `supabase/functions/trabalhista-gerar-resumo/index.ts` — **novo**: gera um único tipo de resumo por chamada.
- `src/components/tools/ImportarAutosDialog.tsx` — orquestrar chamadas de resumo, agregar `aiUsage`, adicionar botão "Baixar diagnóstico" nos estados parciais.
- `src/lib/pdf-preprocess.ts` — enviar `preExtractedDurationMs` para o backend.
- Nenhuma migração de banco. RLS/tabelas inalteradas. Nenhuma alteração no Previdenciário nem no fluxo Mistral.

## Validação

- Rodar mesmo PDF que quebrou (114 págs / 6 partes GLM). Esperado: OCR completa, estruturação completa, 2 chamadas separadas de resumo geram peticao + contestacao, UI mostra "2 de 2 resumos gerados" e `aiUsage` reflete tempos reais.
- Se qualquer resumo individual falhar, cai em `partialFailures` (não em "Extração parcial"), e o botão "Baixar diagnóstico" está disponível.
- Se a estruturação estourar 6 min, job termina com `status='failed'` visível e diagnóstico baixável — não mais "Extração parcial 0/2".
