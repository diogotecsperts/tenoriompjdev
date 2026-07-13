
## Diagnóstico

Job atual do Bruno (`9994ae70-7209-455d-b606-99579043781c`) travado no banco em:

```
status=processing  stage=ocr_processing  progress=18
provider=gemini    model=gemini-3.1-flash-lite
updated_at=01:45:26  (sem mexer há >7 min)
```

O que aconteceu:

1. `prev-pre-processar` disparou `runPreProcessJob` em background via `EdgeRuntime.waitUntil` (linha 1038-1041).
2. Dentro do OCR, PDF de 63 MB entrou no caminho `runGeminiOcrChunked` (chunk >30 MB).
3. O worker foi morto pelo runtime **sem executar o `catch`** — provável OOM (150 MB de limite; pdf-lib duplica bytes ao copiar páginas) ou wall-clock (~400s) estourado antes de terminar as 3 partes.
4. Como o `catch` nunca rodou, `finalizeFailedJob` não foi chamado → linha ficou `processing` para sempre → frontend fica em polling até o timeout de 12 min do cliente, então mostra "OCR gemini em execução · 18%" indefinidamente.

Não é bug do Gemini; é worker morto silenciosamente + falta de watchdog.

## Objetivos

1. **Nunca mais travar em silêncio** — job estagnado tem que virar `failed` com mensagem clara em <2 min.
2. **Eliminar a causa raiz do 63 MB** — parar de rasterizar/split em edge (pressão de memória) e usar Gemini Files API por streaming direto do storage.
3. **Feedback incremental durante o chunking** (enquanto ele existir como fallback).

## Mudanças

### 1. Watchdog server-side em `check-prev-processing-status`

Ao consultar um job, se `status IN ('queued','processing')` **e** `updated_at` foi há mais de `120s`, marcar automaticamente como:

```
status=failed
error_code=provider_timeout
error_message="Worker de OCR encerrou sem responder (provável estouro de memória ou tempo em PDF grande). Tente reduzir o PDF ou dividir manualmente."
technical_detail="job zombie: last update at <ts>, stage=<stage>, provider=<provider>"
progress=100
completed_at=now()
```

Retornar o registro já atualizado. Isso quebra o polling infinito em qualquer cliente sem depender do worker morto.

### 2. Streaming direto ao Gemini Files API para PDFs > 30 MB

Em `ocr-router.ts` (`runOcrWithConfiguredProvider`), para provider `gemini` e `pdfBytes.byteLength > 30_000_000`:

- Trocar `runGeminiOcrChunked` (split + Uint8Array por parte) por uma nova função `runGeminiOcrLargeStream` que:
  - Recebe o `Blob` original do storage (via novo parâmetro) e faz `blob.stream()` diretamente para `uploadToGeminiFilesAPIStream` (já existe em `gemini-files-api.ts`).
  - Chama `generateContent` referenciando `fileUri`, sem carregar o PDF em memória do worker.
  - Retorna `provider="gemini-files-stream"`.
- Manter o caminho <30 MB inalterado (single-shot in-memory).
- Ajustar `runPreProcessJob` para passar o `blob` (ou um `stream()` builder) para o router quando o PDF for grande, em vez de sempre materializar `Uint8Array`.

Isso remove o pico de memória de ~180 MB (63 MB bytes + partes pdf-lib) e elimina o OOM. Gemini Files API aceita até 2 GB, então cobre todos os PDFs viáveis.

### 3. Heartbeat durante OCR grande

Antes de cada etapa longa (upload Files API, polling `PROCESSING`, `generateContent`), atualizar o job com progresso incremental:

```
20 → upload iniciado
35 → upload concluído
45 → Gemini processando arquivo
58 → generateContent em execução
60 → OCR concluído
```

Isso serve para:
- UX (usuário vê que está avançando)
- Habilitar o watchdog do item 1 (`updated_at` muda; se parar de mudar, é zumbi de verdade).

### 4. Frontend: detectar estagnação antes do timeout global

Em `pollPreProcessarJob` (`src/modules/previdenciario/api/processar.ts`):

- Guardar `lastUpdatedAt` retornado pelo status.
- Se em 6 polls seguidos (~30-40s) o `updatedAt` não mudar e `status='processing'`, chamar o watchdog explicitamente (o próprio `check-prev-processing-status` já vai finalizar após 120s no lado do servidor) e usar o erro dele.
- Reduzir o `maxWaitMs` global de 12 min para 8 min (com watchdog em 2 min, 8 min é folga suficiente).

### 5. Recuperar o job atual do Bruno

Executar UPDATE único para marcar `9994ae70` como `failed` com a mesma mensagem do watchdog, para o cliente conseguir tentar de novo sem esperar.

## Arquivos afetados

- `supabase/functions/check-prev-processing-status/index.ts` — watchdog de 120s.
- `supabase/functions/_shared/ocr-router.ts` — nova branch streaming; remover chunking com split para >30 MB (manter função só como fallback caso streaming falhe).
- `supabase/functions/_shared/gemini-files-api.ts` — já tem `uploadToGeminiFilesAPIStream`, adicionar helper `generateContentFromFileUri(fileUri, model)` que faz o `generateContent` OCR.
- `supabase/functions/prev-pre-processar/index.ts` — passar `blob` ao router; heartbeats de progresso durante OCR grande.
- `src/modules/previdenciario/api/processar.ts` — detecção de estagnação + `maxWaitMs` menor.
- Uma migration/UPDATE pontual para recuperar `9994ae70`.

## Validação

- Reprocessar o PDF de 63 MB do Bruno → deve subir por streaming (sem pico de memória), completar `ocr_processing` sem chunking, ir para `ai_extraction`.
- Simular worker morto (matar edge function no meio) → em <2 min o próximo poll retorna `failed` com mensagem clara, sem esperar 12 min.
- Reprocessar PDF de 14 MB (Bruno original) → caminho single-shot inalterado.
- Confirmar no `prev_processing_jobs` que nenhum job novo fica >2 min sem `updated_at` mudar.

## Trade-offs

- Streaming ao Files API adiciona ~5-15s de upload para PDFs grandes, mas remove chance de OOM.
- Watchdog pode marcar como `failed` um OCR muito lento (>2 min sem heartbeat). Mitigado pelo heartbeat do item 3 — cada etapa emite update, então só finaliza jobs realmente mortos.
- Não precisa aumentar tamanho da instância Cloud (compute) — o gargalo é memória por invocação, não CPU global.
