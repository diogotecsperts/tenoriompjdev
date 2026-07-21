## Objetivo

Replicar no branch **GLM do Trabalhista** o mesmo pipeline do Previdenciário — para arquivos pequenos **e** grandes — sem tocar em nenhum arquivo do módulo Previdenciário. O Trabalhista hoje **funciona** (embora lento por causa do split de 20 págs), então preservo um ponto de reversão claro antes de qualquer alteração.

## Snapshot do estado atual (ponto de reversão)

Registrado aqui para permitir reversão manual precisa caso algo dê errado. Estes são os únicos pontos que vou tocar — reverter = restaurar exatamente estes valores.

**`src/lib/pdf-preprocess.ts`**
- Linha 19: `export const RASTER_SPLIT_MAX_BYTES = 48 * 1024 * 1024;` (fica igual)
- Linha 22: `export const RASTER_SPLIT_MAX_PAGES = 20;` ← valor atual a preservar
- Funções `rebuildPdfAsRasterClean`, `splitCleanPdfByPages`, `rebuildPdfAsRasterParts`, `pdfNeedsRasterSplit`, `probePdfPageCount` já existem — **nenhuma delas será removida ou modificada**. Só mudo a constante `RASTER_SPLIT_MAX_PAGES` (20 → 90).

**`src/components/tools/ImportarAutosDialog.tsx`**
- Bloco `if (isGlm) { ... }` que hoje chama `rebuildPdfAsRasterParts(selectedFile, ...)` para gerar partes e depois faz upload+`trabalhista-ocr-part` por parte.
- Nenhum outro bloco do arquivo é tocado (Mistral, MiniMax, timeline, diagnóstico, watchdog, tela de erro persistente — tudo permanece).

**Fora do escopo (não toco em nada):**
- `src/modules/previdenciario/**` (Prev usa `pautas.ts` local — cópia independente).
- `supabase/functions/**` (backend do Trabalhista já aceita `preExtractedText` via `trabalhista-ocr-part`/`processar-autos`; nenhuma edge function precisa mudar).
- `src/lib/minimax-ocr-client.ts`, roteador OCR, DevPanel.

**Como reverter em 1 minuto se algo quebrar:**
1. Voltar `RASTER_SPLIT_MAX_PAGES` para `20` em `src/lib/pdf-preprocess.ts`.
2. Restaurar o bloco `if (isGlm)` em `ImportarAutosDialog.tsx` para chamar `rebuildPdfAsRasterParts` como faz hoje.
Alternativa mais simples: usar o botão de revert do chat na mensagem imediatamente anterior à implementação.

## Pipeline do Prev (base a replicar) — verificado em `src/modules/previdenciario/api/processar.ts:790-900`

1. **Gate:** `size > 48 MB` **OU** `pageCount > 90` → precisa raster. Caso contrário, PDF passa **direto** pro OCR (chamada única, arquivo original intacto).
2. **Se precisa raster:** rasteriza o PDF inteiro num "PDF limpo" único via `rebuildPdfAsRasterClean` (uma passada só).
3. **Decisão pós-raster:**
   - Limpo cabe em 48 MB **e** 90 págs → chamada única com o limpo (single-shot).
   - Caso contrário → split do limpo em partes de até 90 págs via `splitCleanPdfByPages`.

## Mudanças

### 1) `src/lib/pdf-preprocess.ts`
- Trocar `RASTER_SPLIT_MAX_PAGES` de `20` → `90`, alinhando ao `PREV_SPLIT_MAX_PAGES` do Prev (que é o limite duro real da API GLM confirmado em produção).
- Atualizar o comentário adjacente para refletir que o valor espelha deliberadamente o Prev.
- `rebuildPdfAsRasterParts` **fica no arquivo** (não é removida) — só deixa de ser chamada pelo Trabalhista. Isso preserva a possibilidade de rollback pontual sem reintroduzir código.

### 2) `src/components/tools/ImportarAutosDialog.tsx` — apenas o bloco `if (isGlm)`

Substituir o uso de `rebuildPdfAsRasterParts` pelo pipeline em dois passos do Prev, mantendo timeline, upload de partes, orquestração via browser e chamada por parte a `trabalhista-ocr-part` exatamente como hoje:

1. **Probe** com `pdfNeedsRasterSplit(selectedFile, 48MB, 90)` — decide se raster é necessário.
2. **Caminho rápido (não precisa):** trata o `selectedFile` como parte única, faz upload direto para `processos-pdf/{userId}/...` e chama `trabalhista-ocr-part` uma vez. Sem raster, sem split. **Comportamento idêntico ao "caminho rápido" do Prev.**
3. **Caminho pesado (precisa):**
   - `rebuildPdfAsRasterClean(selectedFile, 48MB, { onPageProgress })` → um PDF limpo único (progresso já emitido para a timeline `raster`).
   - **Decisão single-shot:** se `cleanBlob.size ≤ 48MB` **e** `cleanPageCount ≤ 90` → parte única com o limpo.
   - **Caso contrário:** `splitCleanPdfByPages(cleanBlob, 90, 48MB)` → array de partes; cada uma passa por upload + `trabalhista-ocr-part`.
4. O restante do fluxo (concatenação de texto, envio para `processar-autos` com `preExtractedText`, estruturação MiniMax, watchdog, diagnóstico, tela de erro persistente) **fica igual**.

## Arquivos alterados

- `src/lib/pdf-preprocess.ts` — só a constante `RASTER_SPLIT_MAX_PAGES` + comentário.
- `src/components/tools/ImportarAutosDialog.tsx` — só o bloco `if (isGlm)`.

## Garantias explícitas

- **Previdenciário:** zero arquivos alterados. O Prev usa sua própria cópia em `src/modules/previdenciario/api/pautas.ts`; mudanças em `src/lib/pdf-preprocess.ts` não o alcançam.
- **Mistral no Trabalhista:** o pipeline novo vive dentro de `if (isGlm)`. Mistral segue com o fluxo original intocado.
- **GLM no Trabalhista:** passa a ter exatamente o mesmo formato de decisão do Prev — pequenos direto, grandes com raster único + single-shot ou split de 90 págs.
- **Backend:** `trabalhista-ocr-part`, `processar-autos`, `check-import-status`, `mark-import-job-failed`, `_shared/glm-ocr.ts` — nenhum é tocado.

## Como validar após implementar

1. **PDF GLM pequeno** (ex.: 30 págs, 5 MB): timeline mostra probe → pula raster/split → OCR único.
2. **PDF GLM médio** (ex.: 80 págs, 30 MB): probe não dispara raster; passa direto.
3. **PDF GLM grande por páginas** (ex.: 150 págs, 20 MB): raster único → single-shot se couber, senão split em partes de até 90 págs.
4. **PDF GLM grande por bytes** (ex.: 60 págs, 60 MB): mesmo caminho do item 3.
5. **Trabalhista/Mistral** com qualquer PDF: idêntico.
6. **Previdenciário** com qualquer PDF: idêntico.

Se qualquer item de 1–4 regredir em relação ao comportamento atual (que já passa em ~20 min), reverter usando as duas alterações listadas na seção de snapshot — nada além disso precisa ser desfeito.