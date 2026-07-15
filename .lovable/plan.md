
# Fix: limite de 100 páginas do GLM-OCR em PDFs grandes

## Diagnóstico

O `rebuildPdfAsRasterClean` já resolve o problema de **bytes** (62MB → ~20MB). Mas o erro atual do GLM é outro:

```
OCR only supports PDF, JPG, PNG, JPEG formats
file size limit: images ≤ 10MB, PDF ≤ 50MB;
PDF max 100 pages
```

O GLM tem **dois limites simultâneos**: 50MB **E** 100 páginas. O PDF limpo de 114 págs passa em bytes mas falha em páginas.

## Regra de segurança crítica (invariante)

- **PDFs que hoje funcionam continuam intocados.** A nova rota só é ativada quando `size > 48MB` **OU** `pageCount > 90`. Se nenhum limite for excedido, o fluxo é literalmente o caminho rápido atual (`preProcessarPericia`), zero mudança.
- Zero mudança em `prev-ocr-part`, `prev-pre-processar`, `glm-ocr.ts`, DevPanel, `system_config`, config.toml, Trabalhista, Impugnação.
- O PDF original nunca é sobrescrito. Tudo temporário vive em `-clean.pdf` e `parts/`.

## O que muda

### 1. Constante nova em `pautas.ts`

```ts
// Margem defensiva abaixo do limite real de 100 páginas do GLM.
export const PREV_SPLIT_MAX_PAGES = 90;
```

### 2. Nova função `splitCleanPdfByPages` em `pautas.ts`

Divisão **sequencial por páginas** (não halving) — só faz sentido no PDF limpo raster, onde cada página tem tamanho proporcional e independente (sem `/Resources` compartilhado).

```ts
export async function splitCleanPdfByPages(
  cleanSource: Blob | Uint8Array,
  maxPages: number = PREV_SPLIT_MAX_PAGES,
  maxBytes: number = PREV_SPLIT_MAX_BYTES,
): Promise<PrevPdfSplitPart[]>
```

Fluxo:
- Carrega com `pdf-lib`.
- Percorre em janelas de `maxPages` (0..89, 90..179, ...).
- Para cada janela: clona doc, remove tudo fora do range, salva.
- Se a parte gerada ainda exceder `maxBytes` (raro no raster), reduz a janela pela metade e reserializa. Como o raster é proporcional, converge em 1-2 passos.
- Retorna `PrevPdfSplitPart[]` — mesmo shape do `splitPrevPdf` (reusa `ocrSinglePart` sem mudanças).

Não substitui `splitPrevPdf`; convive como função dedicada ao PDF **já limpo**.

### 3. Ajuste em `preProcessarPericiaComSplit` (`processar.ts`)

Ponto único de decisão após o rebuild:

```
rasterAndUploadCleanPdf(...) → { path, sizeBytes, pageCount }

if (sizeBytes ≤ 48MB && pageCount ≤ 90):
    swap pdf_path → cleanPath
    preProcessarPericia(...)            // 1 chamada GLM
else:
    splitCleanPdfByPages(cleanBlob, 90, 48MB)
    para cada parte: uploadPericiaPdfPart + ocrSinglePart (retry já embutido)
    concatena texto + prev-pre-processar com preExtractedText
```

Mudanças concretas na função:
- Após `rasterAndUploadCleanPdf`, avalia `sizeBytes > 48MB || pageCount > PREV_SPLIT_MAX_PAGES`.
- No ramo split: troca `splitPrevPdf(cleanBlob)` por `splitCleanPdfByPages(cleanBlob, PREV_SPLIT_MAX_PAGES, PREV_SPLIT_MAX_BYTES)`. Todo o resto (upload de parts, loop `ocrSinglePart`, concatenação, `prev-pre-processar` com `preExtractedText`, `withRetry`, `pollPreProcessarJob`, cleanup no `finally`) fica idêntico.
- Log claro: `[prev-rebuild] limpo: X.XMB / N págs → decisão: single-shot | split N-partes`.

### 4. Ativação do gatilho na entrada

Hoje o gatilho de rebuild é só `prevPdfNeedsSplit(blob)` (size > 48MB). Para casos de PDF ≤ 48MB **mas** > 90 págs (raros mas possíveis com muitas páginas leves de texto), precisamos ativar o rebuild também. Duas opções:

- **(a)** Fazer um `probe` rápido do pageCount antes de decidir (carregar com pdf-lib só para `getPageCount`, ~50-200ms). Se `> 90`, entra na rota de rebuild+split.
- **(b)** Deixar o GLM falhar e cair num handler que aciona o rebuild retroativamente.

**Recomendada: (a).** É determinística, custa milissegundos e evita queimar uma chamada de OCR sabidamente inválida. O `probe` já usa o `blob` que baixamos para checar tamanho.

Ajuste no início de `preProcessarPericiaComSplit`:

```ts
const pageCount = await probePdfPageCount(blob);  // pdf-lib load + getPageCount
const needsSplitByBytes = prevPdfNeedsSplit(blob);
const needsSplitByPages = pageCount > PREV_SPLIT_MAX_PAGES;
if (!needsSplitByBytes && !needsSplitByPages) {
    return preProcessarPericia(periciaId, opts);  // caminho rápido intocado
}
```

`probePdfPageCount` é uma helper exportada de `pautas.ts` — 3 linhas com `pdf-lib`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/modules/previdenciario/api/pautas.ts` | Add `PREV_SPLIT_MAX_PAGES`, `probePdfPageCount`, `splitCleanPdfByPages`. `splitPrevPdf` e `rebuildPdfAsRasterClean` intocados. |
| `src/modules/previdenciario/api/processar.ts` | Gate de entrada considera `pageCount > 90`; ramo split usa `splitCleanPdfByPages` no PDF limpo. Retry, cleanup, cancelamento, callbacks — tudo idêntico. |
| `.lovable/plan.md` | Atualiza o plano registrado. |

**Zero mudança** em: edge functions (`prev-ocr-part`, `prev-pre-processar`, `glm-ocr`), DevPanel, DB, storage buckets, config.toml, módulos Trabalhista/Impugnação, hooks/UI/pages.

## Cautelas explícitas

1. **PDFs pequenos (≤ 48MB E ≤ 90 págs) seguem 100% o fluxo atual.** O `probePdfPageCount` só decide qual rota, não altera comportamento no caminho rápido.
2. **`splitPrevPdf` legado permanece** — reservado só como fallback teórico (não usado no novo caminho). Não é removido para não regredir cenários não previstos.
3. **`splitCleanPdfByPages` só opera sobre o PDF já rasterizado limpo**, onde as páginas são independentes. Nunca é chamado no PDF original (que sofre da inflação por `/Resources`).
4. **Retry universal preservado.** Cada `ocrSinglePart` e a chamada final `prev-pre-processar` já rodam sob `withRetry` (3 tentativas).
5. **Cancelamento (`signal.aborted`) tem precedência absoluta** — checado antes de cada janela de split e antes de cada upload.
6. **Cleanup no `finally` já existente cobre `-clean.pdf` e `parts/`** — nada muda ali.

## Impacto em tempo

- 100 págs, ≤ 48MB, PDF texto: fluxo rápido antigo (sem mudança).
- 114 págs, PDF original 63MB → clean ~20MB / 114 págs:
  - Rasterização: ~1-2min (concorrência 4)
  - Split por páginas: 2 partes (90 + 24), quase instantâneo (raster já é leve)
  - 2 chamadas GLM sequenciais: ~1min cada → ~2min
  - **Total: ~3-4min** contra as falhas atuais.
- Overhead vs. hipotético "single-shot" (que o GLM não aceita): 1 chamada GLM extra (~60s). Preço aceitável dado o limite fixo do provider.

## Validação pós-implementação

1. PDF pequeno (30MB, 40 págs): confirma que segue o fluxo antigo (nenhum log `[prev-rebuild]`).
2. PDF de 114 págs / 63MB: espera 2 partes de OCR (`OCR parte 1/2 págs 1-90`, `OCR parte 2/2 págs 91-114`), sem loops de 114 rasterizações unitárias.
3. PDF de 45MB mas 120 págs: dispara rebuild + split por páginas mesmo estando abaixo do limite de bytes.
4. Cancelar no meio do split: aborta em < 2s, restaura `pdf_path` original, limpa `parts/` e `-clean.pdf`.
5. Forçar falha transitória (500) numa parte: `withRetry` retenta 3× antes de propagar.
