

# Plano — Corrigir crash "Cannot read properties of null (reading 'finishReason')"

## Causa raiz

Na implementacao anterior (Operacao A — liberacao de memoria), `visionResult` foi setado para `null` na linha 2632 para liberar RAM antes dos resumos. Porem, **duas referencias a `visionResult.finishReason` ficaram abaixo dessa linha** e nao foram atualizadas:

- **Linha 2703**: `visionResult?.finishReason` — esta usa optional chaining, funciona OK
- **Linha 2714**: `visionResult.finishReason` — **SEM optional chaining**, causa o crash

O fix e salvar o valor de `finishReason` numa variavel antes de anular `visionResult`, e usar essa variavel nas referencias posteriores.

## Operacao unica

Em `supabase/functions/processar-autos/index.ts`:

1. **Antes de `visionResult = null`** (linha 2632), salvar o finishReason:
```typescript
const visionFinishReason = visionResult?.finishReason || 'STOP';
```

2. **Linha 2703**: trocar `visionResult?.finishReason` por `visionFinishReason`
3. **Linha 2714**: trocar `visionResult.finishReason` por `visionFinishReason`

## Escopo

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/processar-autos/index.ts` | 3 linhas alteradas — salvar finishReason antes do null, usar variavel nas 2 referencias posteriores |

Zero risco de efeito colateral. O valor e capturado antes da liberacao de memoria e reutilizado onde necessario.
