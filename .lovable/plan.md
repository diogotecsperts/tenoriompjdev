

## Plano: Corrigir Detecção de Job Stale

### Problema Raiz Identificado

A lógica de detecção de "stale job" no frontend compara `data.updatedAt`, mas a API `check-import-status` **não retorna esse campo**. Como resultado:

```typescript
// Frontend espera:
if (lastJobUpdateRef.current === data.updatedAt) { // undefined === undefined = true
  staleCheckCountRef.current++; // Incrementa SEMPRE
}
```

O contador incrementa a cada poll (3s), disparando o alerta muito antes dos 3 minutos esperados.

### Solução

Adicionar o campo `updatedAt` na resposta da API `check-import-status`.

---

### Correção no Backend

**Arquivo:** `supabase/functions/check-import-status/index.ts`

Adicionar `updatedAt: job.updated_at` na resposta:

```typescript
const response: any = {
  status: job.status,
  progress: job.progress,
  currentStep: job.current_step,
  stepId: job.step_id || null,
  updatedAt: job.updated_at,  // ADICIONAR ESTE CAMPO
  retryInfo: {
    isRetrying: (...),
    retryCount: job.retry_count || 0,
    lastError: job.error || null
  }
};
```

---

### Verificação Adicional

Preciso confirmar que a tabela `import_jobs` tem o campo `updated_at`. Se não tiver, a lógica de stale detection não funcionará corretamente e precisaremos usar uma alternativa (como comparar `currentStep` + `progress`).

---

### Impacto da Correção

| Antes | Depois |
|-------|--------|
| `data.updatedAt` sempre undefined | `data.updatedAt` reflete o timestamp real do último update |
| Alerta dispara em ~20 polls (60s) | Alerta só dispara se job não atualizar por 60 polls (180s) |

---

### Passos de Implementação

1. Atualizar `supabase/functions/check-import-status/index.ts` para incluir `updatedAt`
2. Redespachar a Edge Function `check-import-status`
3. Testar importação do PDF para verificar se o alerta não dispara antes dos 3 minutos

