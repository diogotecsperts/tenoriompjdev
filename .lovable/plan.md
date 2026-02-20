

# Plano — Corrigir recuperacao de resultados parciais + proteger metadata

## Bugs identificados

### Bug 1 (CRITICO): Resultados parciais nunca chegam ao frontend

Na funcao `check-import-status/index.ts`, linha 90:

```typescript
if (job.status === 'completed' && job.result) {
  response.result = job.result;
}
```

Os resultados parciais so sao enviados quando `status === 'completed'`. Mas quando a funcao crashou (OOM), o status fica como `processing`. O salvamento progressivo (Operacao B) grava os dados no campo `result` do banco corretamente, mas o `check-import-status` **IGNORA** esse campo para qualquer status que nao seja `completed`.

O frontend detecta o job como stale, mas `data.result` e `undefined` — entao nunca mostra o botao "Usar resumos gerados".

**Evidencia**: Log do console `23:26:22 Job appears stale` sem nenhum log subsequente de "Found partial results".

**Fix**: Tambem retornar `result` quando contem `partial: true`, independente do status.

### Bug 2: Metadata do visionResult perdida

Na memoria da Operacao A, `visionResult = null` na linha 2634. Mas linhas 2688-2693 ainda acessam:
- `visionResult?.provider` → retorna `undefined` (deveria ser o provider real)
- `visionResult?.usedFallback` → retorna `false` (pode estar errado)
- `visionResult?.originalProvider` → retorna `undefined`
- `visionResult?.fallbackReason` → retorna `undefined`

Esses dados sao usados no objeto `result` final para analytics. Precisam ser capturados antes do null, assim como foi feito com `finishReason`.

---

## Operacoes

### Operacao 1 — Corrigir check-import-status (Bug critico)

Em `supabase/functions/check-import-status/index.ts`, alterar a logica de inclusao do `result`:

**Antes (linha 90-92):**
```typescript
if (job.status === 'completed' && job.result) {
  response.result = job.result;
}
```

**Depois:**
```typescript
if (job.result) {
  // Always return result if available - includes partial results from progressive save
  // Frontend uses result.partial to determine if recovery is needed
  response.result = job.result;
}
```

### Operacao 2 — Salvar metadata do visionResult antes de liberar memoria

Em `supabase/functions/processar-autos/index.ts`, antes de `visionResult = null` (linha 2634), salvar todas as propriedades que sao referenciadas depois:

```typescript
// Save all visionResult metadata before freeing memory
const visionFinishReason = visionResult?.finishReason || 'STOP';
const visionProvider = visionResult?.provider || 'unknown';
const visionUsedFallback = visionResult?.usedFallback || false;
const visionOriginalProvider = visionResult?.originalProvider;
const visionFallbackReason = visionResult?.fallbackReason;
```

E substituir as 4 referencias nas linhas 2688-2693:
- `visionResult?.provider` → `visionProvider`
- `visionResult?.usedFallback` → `visionUsedFallback`
- `visionResult?.originalProvider` → `visionOriginalProvider`
- `visionResult?.fallbackReason` → `visionFallbackReason`

---

## Escopo

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/check-import-status/index.ts` | Retornar `result` quando existe (nao apenas quando completed) |
| `supabase/functions/processar-autos/index.ts` | Salvar metadata do visionResult antes do null + usar variaveis salvas |

### Resultado esperado

Apos esta correcao, quando a funcao crashar durante o ultimo resumo:
1. Os resumos parciais ja estarao salvos no banco (salvamento progressivo existente)
2. O `check-import-status` VAI retornar esses dados ao frontend
3. O frontend VAI mostrar o botao "Usar X resumos gerados"
4. O usuario recupera os dados sem precisar reimportar

