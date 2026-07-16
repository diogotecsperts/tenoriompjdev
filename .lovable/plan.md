
## Contexto

O Trabalhista **não tem** o mesmo pipeline "raster+clean+split por páginas" que o Previdenciário usa há tempos para nunca bater no limite duro do GLM (90 págs, 48 MB por chamada). Hoje o Trabalhista tenta se virar com um split pdf-lib "halving" (`splitPDFClientSide`) que sofre do bug de inflação do `copyPages` — daí o "rescue loop" gambiarra que ainda existe em `ImportarAutosDialog.tsx:799-851`. Além disso, o ramo `else if (pdfStream)` do `processar-autos` (20-45 MB single-pass) hardcoda `gemini-2.0-flash` (descontinuado) → é a origem do 404 do print.

O Prev, ao contrário, tem 4 funções puras (browser-only, sem tocar em bucket/tabela do Prev) em `src/modules/previdenciario/api/pautas.ts` que fazem o trabalho corretamente: rasterizam cada página em canvas, remontam um PDF limpo e quebram em partes que respeitam simultaneamente 48 MB e 90 págs.

Como Prev é prioridade, a estratégia é **duplicar** (não mover) essas funções para uma lib compartilhada, deixando o Prev 100% intocado. Trabalhista passa a usar a cópia da lib compartilhada. Zero risco para o Prev.

## Objetivos

1. Trabalhista aceita OCR + IA do DevPanel em **todos** os tamanhos de PDF (não só <20 MB).
2. Trabalhista respeita o limite duro do GLM (90 págs / 48 MB por parte) usando o mesmo padrão do Prev.
3. Modal do Trabalhista mostra as etapas granulares (rasterização, split, OCR parte X/N) nos slots que já existem, sem redesenho.
4. Zero mudança de comportamento e zero edição de arquivo no Previdenciário.

## Alterações

### 1. Nova lib compartilhada: `src/lib/pdf-preprocess.ts` (novo arquivo)

Duplicar do Prev (`src/modules/previdenciario/api/pautas.ts`) as 4 funções puras, renomeando de forma genérica e trocando constantes Prev-flavored por nomes neutros:

- `rebuildPdfAsRasterClean(source, maxBytes, opts)` — igual ao original (linhas 177-292). Depende de `pdf-lib` e `pdfjs-dist` (worker via `?url`), roda **só no browser** (usa `document.createElement('canvas')`). Fallback 2-pass DPI/qualidade preservado.
- `probePdfPageCount(source)` — igual (linhas 345-353).
- `splitCleanPdfByPages(cleanSource, maxPages, maxBytes)` — igual (linhas 365-432). Recursivo, respeita bytes E páginas.
- `pdfNeedsRasterSplit(source, maxBytes)` — versão genérica do `prevPdfNeedsSplit`, aceita `maxBytes` por parâmetro.
- Constantes: `RASTER_SPLIT_MAX_BYTES = 48 * 1024 * 1024`, `RASTER_SPLIT_MAX_PAGES = 90`.
- Interface `PdfSplitPart` (versão genérica da `PrevPdfSplitPart`).

**Duplicação, não extração**: o código do Prev fica exatamente como está. Se em algum bug futuro precisarmos consolidar, vira uma refatoração isolada com sign-off explícito.

### 2. `src/components/tools/ImportarAutosDialog.tsx` — pipeline raster+clean+split para GLM

- No topo do `processFile()` (antes da checagem `shouldSplit` em `:774`), adicionar uma nova branch: `if (ocrConfig.provider === 'glm')`, sempre passar pelo raster+clean+split (não só quando o tamanho passa do threshold — o limite de 90 págs pode ser atingido com PDFs pequenos).
  1. `probePdfPageCount(selectedFile)` (barato, ~50-200ms).
  2. Se `pageCount > 90` **OU** `size > 48 MB`: chamar `rebuildPdfAsRasterClean(selectedFile, RASTER_SPLIT_MAX_BYTES, { parallelism, onPageProgress })` alimentando `setSplitMessage("Rasterizando página X/Y...")` + `setSplitProgress((done/total)*40)` no slot `:2050`.
  3. Se o limpo cabe em single-shot (`sizeBytes <= 48 MB && pageCount <= 90`): sobe **só o limpo** e chama `processar-autos` como PDF único (fluxo `filePath` normal). Segue o padrão do Prev de "path swap" mas **sem** deletar o original (o Trabalhista precisa manter o original para auditoria — abordagem: sobe original + limpo em paths distintos, `filePath` aponta para o limpo).
  4. Senão: `splitCleanPdfByPages(cleanBlob, 90, 48MB)` → sobe cada parte a `${user.id}/${timestamp}-${baseName}_raster_part_${i+1}.pdf` no bucket `processos-pdf` (mesmo bucket já usado, evita mudança de RLS).
  5. Invocar `processar-autos` com `{ fileName, fileParts: partPaths, pageRanges, totalPages, isChunkedUpload: true }` — **shape já aceita**, zero mudança no backend para esta feature.
- Manter o fluxo antigo (`splitPDFClientSide` pdf-lib halving + rescue loop) para provedores **não-GLM** (Mistral/Gemini/MiniMax) — não é regressão; apenas GLM é bloqueado pelo limite de páginas. Isso preserva 100% do comportamento atual de quem não usa GLM.
- Ajustar `getOcrSubStepLabel()` (`:459-494`) para reconhecer as novas mensagens vindas do backend/frontend e mostrar sub-labels apropriadas ("Rasterizando página X/Y", "OCR parte X/N (págs A-B)").

### 3. `supabase/functions/processar-autos/index.ts` — corrigir o ramo `else if (pdfStream)` e melhorar `current_step`

- **Corrigir o 404 do print**: no ramo single-pass `else if (pdfStream)` (linhas 2999-3025) e no ramo split legacy (linhas 2933-2997), substituir os hardcodes `'gemini-2.0-flash'` e `'gemini-2.5-flash'` por chamadas ao `runOcrWithConfiguredProvider` (com input `{ blob, size }` para o stream). Mesmo padrão que apliquei no two-phase. Isso encerra o silent-downgrade e o 404.
- **Melhorar sub-steps do modal**: no loop de partes chunked (`processarChunkedPDFBackground` a partir de `:1672`), o `import_jobs.update({ current_step })` já existe — expandir a mensagem para incluir provider e faixa de páginas: `"OCR ${provider} · parte i/N · págs A-B"`. Essa string chega crua no frontend como `analysisStep` e alimenta o sub-label do badge sem mudar layout.
- Adicionar `onHeartbeat` do `ocr-router` como escreva-de-progresso em `import_jobs.current_step` para GLM, para que o modal do Trabalhista veja algo se movendo mesmo dentro de uma parte grande (Prev já faz isso via `onJobProgress`).

**Não altero**: schema de request/response da edge function, tabela `import_jobs` (sem colunas novas), nenhum outro branch da function, prompts, providers, DevPanel.

### 4. Toggle `import_strategy` — parado por enquanto

Deixo o toggle **como está**. O usuário perguntou se pode remover, mas neste plano o foco é resolver o GLM-safe pipeline. Remoção do toggle vira um plano separado após esse rodar bem em produção — evita empacotar duas mudanças de risco distinto numa só entrega. Se quiser embutir aqui, avise antes do build.

### 5. Nenhuma outra alteração

- `src/modules/previdenciario/**` — **intocado**, incluindo `pautas.ts`, `processar.ts` e todo o pipeline. As 4 funções ficam duplicadas na nova lib; o Prev continua importando as próprias de `pautas.ts`.
- `supabase/functions/prev-*` — intocado.
- `supabase/functions/_shared/ocr-router.ts`, `glm-ocr.ts`, `mistral-ocr.ts`, `ai-config.ts` — intocado.
- Bucket `processos-pdf` já existe; sem migration.
- Nenhuma nova secret, nenhuma nova RLS, nenhuma coluna nova.

## Validação

1. `tsgo --noEmit` deve passar.
2. **Trabalhista com PDF pequeno (<20 MB) + GLM**: sem regressão, badge "GLM-OCR", sub-step vazio ou "documento em uma chamada".
3. **Trabalhista com PDF 30 MB / 120 págs + GLM**: modal mostra "Rasterizando página X/120..." (0-40%), "Dividindo PDF limpo em 2 partes", "OCR GLM-OCR · parte 1/2 · págs 1-90", "OCR GLM-OCR · parte 2/2 · págs 91-120", conclusão sem 404 e sem erro de página do GLM.
4. **Trabalhista com PDF 30 MB + Mistral**: fluxo atual preservado (não passa pelo raster novo).
5. **Trabalhista com PDF 25 MB + Gemini**: sem 404 (ramo corrigido usa router com `phase1_gemini_model` do DevPanel).
6. **Previdenciário — smoke test**: uma pauta antiga com PDF grande (>90 págs), tempo de execução e logs (`prev-rebuild`, `prev-pre-processar`) **idênticos** aos de antes. Nenhum arquivo do Prev editado, então esperamos zero diferença.
7. Modal Trabalhista visualmente idêntico ao atual — só o texto do sub-step muda; layout preservado.

## Riscos e mitigação

- **Risco:** `pdfjs-dist` worker path pode conflitar entre Prev e Trabalhista se ambos importarem lado a lado. **Mitigação:** duplicação usa `?url` import (Vite bundling), cada consumer resolve o próprio worker; testar carregando o Prev primeiro e depois abrindo o dialog do Trabalhista sem reload.
- **Risco:** rasterização pesada travar UI. **Mitigação:** mesmo comportamento do Prev — user já usa isso em produção; `parallelism` lido da mesma chave `minimax_render_concurrency` para consistência.
- **Risco:** partes ficarem >48 MB mesmo após raster (PDFs com muitas ilustrações). **Mitigação:** `splitCleanPdfByPages` já halves recursivamente até caber.
- **Risco:** algum PDF que hoje passa pelo pdf-lib halving deixa de passar. **Mitigação:** o raster novo só é ativado para provider = GLM. Mistral/Gemini/MiniMax mantêm o fluxo antigo.
- **Risco a Prev:** nulo. Nenhum arquivo do Prev é aberto, nenhuma tabela/bucket do Prev tocada, o Prev continua importando exclusivamente do próprio `pautas.ts` sem qualquer redirecionamento.

## Decisões que assumi (avise se quiser mudar antes do build)

- **Raster só para GLM** (não para outros providers). Se quiser universalizar, ampliamos.
- **Duplicação** das funções em vez de extração — Prev intocado. Se quiser consolidar mais tarde, é uma refatoração isolada.
- **Original + limpo mantidos no storage**. Se preferir apagar o original (economizar espaço), aviso — mas Trabalhista costuma auditar, então mantive por default.
- **Toggle `import_strategy` fica** neste plano; remoção em plano separado.
