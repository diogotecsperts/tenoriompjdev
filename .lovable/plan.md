# Correção do bug catastrófico de split no Trabalhista GLM

## Diagnóstico (confirmado pelos artefatos enviados)

Do relatório: PDF 16.4 MB / 375 págs → `rebuildPdfAsRasterClean` produziu um PDF limpo de **55.7 MB** a 120dpi/0.65 (segunda passada, já comprimida no máximo).

Do print: aparecem "Parte 157 (55.7MB) ... Parte 209 (55.7MB) ..." — **cada parte com o tamanho do PDF limpo inteiro**, e centenas delas.

Isso identifica exatamente uma coisa: `splitCleanPdfByPages` (em `src/lib/pdf-preprocess.ts`) é a origem do bug. O que aconteceu passo a passo:

1. O novo pipeline chamou `rebuildPdfAsRasterClean` (OK) → gerou o PDF limpo de 55.7 MB.
2. Como `55.7 MB > 48 MB (maxBytes)`, entrou em `splitCleanPdfByPages`.
3. Dentro dela, `serializeRange(start, end)` **recarrega o PDF limpo inteiro no pdf-lib e chama `doc.removePage()` para as páginas fora da janela**. Isso **não remove os XObjects (JPEGs) associados** — o pdf-lib preserva os recursos órfãos. Resultado: cada "parte" salva com ~55.7 MB.
4. Como cada janela de 90 págs continua > 48 MB, a recursão `emitRange` subdivide (`mid`) e chama de novo… e de novo… até `startIdx === endIdx` (página única), que ainda é ~55.7 MB e é empurrada como parte marcada `needsClientRasterize: true`.
5. Isso produz **375 "partes" de página única, cada uma com 55.7 MB** — exatamente o que o print mostra.

Ou seja, `splitCleanPdfByPages` sozinha carrega o vício "PDF-lib herda recursos órfãos" que o comentário em `rebuildPdfAsRasterParts` (linhas 175-181) explicitamente avisa que precisa evitar. Ela nunca deveria ter sido o caminho principal no Trabalhista para PDFs grandes.

**O Previdenciário não quebrou** porque `pautas.ts` (a cópia dele desses helpers) não foi alterado nesta rodada — o gate lá continua igual e não vi mudanças de comportamento.

## Correção

Reverter o Trabalhista GLM para o único método de split que já sabíamos ser correto — `rebuildPdfAsRasterParts` — mas **mantendo o gate condicional** do Previdenciário (o ganho que queríamos preservar): PDFs pequenos passam direto sem rasterizar; grandes vão pelo caminho seguro.

### `src/components/tools/ImportarAutosDialog.tsx` (só o bloco `if (isGlm)`)

Trocar o pipeline "clean único → splitCleanPdfByPages" pelo pipeline seguro:

```text
probe(pageCount, sizeBytes)
  ├─ needsRasterSplit? (pageCount>90 || size>48MB)
  │   ├─ NÃO → segue direto com o PDF original (fast path já implementado)
  │   └─ SIM → rebuildPdfAsRasterParts(source, 90, 48MB)
  │            → devolve N partes já rasterizadas por janela,
  │              cada parte construída do zero (sem herdar recursos)
  └─ upload de cada parte → trabalhista-ocr-part → estruturação
```

Especificamente:
- Remover a chamada a `rebuildPdfAsRasterClean` seguida de `splitCleanPdfByPages` do caminho pesado.
- Substituir por uma única chamada `rebuildPdfAsRasterParts(source, RASTER_SPLIT_MAX_PAGES, RASTER_SPLIT_MAX_BYTES, { onPageProgress, signal })`.
- Manter a UI: `updateGlmStage('raster', ...)` durante o `onPageProgress`, e `updateGlmStage('split', 'completed')` ao final com `parts.length`, págs/parte e MB/parte reais.
- O caminho rápido (PDF cabe direto) fica como está.

### `src/lib/pdf-preprocess.ts`

- **Não remover** `splitCleanPdfByPages` — o Previdenciário pode estar usando (verificarei), então mantenho intocada. Só deixo de ser chamada pelo Trabalhista.
- Adicionar comentário no topo de `splitCleanPdfByPages` avisando que ela não é segura para PDFs limpos com recursos JPEG grandes (herda XObjects), para evitar reincidência.

## Por que isso resolve

- `rebuildPdfAsRasterParts` **cria cada parte do zero** — abre um `PDFDocument` novo, embute só os JPEGs das páginas daquela janela, salva. Sem herança de recursos, sem inflar. Já é o método que estava funcionando antes da última mudança e é o que o print de auditoria ("PDF limpo gerado: 375 págs · 55.7MB") mostra que não é o problema.
- Ganho de tempo do "gate condicional" segue preservado: PDFs ≤ 90 págs e ≤ 48 MB pulam a rasterização inteira.
- Nenhum toque em Mistral, MiniMax OCR, Previdenciário, ou em `pautas.ts`.

## Segurança e reversão

- Diff mínimo: só o corpo do `if (isGlm)` em `ImportarAutosDialog.tsx` + comentário informativo em `pdf-preprocess.ts`.
- Reversão trivial: se qualquer coisa der errado, `rebuildPdfAsRasterParts` já é o comportamento anterior conhecido.
- Vou confirmar antes de aplicar: (a) que `splitCleanPdfByPages` **não** é chamada em nenhum lugar do Previdenciário; (b) que `rebuildPdfAsRasterParts` continua exportada e íntegra.

## Escopo negativo (não vou tocar)

- Nada em `src/modules/previdenciario/**`.
- Nada em `_shared/glm-ocr.ts`, `_shared/mistral-ocr.ts`, `processar-autos`, `trabalhista-ocr-part`.
- Sem novas migrations, sem novos secrets.
