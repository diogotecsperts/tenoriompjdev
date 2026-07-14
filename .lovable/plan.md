# Corrigir split de PDFs com Resources compartilhados

## Causa raiz confirmada

O erro "página 1 excede 48MB (53.6MB)" **não é** porque a página realmente pesa isso. É um comportamento conhecido do `pdf-lib` em `src/modules/previdenciario/api/pautas.ts` (função `serializeRange`):

- PDFs judiciais grandes são geralmente montados com um **dicionário `/Resources` compartilhado** na árvore de páginas (fontes, XObjects, imagens comuns).
- `PDFDocument.create()` + `copyPages()` **inlineia** esse dicionário inteiro em cada parte gerada — mesmo que a página copiada não use quase nada dele.
- Resultado: qualquer parte, inclusive uma página de índice (só texto/links), sai carregando o peso das outras 113 páginas junto.

O índice/hyperlinks em si **não** causam o inchaço — `copyPages` não segue links, só o grafo `/Page → /Resources`.

## Estratégia de correção (duas camadas)

### Camada 1 — trocar `copyPages` por `clone + removePages`

Em vez de criar um doc vazio e copiar páginas para dentro, **clonar o documento original** e **remover as páginas fora do range**. Ao salvar com `useObjectStreams: true`, o pdf-lib só emite objetos alcançáveis a partir do trailer — resources realmente órfãos são descartados. Para o padrão dos PDFs judiciais, isso costuma cortar 60–90% do inchaço.

Fluxo novo em `serializeRange(startIdx, endIdx)`:

```
doc = await srcDoc.copy()          // clone estrutural
totalPages = doc.getPageCount()
// remove de trás pra frente para não deslocar índices
for i in [totalPages-1 .. endIdx+1]: doc.removePage(i)
for i in [startIdx-1 .. 0]:          doc.removePage(i)
out = await doc.save({ useObjectStreams: true })
```

Se `copy()` não estiver disponível na versão instalada, usa-se o pattern equivalente: `PDFDocument.load(bytes)` novamente por chamada (mais lento, mas isolado) — o `load` já é feito uma vez fora e reaproveitado; o overhead recai só no clone, aceitável para <10 chamadas de halving.

### Camada 2 — fallback rasterizado para páginas patológicas

Se, mesmo após clone+remove, uma **única página** ainda ficar > 48MB (raríssimo, mas possível para páginas com uma imagem enorme legítima), em vez de abortar o job:

- Marcar aquela parte específica como "requer rasterização client-side".
- Reaproveitar `runMinimaxClientOcr` (`src/lib/minimax-ocr-client.ts`) **apenas para essa página**, que rasteriza via `pdfjs-dist` e ignora completamente o tamanho binário do PDF.
- Concatenar o texto retornado no mesmo fluxo de `preExtractedText` que o restante das partes já usa.

Isso NÃO troca o provider global — as outras partes continuam no provider do DevPanel (GLM/Mistral/etc). Só a página patológica cai no rasterizador.

## Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `src/modules/previdenciario/api/pautas.ts` | Reescrever `serializeRange` para usar clone+removePages. Ajustar a mensagem de erro final (agora indicando que nem clone+remove nem rasterização resolveram — cenário improvável). |
| `src/modules/previdenciario/api/processar.ts` | Em `preProcessarPericiaComSplit`, quando `splitPrevPdf` retornar uma parte marcada como `needsClientRasterize`, chamar `runMinimaxClientOcr` para ela antes de concatenar. Demais partes seguem via `prev-ocr-part` (sem mudança). |
| `src/modules/previdenciario/api/pautas.ts` (tipo) | Adicionar campo opcional `needsClientRasterize?: boolean` em `PrevPdfSplitPart` para sinalizar a exceção. |

**Zero mudança em:** `prev-ocr-part`, `prev-pre-processar`, DevPanel, DB, config.toml, Trabalhista, Impugnação.

## Detalhes técnicos

- `pdf-lib` **v1.17.1** (versão já instalada no shared/pdf-splitter): `PDFDocument.load()` seguido de `removePage()` funciona. Não existe `.copy()` público — reaproveita-se o mesmo `srcDoc` mas se recarrega os bytes originais uma vez por range (custo aceitável, halving faz no máximo ~log₂(114) ≈ 7 níveis).
- Recarregar os bytes originais a cada `serializeRange` é seguro em memória: os `bytes` já estão em `Uint8Array` e o GC recolhe os `PDFDocument` intermediários.
- O parâmetro `updateFieldAppearances: false` no `save()` evita reprocessar campos de formulário (irrelevantes aqui, mas acelera).
- Log em `console.info` do ganho por parte (`before/after MB`) para instrumentação em produção.

## Não é este o problema

- **Índice/hyperlinks não inflam o peso.** `copyPages` não segue `/Annot` → `/Dest`; apenas o grafo de recursos gráficos.
- **Compressão** já está ativa (`useObjectStreams: true`). Não há folga aí.
- **Encrypt/DRM** — já tratado com `ignoreEncryption: true`.

## Fluxo de validação após implementação

1. Reupload do mesmo PDF de 114 páginas que gerou o erro.
2. Esperado: split gera N partes ≤ 48MB via clone+remove; nenhuma cai no fallback rasterizado.
3. Log deve mostrar redução de tamanho por parte (ex: "parte 1: 53.6MB → 3.2MB").
4. OCR conclui via provider configurado no DevPanel.
5. Extração generalista roda em chamada única com texto concatenado.

Se o log mostrar que alguma parte ainda saiu grande, a Camada 2 (rasterização client-side apenas naquela parte) absorve o caso — sem travar o job.
