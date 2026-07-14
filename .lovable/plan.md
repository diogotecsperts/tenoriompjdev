# Split de PDFs grandes no Previdenciário (respeitando o provider do DevPanel)

## Resposta às duas dúvidas do Claude

### 1. Como o `preProcessarPericiaComSplit` obtém o `pdf_path`?
**Opção A — passar como parâmetro.** `PautaDetalhe.tsx` já tem `pericia.pdf_path` em memória (é renderizado na lista). Passar como argumento evita 1 round-trip ao Supabase por invocação e mantém a função pura. Assinatura final:

```ts
preProcessarPericiaComSplit(
  periciaId: string,
  pdfPath: string | null,           // vem de pericia.pdf_path
  opts: { signal?, onJobProgress?, onMinimaxProgress? } = {}
): Promise<PreProcessarResult>
```

Se `pdfPath` for `null`/vazio, delega direto para `preProcessarPericia` (que já valida e devolve erro claro).

### 2. Trabalhista já tem chunk — é a mesma coisa?
**Não é a mesma. O do Prev é uma evolução.** Comparação lado a lado:

| Aspecto | Trabalhista (hoje, `ImportarAutosDialog.tsx` L712-781) | Prev (novo) |
|---|---|---|
| Algoritmo | Split linear (estima `bytesPerPage` × `pagesPerPart`) + **rescueSplit** re-tenta partes que estouraram | **Halving recursivo** até cada parte caber em 48MB |
| Threshold | 38MB para GLM, 20MB para outros — **hardcoded no dialog** | 48MB, único (só GLM tem esse teto duro; Mistral aceita >50MB streaming, Gemini vai por Files API, MiniMax é client) |
| Pipeline pós-split | **Cada parte roda o pipeline inteiro** (OCR + extração estruturada) e depois um merger consolida os campos | **OCR-only por parte**, textos concatenados com marcadores `=== CONTINUAÇÃO (parte i/N) ===`, e **uma única** chamada de extração AI generalista com o texto completo |
| Nº de chamadas ao modelo generalista | N (uma por parte) + lógica de merge | **1** (com contexto completo) |
| Risco de duplicar/perder campos entre partes | Existe — o merger precisa deduplicar seções que aparecem em duas partes | **Zero** — a IA vê o processo inteiro de uma vez |
| Consistência com o DevPanel | Hoje o Trabalhista **quebra** essa regra em outros pontos (bug do "Gemini fantasma" descrito em `.lovable/plan.md`); o split em si respeita, mas o resto da pipeline não | **Respeita 100%** — passa por `runOcrWithConfiguredProvider` do lado server em cada parte |

**Ganhos reais da abordagem Prev:**
1. **Custos menores:** 1 chamada de IA generalista em vez de N.
2. **Melhor qualidade de extração:** modelo vê nexo causal, quesitos e conclusões no mesmo contexto — nada de campo "cortado no meio" entre partes.
3. **Menos código de merge para manter** (o merger do Trabalhista é uma fonte histórica de bugs de deduplicação).
4. **Halving recursivo é auto-corretivo:** se `bytesPerPage` for irregular (PDF com 3 páginas de imagem + 200 de texto), o algoritmo continua dividindo até caber, sem precisar de "rescueSplit" como camada extra.

**Pode ser aplicado no Trabalhista depois?** Sim, com 2 ressalvas técnicas — por isso não faremos agora:
- **Janela de contexto do modelo generalista.** Um processo trabalhista de 500+ páginas concatenado pode ultrapassar ~500k chars. Antes de portar, precisamos medir o percentil 95 de tamanho concatenado real (via `ai_usage_logs.prompt_length`) e confirmar que cabe no modelo ativo. Se não couber, o merge parte-a-parte do Trabalhista continua sendo necessário para os casos gigantes — o padrão vira **híbrido**: OCR sempre por parte + generalista único quando cabe, generalista parte-a-parte + merge só nos outliers.
- **Custo de refatorar o merger.** O merge atual está entrelaçado com dedução de seções, quesitos e resumos individuais (`gerar-resumos`). Remover isso exige regressão cuidadosa dos ~75 campos do `laudos`. Trabalho não trivial, mas isolado no `processar-autos`.

Recomendação: **implementar no Prev primeiro (é onde o bug está e a superfície é menor), estabilizar por 1-2 semanas em produção, e só então portar** com o fluxo híbrido acima. Sem risco para o Trabalhista até lá.

---

## Plano de implementação (Previdenciário)

Segue idêntico ao anterior, com a assinatura ajustada para a opção A.

### 1. `src/modules/previdenciario/api/pautas.ts`
Adicionar:
- `PREV_SPLIT_MAX_BYTES = 48 * 1024 * 1024` (defensivo vs. teto 50MB do GLM).
- `prevPdfNeedsSplit(blob: Blob | File): boolean` — só compara `size`.
- `splitPrevPdf(blob, maxBytes = PREV_SPLIT_MAX_BYTES)` via `pdf-lib` (já no projeto), **halving recursivo**: divide em metades até cada parte caber. Retorna `Array<{ blob, startPage, endPage, totalPages }>`. Se uma única página sozinha exceder o limite, lança erro `file_too_large` com mensagem clara.
- `uploadPericiaPdfPart(userId, periciaId, index, blob)` → path `{userId}/{periciaId}/parts/part-{index}.pdf` no bucket `prev-pdfs`.
- `deletePericiaPdfParts(userId, periciaId)` — remoção best-effort ao final.

### 2. Nova edge function `supabase/functions/prev-ocr-part/index.ts`
Enxuta e reutiliza infra existente:
- Registrar em `supabase/config.toml` com `verify_jwt = true` e `wall_clock_limit = 300`.
- Body: `{ periciaId: string, partPath: string }` (Zod).
- Valida JWT, confirma que `partPath` começa com `{user.id}/{periciaId}/parts/` e que a `pericia` pertence ao user.
- Baixa do bucket `prev-pdfs` e chama `runOcrWithConfiguredProvider(bytes, { logPrefix })` — **mesmo helper do DevPanel usado em `prev-pre-processar`**, garantindo GLM/Mistral/Gemini corretos.
- Se receber `MINIMAX_CLIENT_RASTERIZE_ERROR`, devolve `409 { needsClientRasterize: true, mode, chunkEndpoint, pdfPath: partPath, bucket: "prev-pdfs" }` — o client cai em `runMinimaxClientOcr(partBlob, ...)` parte por parte, mantendo o padrão MiniMax existente.
- Sucesso → `{ ok: true, text, pageCount, provider, model }`.
- Registra `ai_usage_logs` com `prompt_type: 'ocr_prev_part'` para auditoria/DevPanel.

### 3. `src/modules/previdenciario/api/processar.ts`
Nova função exportada — não altera `preProcessarPericia`:

```ts
export async function preProcessarPericiaComSplit(
  periciaId: string,
  pdfPath: string | null,
  opts: { signal?; onJobProgress?; onMinimaxProgress? } = {},
): Promise<PreProcessarResult>
```

Fluxo:
1. Se `!pdfPath` ou `blob.size` cabe no limite → delega para `preProcessarPericia` (**caminho rápido, zero mudança**).
2. Caso contrário:
   - `onJobProgress("Dividindo PDF grande em partes...")`
   - `splitPrevPdf(blob)` → sobe cada parte via `uploadPericiaPdfPart`.
   - Loop **sequencial** (respeita `signal.aborted` em cada iteração):
     - `supabase.functions.invoke("prev-ocr-part", { periciaId, partPath })`.
     - Se `needsClientRasterize` → `runMinimaxClientOcr(partBlob, ...)`.
     - Acumula `text`, `pageCount`, `provider`, `model` (usa o do 1º sucesso como representativo).
   - Concatena: `parts.map((p, i) => \`=== CONTINUAÇÃO (parte ${i+1}/${N}, págs ${p.start}-${p.end}) ===\\n${p.text}\`).join("\\n\\n")`.
   - `ensureFreshSession()` + `invoke("prev-pre-processar", { periciaId, preExtractedText, preExtractedProvider, preExtractedModel, preExtractedPageCount })`.
   - Se resposta for `AsyncPreProcessarStart` → `pollPreProcessarJob(...)` (já existe).
   - `finally`: `deletePericiaPdfParts` (best-effort, não bloqueia sucesso).
- Reusa `classifyInvokeError`, `readErrorBody`, `PreProcessarError`, `pollPreProcessarJob`, `providerDisplayName`, `formatStageLabel` — zero duplicação.

### 4. `src/modules/previdenciario/pages/PautaDetalhe.tsx`
Trocas mínimas (não mexe em state, progresso, aborters):
- `handleProcessar(pericia)` → chama `preProcessarPericiaComSplit(pericia.id, pericia.pdf_path, opts)`.
- `handleProcessarLote()` → idem no loop.
- Update do import no topo.

## O que NÃO muda
- `preProcessarPericia` original (caminho rápido intacto).
- `prev-pre-processar/index.ts` (o gancho `preExtractedText` na L1068 já existe).
- `glm-ocr.ts`, `ocr-router.ts`, `ai-config`, `getAIConfig` — provider continua vindo do DevPanel dinamicamente.
- `uploadPericiaPdf`, `UploadLotePdfsDialog`, `NovaPericiaDialog`.
- Trabalhista, Impugnação, DevPanel, DB — **zero migração**.

## Riscos e mitigações
- **Página única > 48MB:** `splitPrevPdf` propaga `PreProcessarError("file_too_large")` com mensagem clara. Extremamente raro.
- **Parte temporária órfã se o browser cair no meio:** `parts/` fica no bucket até nova execução (que sobrescreve com `upsert:true`) ou limpeza manual. Custo desprezível; podemos adicionar TTL depois.
- **Custo extra em `ai_usage_logs`:** N registros OCR por PDF grande — auditável via `prompt_type='ocr_prev_part'`.
- **Timeout de invoke:** cada parte é uma chamada independente (~90s p/ GLM 48MB); progresso reportado via `onJobProgress` a cada parte.

## Como o usuário valida
1. Subir um PDF Previdenciário >50MB com GLM ativo no DevPanel.
2. Ver toasts sequenciais: "Dividindo…" → "Processando parte 1/N…" → "Refinando campos via GLM" → "Concluído".
3. DevPanel → Logs de Uso de IA: registros `ocr_prev_part` com `provider=glm`, e ao final 1 registro de extração estruturada. Nada de "gemini fantasma".
4. PDF ≤48MB: fluxo idêntico ao atual, sem toast de split — garantia de zero regressão no caminho rápido.
