
# Rebuild raster do PDF + retry universal

## Diagnóstico do que está acontecendo hoje

Fluxo atual quando o PDF entra em `preProcessarPericiaComSplit`:

```
PDF 114 págs
  → splitPrevPdf() usa PDFDocument.load + removePages
    → cada range ainda sai gigante (bug do /Resources compartilhado)
    → halving recursivo divide até 1 pág por parte
      → cada parte de 1 pág vira `needsClientRasterize: true`
        → cada uma cai no ocrPartClientSide (rasteriza 1 pág, manda 1 chunk pro MiniMax)
```

Resultado: 114 chamadas MiniMax sequenciais, ~5-6s cada = ~10 min. É por isso que você vê "parte 3/114 · rasterizing" andando lentamente.

O problema **não** é o `pdfjs` — ele rasteriza rápido. O problema é fazer isso **uma parte por vez, com uma chamada ao provider por parte**, quando o certo seria **rasterizar tudo, montar um PDF limpo único e mandar em UMA chamada**.

## Camada 1 — Rebuild raster único (substitui o split atual)

Em vez de dividir o PDF em N partes e chamar o provider N vezes, quando o PDF exceder 48MB (ou quando `pdf-lib` não conseguir enxugar via clone+remove), faz-se **uma única passada** de rasterização client-side que reconstrói o PDF do zero:

```
Para cada página do PDF (em paralelo, concorrência 4):
  1. pdfjs renderiza a página em canvas a 150 DPI
  2. canvas.toBlob("image/jpeg", q=0.75) → JPEG comprimido
  3. pdf-lib.embedJpg() → adiciona como nova página do novo PDF

Salva o novo PDF (só imagens, sem /Resources herdado).
Se novo PDF ≤ 48MB → envia como PDF normal para prev-pre-processar (uma única chamada de OCR do provider do DevPanel).
Se ainda > 48MB → reduz DPI para 120 e/ou qualidade JPEG para 0.65 e repete UMA vez.
Se ainda assim > 48MB (praticamente impossível para 114 págs) → aí sim divide o PDF-raster limpo em 2-3 partes ≤48MB e faz N chamadas — mas agora N pequeno (2-3), não 114.
```

**Ganhos concretos para o PDF de 114 págs:**
- Raster 150 DPI JPEG q=0.75: ~120-250 KB por página → PDF final ~15-25 MB
- Uma única chamada ao provider configurado no DevPanel (GLM/Mistral/Gemini), não 114
- Tempo estimado: ~1-2 min de rasterização + 30-90s de OCR do provider = **~2-4 min total** (contra ~10 min atuais)
- Zero dependência de `runMinimaxClientOcr` no fluxo padrão — respeita o provider global do DevPanel

**Onde o código muda:**
- `src/modules/previdenciario/api/pautas.ts`
  - Nova função `rebuildPdfAsRasterClean(source, opts)`: retorna um `Blob` de PDF limpo.
  - Nova função `rasterAndUploadCleanPdf(userId, periciaId, source, opts)`: rebuilda e sobe pro `prev-pdfs/{userId}/{periciaId}-clean.pdf`, retorna o path.
  - `splitPrevPdf` continua existindo mas vira **fallback** só usado se o rebuild raster falhar (nunca deveria).
- `src/modules/previdenciario/api/processar.ts` (`preProcessarPericiaComSplit`)
  - Se `prevPdfNeedsSplit(blob)`:
    1. `opts.onJobProgress?.("PDF grande: gerando versão limpa...")`
    2. Chama `rasterAndUploadCleanPdf(...)` reportando progresso página-a-página (`opts.onJobProgress?.(...)`).
    3. Chama `preProcessarPericia(periciaId, opts)` **apontando pro PDF limpo** (via update do `pdf_path` da perícia OU passando um override; ver "Detalhe técnico" abaixo).
    4. Após sucesso, deleta o `-clean.pdf` (best-effort).
  - Zero mudança no caminho ≤48MB.
- **Zero mudança em:** `prev-ocr-part` (fica como fallback histórico), `prev-pre-processar`, DevPanel, DB, config.toml, Trabalhista, Impugnação.

**Detalhe técnico do path do PDF limpo:**
Duas opções, a decidir na implementação:
- **(a)** Atualizar temporariamente `prev_pericias.pdf_path` para apontar pro `-clean.pdf`, chamar `preProcessarPericia`, e restaurar o `pdf_path` original ao final (o PDF original nunca é apagado — o `-clean.pdf` é auxiliar).
- **(b)** Baixar o PDF limpo no browser e passar via `preExtractedText`? Não — o objetivo é justamente **não** rasterizar+OCR client-side. Descartada.
- **Recomendada: (a).** É reversível, mantém o PDF original intacto e usa exatamente a mesma edge function que sempre foi usada.

## Camada 2 — Retry universal (3 tentativas com backoff)

Novo helper em `src/modules/previdenciario/api/processar.ts`:

```ts
async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  opts: { attempts?: number; signal?: AbortSignal; onProgress?: (msg: string) => void } = {},
): Promise<T> { ... }
```

Regras:
- 3 tentativas por default.
- Backoff exponencial: 2s → 4s → 8s (com jitter ±25%).
- **Retryable:** `rate_limited`, `provider_timeout`, `provider_unavailable`, `response_truncated`, erros de rede (fetch), `5xx`, `504`.
- **Não retryable (aborta imediato):** `quota_exceeded`, `invalid_key`, `session_expired`, `canceled`, `invalid_request`, `unsupported_file`, `file_too_large`.
- Respeita `signal.aborted` entre tentativas.
- Cada nova tentativa: `opts.onProgress?.(\`${label} — tentativa ${n}/3\`)` + refresca sessão (`ensureFreshSession`).
- Loga cada falha intermediária no console para o DevPanel (`console.warn`).

**Onde envolver com retry:**
1. `preProcessarPericia` — a invoke inicial de `prev-pre-processar` e a invoke final com `preExtractedText`.
2. `preProcessarPericiaComSplit` — a invoke final com `preExtractedText` (a mais importante: é onde a IA generalista roda).
3. `ocrSinglePart` — invoke de `prev-ocr-part`.
4. `runMinimaxClientOcr` (client OCR chunk-a-chunk) — já tem retry interno próprio; **não** envolver de novo (evita retry duplo). Confirmar no código antes de mexer.
5. `pollPreProcessarJob` — polling em si não retenta, mas se `checkStatus` levantar erro transitório, retenta o `checkStatus` (não o job todo).

**Garantia de "nunca fingir sucesso":**
- `preProcessarPericiaComSplit` só retorna `PreProcessarResult` depois que `preProcessarPericia`/`pollPreProcessarJob` retornou `status === "completed"` com `documentosCriados > 0` OU o backend explicitamente sinalizou sucesso.
- Se todas as 3 tentativas falharem, propaga o último `PreProcessarError` pro caller (o UI mostra o toast de erro que já existe).
- Nenhum `try/catch` engolindo erro no caminho principal.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/modules/previdenciario/api/pautas.ts` | Adiciona `rebuildPdfAsRasterClean` e `rasterAndUploadCleanPdf`. `splitPrevPdf` mantido como fallback. |
| `src/modules/previdenciario/api/processar.ts` | Adiciona `withRetry`. Envolve as invokes críticas. Reescreve `preProcessarPericiaComSplit` para usar rebuild raster + swap temporário de `pdf_path`. |
| `.lovable/plan.md` | Atualiza o plano registrado. |

**Zero mudança em:** `prev-ocr-part`, `prev-pre-processar`, `minimax-ocr-chunk`, `gemini-ocr-chunk`, DevPanel, `system_config`, `supabase/config.toml`, Trabalhista, Impugnação.

## Cautelas explícitas (você pediu)

1. **PDFs ≤ 48MB continuam intocados.** O rebuild raster só roda quando `prevPdfNeedsSplit(blob) === true`. Zero regressão no caminho rápido.
2. **PDF original nunca é sobrescrito.** O `-clean.pdf` é auxiliar e vive em path separado (`{userId}/{periciaId}-clean.pdf`). Se algo der errado no meio, o `pdf_path` original é restaurado no `finally`.
3. **Retry não envolve etapas com retry próprio** (evita cascata multiplicativa de tentativas).
4. **Cancelamento pelo usuário** (`signal.aborted`) tem precedência absoluta sobre retry — nunca retenta depois de cancelar.
5. **Erros não-retryable** (quota, chave inválida, arquivo grande demais) falham imediato sem gastar 3 tentativas — não há por que insistir num erro fixo.

## Validação pós-implementação

1. Reupload do mesmo PDF de 114 págs que travou.
2. Console deve mostrar: `[prev-rebuild] rasterizando 114 págs...`, progresso incremental, `[prev-rebuild] PDF limpo: X.XMB`, uma única `[prev-pre-processar]` chamada.
3. Tempo total esperado: **2-4 min** (contra ~10 min atuais).
4. Simular falha transitória (rate limit) forçando um erro no primeiro attempt → console deve mostrar `tentativa 2/3` e sucesso na retry.
5. Cancelar no meio da rasterização → deve parar em < 2s.
6. PDF pequeno (≤ 48MB) → segue exatamente o fluxo antigo, sem tocar em rebuild nem retry extra.

## Sobre aplicar no Trabalhista depois

O Trabalhista (`processar-autos`) hoje usa **chunking baseado em texto** (após OCR já concluído), diferente do problema aqui (que é OCR de PDF gigante). São problemas distintos: o previdenciário sofre no OCR de entrada; o trabalhista já resolve isso via `processar-autos` que tem estratégia própria (`estrategia-hibrida-single-pass`).

Ainda assim, o wrapper `withRetry` daqui é **genérico** — depois que o previdenciário estabilizar, pode ser extraído para `src/lib/with-retry.ts` e aplicado nas invokes do Trabalhista (`processar-autos`, `check-import-status`) para dar a mesma garantia de 3 tentativas. Isso é uma tarefa posterior, fora deste plano, e sem risco: é só envelopar chamadas existentes.
